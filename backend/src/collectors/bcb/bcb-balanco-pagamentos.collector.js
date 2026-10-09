"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// Balanço de pagamentos (BCB, SGS), mensal: o saldo da balança comercial e o das transações correntes - o fator 26 do
// relatório do Comitê sobre o dólar ("balança comercial e transações correntes"; fase 1 do dólar, só aquisição,
// ADR 0123).
//
// VERIFICADO POR CHAMADA REAL em 2026-10-09:
//   - SGS 22707 = "Balança comercial - Balanço de Pagamentos - mensal - saldo" e SGS 22701 = "Transações correntes -
//     mensal - saldo", US$ milhões, de 1995-01 em diante (380 meses até 2026-08). O dia do ponto é o 1º do mês.
//   - Série mensal: o pedido sem datas devolve a série inteira (o limite de 10 anos da API é das diárias). Por isso
//     cada coleta baixa tudo (~380 pontos por série) e só o que mudou é gravado.
//   - O balanço de pagamentos é REVISADO. A API só traz o valor atual: a revisão vista numa coleta entra como versão
//     nova com a data da coleta (point-in-time.service.js), nunca com a data original.
//
// published_at (ESTIMADO): o último dia do mês seguinte ao de referência. O BCB divulga as estatísticas do setor externo
// por volta do dia 25 do mês seguinte (agosto de 2026 já estava na API em 2026-10-09): o fim do mês nunca antecipa.

const URL_BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
const SOURCE_CODE = "BCB_SGS";
const SERIES = [
  { sgs: 22707, seriesCode: "BCB_SGS.BALANCA_COMERCIAL_BP", nome: "Balança comercial (balanço de pagamentos) - saldo mensal" },
  { sgs: 22701, seriesCode: "BCB_SGS.TRANSACOES_CORRENTES", nome: "Transações correntes - saldo mensal" }
];
const UNIT = "US$ milhões";
const REGEX_DATA_BR = /^01\/(\d{2})\/(\d{4})$/;

// Último dia do mês seguinte ao mês de `dataIso` (AAAA-MM-01).
function fimDoMesSeguinte(dataIso) {
  const [ano, mes] = dataIso.split("-").map(Number);
  // Date.UTC(ano, mes + 1, 0): dia 0 do mês depois do seguinte = último dia do seguinte (mes é 1-based aqui).
  return new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);
}

async function download({ signal, baixarFn = baixar } = {}) {
  const respostas = [];
  for (const serie of SERIES) {
    const texto = await baixarFn(`${URL_BASE}.${serie.sgs}/dados?formato=json`, { signal });
    let corpo;
    try {
      corpo = JSON.parse(texto);
    } catch {
      throw new UpstreamServiceError(`SGS ${serie.sgs}: resposta não é JSON (${String(texto).slice(0, 80).replace(/\s+/g, " ")}).`);
    }
    if (!Array.isArray(corpo)) throw new UpstreamServiceError(`SGS ${serie.sgs}: resposta inesperada (esperava uma lista).`);
    respostas.push({ sgs: serie.sgs, pontos: corpo });
  }
  return respostas;
}

function parse(rawData) {
  if (!Array.isArray(rawData)) throw new UpstreamServiceError("Resposta do SGS em formato inesperado.");
  return rawData.flatMap(({ sgs, pontos }) => pontos.map((ponto) => ({ sgs, ponto })));
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  for (const { sgs, ponto } of itens) {
    const serie = SERIES.find((s) => s.sgs === sgs);
    const data = REGEX_DATA_BR.exec(ponto?.data ?? "");
    const valor = ponto?.valor === null || ponto?.valor === "" ? NaN : Number(ponto?.valor);
    if (!serie || !data) {
      invalidos.push({ item: { sgs, ...ponto }, motivo: `Data em formato inesperado (esperava o 1º do mês): "${ponto?.data}".` });
      continue;
    }
    if (!Number.isFinite(valor)) {
      invalidos.push({ item: { sgs, ...ponto }, motivo: `Valor inválido: "${ponto?.valor}".` });
      continue;
    }
    const observadoEm = `${data[2]}-${data[1]}-01`;
    validos.push({
      series_code: serie.seriesCode,
      observed_at: observadoEm,
      value: valor,
      unit: UNIT,
      source_code: SOURCE_CODE,
      published_at: fimDoDiaUtc(fimDoMesSeguinte(observadoEm)),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: { fonte: "BCB - SGS (balanço de pagamentos)", sgs, regraPublicacao: "fim_do_mes_seguinte" }
    });
  }
  return { validos, invalidos };
}

module.exports = {
  codigo: "bcb-balanco-pagamentos",
  get timeoutMs() {
    return Math.max(env.collectors.sourceTimeoutMs, 60000);
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist: persistirObservacoes,
  fimDoMesSeguinte,
  SERIES
};
