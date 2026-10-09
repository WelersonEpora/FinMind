"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc, somarDias, diaDaSemanaIso } = require("../../shared/utils/date-utils");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// Fluxo cambial contratado (BCB, SGS), diário: o "movimento de câmbio contratado" da Tabela 13 dos Indicadores
// Econômicos Selecionados - o fator 3 do relatório do Comitê sobre o dólar, em parte ("fluxo cambial estrangeiro"; a
// parte do futuro e a custódia de não residentes não estão aqui). Fase 1 do dólar, só aquisição, ADR 0125.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-09:
//   - A Tabela 13 (PDF dos Indicadores Econômicos de 2026-01-07) traz o código SGS de cada coluna, de 13961 a 13970,
//     em US$ milhões, de 2008-09-01 em diante, só em dia útil. O saldo total (13961) é a soma do comercial (13967) com
//     o financeiro (13970): 766,8 = 479,0 + 287,8 em 2026-09-30. Não está no portal de dados abertos (por isso não
//     tinha sido achada): só no SGS.
//   - Divulgação semanal: na sexta 2026-10-09, o último dia na API era a sexta anterior (2026-10-02). O BCB divulga na
//     quarta-feira os dias úteis até a sexta anterior (o PDF de 2026-01-07, uma quarta, ia até 2026-01-02).
//   - Os dados são PRELIMINARES e REVISADOS: operações de até US$ 50 mil podem ser informadas até o dia 5 do mês
//     seguinte, e o mês anterior é revisado na 3ª semana do mês corrente (nota 1 da tabela). A API só traz o valor
//     atual: a revisão vista numa coleta entra como versão nova com a data da coleta (point-in-time.service.js). Por
//     isso a coleta diária relê os últimos JANELA_DIARIA_DIAS dias, não só os novos.
//   - A API do SGS rejeita pedido de mais de 10 anos numa série diária: o backfill divide em janelas.
//
// published_at (ESTIMADO): o fim da quarta-feira da semana seguinte à do dia observado. Não conhece feriado: numa
// quarta de feriado a divulgação passa para o dia útil seguinte e a regra antecipa um dia (documentado no ADR 0125).

const URL_BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
const SOURCE_CODE = "BCB_SGS";
const UNIT = "US$ milhões";
const PRIMEIRA_DATA = "2008-09-01";
// O mês anterior é revisado na 3ª semana do mês corrente: 75 dias cobrem a revisão com folga.
const JANELA_DIARIA_DIAS = 75;
const ANOS_POR_JANELA = 10;
const TIMEOUT_BACKFILL_MS = 10 * 60 * 1000;
// O SGS às vezes devolve HTML ("Requisição inválida!") no lugar de JSON; passa na repetição (visto em 2026-10-09 no
// 13968, como nas reservas e na Selic).
const TENTATIVAS_POR_PEDIDO = 3;
const PAUSA_ENTRE_TENTATIVAS_MS = 2000;
const REGEX_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

// A ordem é a da Tabela 13.
const SERIES = [
  { sgs: 13962, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.EXPORTACAO", nome: "Comercial - exportação de bens (total)" },
  { sgs: 13963, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.EXPORTACAO_ACC", nome: "Comercial - exportação: adiantamento de contrato de câmbio (ACC)" },
  { sgs: 13964, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.EXPORTACAO_PA", nome: "Comercial - exportação: pagamento antecipado (PA)" },
  { sgs: 13965, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.EXPORTACAO_DEMAIS", nome: "Comercial - exportação: demais" },
  { sgs: 13966, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.IMPORTACAO", nome: "Comercial - importação de bens" },
  { sgs: 13967, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.SALDO_COMERCIAL", nome: "Comercial - saldo" },
  { sgs: 13968, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.FINANCEIRO_COMPRAS", nome: "Financeiro - compras" },
  { sgs: 13969, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.FINANCEIRO_VENDAS", nome: "Financeiro - vendas" },
  { sgs: 13970, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.SALDO_FINANCEIRO", nome: "Financeiro - saldo" },
  { sgs: 13961, seriesCode: "BCB_SGS.FLUXO_CAMBIAL.SALDO_TOTAL", nome: "Saldo total (comercial + financeiro)" }
];

function paraIsoDeBr(dataBr) {
  const m = REGEX_DATA_BR.exec(dataBr ?? "");
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? null : iso;
}

function paraBrDeIso(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// A quarta-feira da semana seguinte à do dia `dataIso` (semana de segunda a domingo).
function quartaDaSemanaSeguinte(dataIso) {
  return somarDias(dataIso, 7 - diaDaSemanaIso(dataIso) + 3);
}

// [dataInicial, dataFinal] (ISO) em janelas consecutivas de até 10 anos (limite da API).
function dividirEmJanelas(dataInicial, dataFinal) {
  const janelas = [];
  let inicio = dataInicial;
  while (inicio <= dataFinal) {
    const fimJanela = `${Number(inicio.slice(0, 4)) + ANOS_POR_JANELA - 1}-12-31`;
    const fim = fimJanela < dataFinal ? fimJanela : dataFinal;
    janelas.push({ dataInicial: inicio, dataFinal: fim });
    inicio = `${Number(fim.slice(0, 4)) + 1}-01-01`;
  }
  return janelas;
}

async function baixarPedido(serie, janela, { signal, baixarFn, esperar }) {
  const url = `${URL_BASE}.${serie.sgs}/dados?formato=json&dataInicial=${paraBrDeIso(janela.dataInicial)}&dataFinal=${paraBrDeIso(janela.dataFinal)}`;
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      const texto = await baixarFn(url, { signal });
      let corpo;
      try {
        corpo = JSON.parse(texto);
      } catch {
        throw new UpstreamServiceError(`SGS ${serie.sgs}: resposta não é JSON (${String(texto).slice(0, 80).replace(/\s+/g, " ")}).`);
      }
      if (!Array.isArray(corpo)) throw new UpstreamServiceError(`SGS ${serie.sgs}: resposta inesperada (esperava uma lista).`);
      return corpo;
    } catch (err) {
      if (tentativa >= TENTATIVAS_POR_PEDIDO || signal?.aborted) throw err;
      await esperar(PAUSA_ENTRE_TENTATIVAS_MS);
    }
  }
}

// As 10 séries no intervalo, cada uma em janelas de até 10 anos.
async function downloadIntervalo({
  dataInicial = PRIMEIRA_DATA,
  dataFinal = new Date().toISOString().slice(0, 10),
  signal,
  baixarFn = baixar,
  esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  const respostas = [];
  for (const serie of SERIES) {
    const pontos = [];
    for (const janela of dividirEmJanelas(dataInicial, dataFinal)) {
      pontos.push(...(await baixarPedido(serie, janela, { signal, baixarFn, esperar })));
    }
    respostas.push({ sgs: serie.sgs, pontos });
  }
  return respostas;
}

// Coleta diária: os últimos JANELA_DIARIA_DIAS dias (os novos e as revisões).
function download({ signal, baixarFn, esperar, hoje = new Date().toISOString().slice(0, 10) } = {}) {
  return downloadIntervalo({ dataInicial: somarDias(hoje, -JANELA_DIARIA_DIAS), dataFinal: hoje, signal, baixarFn, esperar });
}

function parse(rawData) {
  if (!Array.isArray(rawData)) throw new UpstreamServiceError("Resposta do SGS em formato inesperado.");
  return rawData.flatMap(({ sgs, pontos }) => pontos.map((ponto) => ({ sgs, ponto })));
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  const vistos = new Set();
  for (const { sgs, ponto } of itens) {
    const serie = SERIES.find((s) => s.sgs === sgs);
    const data = paraIsoDeBr(ponto?.data);
    const valor = ponto?.valor === null || ponto?.valor === "" ? NaN : Number(ponto?.valor);
    if (!serie || !data) {
      invalidos.push({ item: { sgs, ...ponto }, motivo: `Data em formato inesperado: "${ponto?.data}".` });
      continue;
    }
    if (!Number.isFinite(valor)) {
      invalidos.push({ item: { sgs, ...ponto }, motivo: `Valor inválido: "${ponto?.valor}".` });
      continue;
    }
    const chave = `${sgs}|${data}`;
    if (vistos.has(chave)) {
      invalidos.push({ item: { sgs, ...ponto }, motivo: `Data repetida na resposta do SGS: ${data}.` });
      continue;
    }
    vistos.add(chave);
    validos.push({
      series_code: serie.seriesCode,
      observed_at: data,
      value: valor,
      unit: UNIT,
      source_code: SOURCE_CODE,
      published_at: fimDoDiaUtc(quartaDaSemanaSeguinte(data)),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: { fonte: "BCB - SGS (câmbio contratado)", sgs, regraPublicacao: "quarta_da_semana_seguinte" }
    });
  }
  return { validos, invalidos };
}

module.exports = {
  codigo: "bcb-fluxo-cambial",
  get timeoutMs() {
    return Math.max(env.collectors.bcbSgsTimeoutMs, 120000);
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist: persistirObservacoes,
  dividirEmJanelas,
  quartaDaSemanaSeguinte,
  SERIES,
  PRIMEIRA_DATA,
  JANELA_DIARIA_DIAS,
  TIMEOUT_BACKFILL_MS
};
