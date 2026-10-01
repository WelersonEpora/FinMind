"use strict";

const env = require("../../config/env");
const { somarDias, diaDaSemanaIso, fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes } = require("../base/persist-observations");
const { paraIsoDeDataEia, divulgacaoDaSemana, baixarPlanilhasECalendario, itensDasPlanilhas, lerNumero } = require("./eia-wpsr");

// EIA - petróleo dos EUA, pelas mesmas planilhas do Weekly Petroleum Status Report (WPSR) que o coletor do etanol
// usa (`eia-wpsr.js`, ADR 0024). Fatores do petróleo do FEL 1 (`controle_fatores.xlsx`): "Estoques de petróleo dos EUA
// (EIA)" (Alto), "Produção dos EUA (shale)" (Médio), "Refino e margens" (Médio) e o preço (FEL 1, §6.5.2). ADR 0040.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01 (sem chave; nome oficial lido na linha de cabeçalho de cada planilha):
//   - SEMANAIS (semana encerrada na sexta), 11 séries: estoques de petróleo (sem a SPR, na SPR, em Cushing), de
//     gasolina e de destilados; produção de petróleo; entrada de petróleo nas refinarias; utilização das refinarias;
//     importação e exportação de petróleo; total de derivados fornecidos (a medida de consumo do WPSR). Desde 1982 a
//     2004, conforme a série; última semana 2026-09-25.
//   - DIÁRIAS, 4 preços à vista: WTI em Cushing e Brent (US$/barril), gasolina convencional e diesel S10 no porto de
//     Nova York (US$/galão). WTI desde 1986-01-02, Brent desde 1987-05-20; último dia 2026-09-29.
//   - TODAS as planilhas tinham `Last-Modified` de quarta 2026-09-30, 14:42-14:45 UTC (10:43 ET, logo depois do
//     WPSR): os preços DIÁRIOS saem UMA VEZ POR SEMANA, junto com o WPSR, com os dias até a terça anterior.
//   - Os futuros da NYMEX (RCLC1 a 4) pararam em 2024-04-05 na EIA: não são coletados.
//
// published_at (ESTIMADO, regra do etanol):
//   - semanal: a quarta seguinte à sexta da semana (quinta com feriado; o calendário oficial de feriados vence);
//   - diário: o dia D entra na divulgação da semana cuja terça-feira de fechamento é a 1ª terça >= D (a sexta dessa
//     semana = terça - 4). Medido numa divulgação só (2026-09-30, dados até 2026-09-29): regra a confirmar.
//   Sempre o fim do dia (UTC). A planilha traz só o valor atual (sem versões): revisão vira versão nova (ADR 0008).
//   Os preços podem ser NEGATIVOS (o WTI fechou a -36,98 em 2020-04-20): só estoques e volumes recusam negativo.

const SOURCE_CODE = "EIA";
const PREFIXO_ESTOQUES = "EIA.PETROLEO_ESTOQUES";
const PREFIXO_FLUXOS = "EIA.PETROLEO_FLUXOS";
const PREFIXO_PRECOS = "EIA.PETROLEO_PRECOS";

const semanal = (prefixo, sourcekey, campo, unit, nome) => ({ prefixo, sourcekey, campo, unit, nome, sufixoArquivo: "w", diaria: false });
const diaria = (prefixo, sourcekey, campo, unit, nome) => ({ prefixo, sourcekey, campo, unit, nome, sufixoArquivo: "d", diaria: true });

const SERIES = [
  semanal(PREFIXO_ESTOQUES, "WCESTUS1", "PETROLEO_SEM_SPR", "mil barris", "Weekly U.S. Ending Stocks excluding SPR of Crude Oil"),
  semanal(PREFIXO_ESTOQUES, "WCSSTUS1", "PETROLEO_SPR", "mil barris", "Weekly U.S. Ending Stocks of Crude Oil in SPR"),
  semanal(PREFIXO_ESTOQUES, "W_EPC0_SAX_YCUOK_MBBL", "PETROLEO_CUSHING", "mil barris", "Weekly Cushing, OK Ending Stocks excluding SPR of Crude Oil"),
  semanal(PREFIXO_ESTOQUES, "WGTSTUS1", "GASOLINA", "mil barris", "Weekly U.S. Ending Stocks of Total Gasoline"),
  semanal(PREFIXO_ESTOQUES, "WDISTUS1", "DESTILADOS", "mil barris", "Weekly U.S. Ending Stocks of Distillate Fuel Oil"),
  semanal(PREFIXO_FLUXOS, "WCRFPUS2", "PRODUCAO", "mil barris/dia", "Weekly U.S. Field Production of Crude Oil"),
  semanal(PREFIXO_FLUXOS, "WCRRIUS2", "ENTRADA_REFINARIAS", "mil barris/dia", "Weekly U.S. Refiner Net Input of Crude Oil"),
  semanal(PREFIXO_FLUXOS, "WPULEUS3", "UTILIZACAO_REFINARIAS", "%", "Weekly U.S. Percent Utilization of Refinery Operable Capacity"),
  semanal(PREFIXO_FLUXOS, "WCRIMUS2", "IMPORTACAO", "mil barris/dia", "Weekly U.S. Imports of Crude Oil"),
  semanal(PREFIXO_FLUXOS, "WCREXUS2", "EXPORTACAO", "mil barris/dia", "Weekly U.S. Exports of Crude Oil"),
  semanal(PREFIXO_FLUXOS, "WRPUPUS2", "DERIVADOS_FORNECIDOS", "mil barris/dia", "Weekly U.S. Product Supplied of Petroleum Products"),
  diaria(PREFIXO_PRECOS, "RWTC", "WTI", "US$/barril", "Cushing, OK WTI Spot Price FOB"),
  diaria(PREFIXO_PRECOS, "RBRTE", "BRENT", "US$/barril", "Europe Brent Spot Price FOB"),
  diaria(PREFIXO_PRECOS, "EER_EPMRU_PF4_Y35NY_DPG", "GASOLINA_NY", "US$/galão", "New York Harbor Conventional Gasoline Regular Spot Price FOB"),
  diaria(PREFIXO_PRECOS, "EER_EPD2DXL0_PF4_Y35NY_DPG", "DIESEL_NY", "US$/galão", "New York Harbor Ultra-Low Sulfur No 2 Diesel Spot Price")
];

// Sexta da semana do WPSR que divulga o preço do dia D: a da 1ª terça >= D, menos 4 dias.
function semanaDoPreco(dia) {
  const terca = somarDias(dia, (2 - diaDaSemanaIso(dia) + 7) % 7);
  return somarDias(terca, -4);
}

function download({ signal, fetchFn } = {}) {
  return baixarPlanilhasECalendario(SERIES, { signal, fetchFn });
}

function parse(rawData) {
  return itensDasPlanilhas(rawData, SERIES);
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  for (const { serie, data, valor, excecoes } of itens) {
    const item = { sourcekey: serie.sourcekey, data, valor };
    const observado = paraIsoDeDataEia(data);
    if (!observado) {
      invalidos.push({ item, motivo: `Data em formato inesperado: "${data}".` });
      continue;
    }
    const dow = diaDaSemanaIso(observado);
    if (serie.diaria ? dow > 5 : dow !== 5) {
      const esperado = serie.diaria ? "um dia útil (segunda a sexta)" : "uma sexta (semana encerrada na sexta)";
      invalidos.push({ item, motivo: `Data ${observado} não é ${esperado}.` });
      continue;
    }
    const value = lerNumero(valor);
    if (!Number.isFinite(value) || (!serie.diaria && value < 0)) {
      invalidos.push({ item, motivo: `Valor inválido: "${valor}".` });
      continue;
    }

    const semana = serie.diaria ? semanaDoPreco(observado) : observado;
    const divulgacao = divulgacaoDaSemana(semana, excecoes);
    validos.push({
      series_code: `${serie.prefixo}.${serie.campo}`,
      observed_at: observado,
      value,
      unit: serie.unit,
      source_code: SOURCE_CODE,
      published_at: fimDoDiaUtc(divulgacao.data),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: {
        fonte: "EIA - Weekly Petroleum Status Report",
        sourcekey: serie.sourcekey,
        serie: serie.nome,
        semanaDoWpsr: semana,
        regraPublicacao: divulgacao.pelaRegra ? "quarta_ou_quinta_com_feriado" : "calendario_oficial_de_feriados"
      }
    });
  }
  return { validos, invalidos };
}

module.exports = {
  codigo: "eia-petroleo",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist: persistirObservacoes,
  semanaDoPreco,
  SERIES,
  PREFIXO_ESTOQUES,
  PREFIXO_FLUXOS,
  PREFIXO_PRECOS
};
