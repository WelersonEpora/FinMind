"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarColetorFuturoYahoo } = require("./yahoo-futuro.collector");

// O molde é o mesmo do Brent (yahoo-brent-futuro.collector.test.js cobre o download, os erros e a faixa do dia); aqui,
// o que muda no café arábica da ICE (KC, ADR 0129).
const kc = criarColetorFuturoYahoo("kc");

// 2026-10-20, 10:00 em Nova York (14:00 UTC): o pregão de hoje está aberto.
const AGORA = new Date("2026-10-20T14:00:00Z");
// Meia-noite de Nova York (EDT), como o Yahoo marca a barra diária.
const t = (data) => Date.parse(`${data}T04:00:00Z`) / 1000;

function corpo(simbolo, pontos, meta = {}) {
  return {
    chart: {
      result: [
        {
          meta: { currency: "USX", symbol: simbolo, exchangeName: "NYB", ...meta },
          timestamp: pontos.map(([data]) => t(data)),
          indicators: {
            quote: [{ close: pontos.map((p) => p[1]), high: pontos.map((p) => p[2] ?? null), low: pontos.map((p) => p[3] ?? null) }]
          }
        }
      ],
      error: null
    }
  };
}

test("produto desconhecido é erro de configuração", () => {
  assert.throws(() => criarColetorFuturoYahoo("cacau"), /Produto do Yahoo desconhecido: cacau/);
});

test("KC: código próprio e só os 5 meses do café (março, maio, julho, setembro e dezembro), com o do mês atual", () => {
  assert.equal(kc.codigo, "yahoo-kc-futuro");
  assert.equal(kc.PREFIXO_SERIE, "YAHOO.KC");
  assert.equal(kc.SERIE_CONTINUA, "YAHOO.KC_CONTINUO.SETTLE");
  // Os listados em 2026-10-20: do Z26 ao H28.
  assert.deepEqual(kc.tickersAFrente(AGORA), ["KCZ26", "KCH27", "KCK27", "KCN27", "KCU27", "KCZ27", "KCH28"]);
  // Em dezembro, o Z26 ainda negocia até perto do meio do mês: o mês atual entra.
  assert.equal(kc.tickersAFrente(new Date("2026-12-05T14:00:00Z"))[0], "KCZ26");
});

test("KC: um pedido por vencimento e a contínua KC=F, com o sufixo da ICE no Yahoo", async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    return { status: 200, ok: true, text: async () => JSON.stringify(corpo("x", [])) };
  };
  await kc.download({ agora: AGORA, fetchFn, esperar: async () => {} });
  assert.equal(urls.length, 8);
  assert.match(urls[0], /\/KCZ26\.NYB\?range=1mo&interval=1d$/);
  assert.match(urls.at(-1), /\/KC%3DF\?range=1mo&interval=1d$/);
});

test("KC: parse + normalize em centavos de dólar por libra-peso, com a ICE na metadata; o pregão de hoje fica de fora", () => {
  // Valores reais do Yahoo (2026-10-20): o KCH27 de 16 e 19/10 com a faixa do dia e o 20/10 parcial.
  const bruto = {
    agora: AGORA.toISOString(),
    respostas: [
      {
        simbolo: "KCH27.NYB",
        ticker: "KCH27",
        corpo: corpo("KCH27.NYB", [
          ["2026-10-16", 294.5, 296.1, 290.2],
          ["2026-10-19", 302.25, 304.45001220703125, 296.79998779296875],
          ["2026-10-20", 297.95001220703125, 299, 296.5]
        ])
      },
      { simbolo: "KC=F", ticker: null, corpo: corpo("KC=F", [["2026-10-19", 315.70001220703125]]) }
    ]
  };
  const { validos, invalidos, detalhes } = kc.normalize(kc.parse(bruto));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value]),
    [
      ["YAHOO.KC.KCH27.SETTLE", "2026-10-16", 294.5],
      ["YAHOO.KC.KCH27.HIGH", "2026-10-16", 296.1],
      ["YAHOO.KC.KCH27.LOW", "2026-10-16", 290.2],
      ["YAHOO.KC.KCH27.SETTLE", "2026-10-19", 302.25],
      ["YAHOO.KC.KCH27.HIGH", "2026-10-19", 304.45],
      ["YAHOO.KC.KCH27.LOW", "2026-10-19", 296.8],
      ["YAHOO.KC_CONTINUO.SETTLE", "2026-10-19", 315.7]
    ]
  );
  assert.deepEqual(detalhes, { pregaoEmAndamentoIgnorado: 1 });
  const [primeiro] = validos;
  assert.equal(primeiro.unit, "US¢/lb");
  assert.equal(primeiro.source_code, "YAHOO");
  assert.deepEqual(primeiro.metadata, {
    fonte: "Yahoo Finance (chart v8, não oficial)",
    simbolo: "KCH27.NYB",
    bolsa: "ICE Futures U.S.",
    ticker: "KCH27",
    vencimento: "2027-03",
    regraPublicacao: "fim_do_dia_do_pregao_ny"
  });
});

test("KC: moeda ou bolsa diferente da ICE (centavos, NYB) é erro da fonte", () => {
  const emDolar = { agora: AGORA.toISOString(), respostas: [{ simbolo: "KCZ26.NYB", ticker: "KCZ26", corpo: corpo("KCZ26.NYB", [["2026-10-19", 3.157]], { currency: "USD" }) }] };
  assert.throws(() => kc.parse(emDolar), /resposta inesperada \(símbolo KCZ26\.NYB, moeda USD, bolsa NYB\)/);
  const nenhum = { agora: AGORA.toISOString(), respostas: [{ simbolo: "KCZ26.NYB", ticker: "KCZ26", corpo: null }, { simbolo: "KC=F", ticker: null, corpo: null }] };
  assert.throws(() => kc.parse(nenhum), /nenhum dos 1 vencimentos pedidos do café arábica \(KC\)/);
});
