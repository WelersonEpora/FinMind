"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// LBMA Gold Price PM - feed JSON público do site da LBMA (histórico desde
// 1968-04-01, verificado em 2026-09-20: 14.686 pontos até 2026-09-18).
// Cada item: { d: "YYYY-MM-DD", v: [USD, GBP, EUR] }. Só o USD é coletado.
//
// RESSALVA DE LICENÇA (não bloqueia o MVP, mas precisa de decisão antes de
// EXIBIR/REDISTRIBUIR): o LBMA Gold Price é administrado pela ICE Benchmark
// Administration (IBA) e o histórico tabulado "oficial" exige licença da IBA
// (portal MyLBMA). O feed JSON usado aqui é público, mas os termos de uso
// comercial NÃO foram confirmados. Uso atual: pesquisa/experimento interno.
//
// published_at: a fonte não informa quando publicou. O PM Price é fixado no
// leilão das 15:00 (Londres) e divulgado logo em seguida - usamos as 15:00
// de Londres do próprio dia como estimativa (marcada estimada). É um limite
// otimista de poucos minutos; o modo `estrito` do asOf() não depende dele.

const URL_FEED = "https://prices.lbma.org.uk/json/gold_pm.json";
const SERIES_CODE = "LBMA.GOLD_PM.USD";
const SOURCE_CODE = "LBMA";

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta da LBMA em formato inesperado (esperava um array).");
  }
  // v[0] é null em datas sem leilão - não é observação.
  return rawData.filter((item) => Array.isArray(item?.v) && item.v[0] !== null && item.v[0] !== undefined);
}

function normalize(rawItems) {
  const validos = [];
  const invalidos = [];

  for (const item of rawItems) {
    const valor = Number(item.v[0]);
    if (!REGEX_DATA.test(item.d)) {
      invalidos.push({ item, motivo: `Data em formato inesperado: "${item.d}".` });
      continue;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      invalidos.push({ item, motivo: `Valor inválido: "${item.v[0]}".` });
      continue;
    }

    validos.push({
      series_code: SERIES_CODE,
      observed_at: item.d,
      value: valor,
      unit: "USD/oz",
      source_code: SOURCE_CODE,
      published_at: zonedParaUtc(item.d, "15:00", "Europe/London"),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: { fonte: "LBMA Gold Price PM", regraPublicacao: "leilao_15h_londres_mesmo_dia" }
    });
  }

  return { validos, invalidos };
}

module.exports = {
  codigo: "lbma-gold-pm-usd",
  seriesCode: SERIES_CODE,
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download: ({ signal }) => baixar(URL_FEED, { signal, as: "json" }),
  parse,
  normalize,
  persist: persistirObservacoes
};
