"use strict";

const env = require("../../config/env");
const { diaDaSemanaIso, fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes } = require("../base/persist-observations");
const {
  paraIsoDeDataEia,
  divulgacaoPelaRegra,
  divulgacaoDaSemana,
  extrairExcecoes,
  feriadosFederaisEUA,
  lerPlanilha,
  baixarPlanilhasECalendario,
  itensDasPlanilhas,
  lerNumero
} = require("./eia-wpsr");

// EIA (U.S. Energy Information Administration) - produção e estoques SEMANAIS de etanol combustível dos EUA, do
// Weekly Petroleum Status Report (WPSR). Fator do milho "Demanda de etanol e biocombustível" do FEL 1
// (`controle_fatores.xlsx`: fontes "EIA, USDA"; dados "Produção de etanol, estoques"). ADR 0024.
//
// VERIFICADO POR CHAMADA REAL em 2026-09-23:
//   - A API v2 (api.eia.gov) exige chave (403 API_KEY_MISSING). O MESMO dado sai, sem chave, na planilha histórica de
//     cada série (`/dnav/pet/hist_xls/<SOURCEKEY>w.xls`, ~65 KB, aba "Data 1": data da semana + valor); `robots.txt` não
//     restringe `/dnav/`. Semanas desde 2010-06-04, encerradas na sexta.
//   - W_EPOOXE_YOP_NUS_MBBLD = "Weekly U.S. Oxygenate Plant Production of Fuel Ethanol (Thousand Barrels per Day)";
//     W_EPOOXE_SAE_NUS_MBBL = "Weekly U.S. Ending Stocks of Fuel Ethanol (Thousand Barrels)".
//   - Na quarta 23/09/2026 a última semana era a de sexta 18/09 (`Last-Modified` 15:49 UTC).
//
// published_at (ESTIMADO): as tabelas XLS saem "após 10:30 ET de quarta" (página oficial de calendário do WPSR), e
// em semanas com feriado a divulgação atrasa. Vale, nesta ordem: (1) a data alternativa da própria página de
// calendário (exceções de feriado, ~2 anos), lida a cada coleta; (2) a regra: quarta seguinte à sexta da semana,
// quinta se houver feriado federal de segunda a quarta. Sempre o FIM DO DIA (UTC) - conservador em relação às
// 10:30-17:00 ET. Limite conhecido: fechamentos extraordinários (ex.: Natal de 2025, divulgado 10 dias depois) só são
// conhecidos pela página, então no histórico antigo a regra pode antecipar semanas de Natal/Ano-Novo.
//
// A planilha traz só o valor ATUAL de cada semana (sem versões): uma revisão que apareça depois vira versão nova com
// `collected_at` (ADR 0008). A coleta baixa a série inteira (2 x ~65 KB): a primeira execução já é a carga histórica.

// (Download, calendário de feriados e leitura da planilha: `eia-wpsr.js`, comum ao coletor do petróleo, ADR 0040.)

const SOURCE_CODE = "EIA";
const PREFIXO_SERIE = "EIA.ETANOL";

const SERIES = [
  { sourcekey: "W_EPOOXE_YOP_NUS_MBBLD", campo: "PRODUCAO", unit: "mil barris/dia", nome: "Weekly U.S. Oxygenate Plant Production of Fuel Ethanol" },
  { sourcekey: "W_EPOOXE_SAE_NUS_MBBL", campo: "ESTOQUES", unit: "mil barris", nome: "Weekly U.S. Ending Stocks of Fuel Ethanol" }
];

// As duas planilhas + a página de calendário. A página é complementar: se falhar, segue só com a regra.
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
    const semana = paraIsoDeDataEia(data);
    if (!semana) {
      invalidos.push({ item: { sourcekey: serie.sourcekey, data, valor }, motivo: `Data em formato inesperado: "${data}".` });
      continue;
    }
    if (diaDaSemanaIso(semana) !== 5) {
      invalidos.push({ item: { sourcekey: serie.sourcekey, data, valor }, motivo: `Semana ${semana} não termina numa sexta (a série é de semanas encerradas na sexta).` });
      continue;
    }
    const value = lerNumero(valor);
    if (!Number.isFinite(value) || value < 0) {
      invalidos.push({ item: { sourcekey: serie.sourcekey, data, valor }, motivo: `Valor inválido: "${valor}".` });
      continue;
    }

    const divulgacao = divulgacaoDaSemana(semana, excecoes);
    validos.push({
      series_code: `${PREFIXO_SERIE}.${serie.campo}`,
      observed_at: semana,
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
        semanaEncerradaEm: semana,
        regraPublicacao: divulgacao.pelaRegra ? "quarta_ou_quinta_com_feriado" : "calendario_oficial_de_feriados"
      }
    });
  }
  return { validos, invalidos };
}
module.exports = {
  codigo: "eia-etanol",
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
  paraIsoDeDataEia,
  divulgacaoPelaRegra,
  extrairExcecoes,
  feriadosFederaisEUA,
  lerPlanilha,
  SERIES,
  SOURCE_CODE,
  PREFIXO_SERIE
};
