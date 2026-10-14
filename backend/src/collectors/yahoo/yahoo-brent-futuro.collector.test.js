"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./yahoo-brent-futuro.collector");

// 2026-10-07, 10:46 em Nova York (14:46 UTC): o pregão de hoje está aberto.
const AGORA = new Date("2026-10-07T14:46:00Z");
// Meia-noite de Nova York (EDT), como o Yahoo marca a barra diária.
const t = (data) => Date.parse(`${data}T04:00:00Z`) / 1000;

// Valores reais do Yahoo (2026-10-07): o 06/10 com o ajuste e o 07/10 parcial; o null é o defeito conhecido.
function corpo(simbolo, pontos) {
  return {
    chart: {
      result: [
        {
          meta: { currency: "USD", symbol: simbolo, exchangeName: "NYM" },
          timestamp: pontos.map(([data]) => t(data)),
          indicators: { quote: [{ close: pontos.map(([, valor]) => valor) }] }
        }
      ],
      error: null
    }
  };
}
const NAO_ENCONTRADO = { chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } };

function resposta(status, json) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(json) };
}

test("tickersAFrente: os 13 meses seguintes ao atual em Nova York", () => {
  const tickers = collector.tickersAFrente(AGORA);
  assert.equal(tickers.length, 13);
  assert.equal(tickers[0], "BZX26"); // novembro: já vencido (dá Not Found), pedido por segurança
  assert.equal(tickers[1], "BZZ26");
  assert.equal(tickers[2], "BZF27");
  assert.equal(tickers.at(-1), "BZX27");
  // 23:30 de 31/10 em Nova York já é 01/11 em UTC: vale o mês de Nova York.
  assert.equal(collector.tickersAFrente(new Date("2026-11-01T03:30:00Z"))[0], "BZX26");
});

test("download: um pedido por vencimento e a contínua; vencimento inexistente vira null", async () => {
  const urls = [];
  const fetchFn = async (url, { headers }) => {
    urls.push(url);
    assert.match(headers["user-agent"], /^FinMind/);
    const simbolo = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1).split("?")[0]);
    return simbolo === "BZX26.NYM" ? resposta(404, NAO_ENCONTRADO) : resposta(200, corpo(simbolo, [["2026-10-06", 100.58]]));
  };
  const bruto = await collector.download({ agora: AGORA, fetchFn, esperar: async () => {} });

  assert.equal(urls.length, 14);
  assert.match(urls[0], /\/BZX26\.NYM\?range=1mo&interval=1d$/);
  assert.match(urls.at(-1), /\/BZ%3DF\?range=1mo&interval=1d$/);
  assert.equal(bruto.agora, AGORA.toISOString());
  assert.equal(bruto.respostas[0].corpo, null);
  assert.equal(bruto.respostas.at(-1).ticker, null);
});

test("download: 429 ou resposta sem JSON é erro da fonte", async () => {
  await assert.rejects(
    collector.download({ agora: AGORA, fetchFn: async () => resposta(429, { erro: 1 }), esperar: async () => {} }),
    /status 429/
  );
  const semJson = async () => ({ status: 429, ok: false, text: async () => "Edge: Too Many Requests" });
  await assert.rejects(collector.download({ agora: AGORA, fetchFn: semJson, esperar: async () => {} }), /sem JSON: Edge: Too Many Requests/);
});

test("parse + normalize: ajuste por vencimento e contínua; o pregão de hoje e o dia sem fechamento ficam de fora", () => {
  const bruto = {
    agora: AGORA.toISOString(),
    respostas: [
      { simbolo: "BZX26.NYM", ticker: "BZX26", corpo: null },
      {
        simbolo: "BZZ26.NYM",
        ticker: "BZZ26",
        corpo: corpo("BZZ26.NYM", [
          ["2026-10-05", 100.31999969482422],
          ["2026-10-06", 100.58000183105469],
          ["2026-10-07", 101.98999786376953]
        ])
      },
      { simbolo: "BZ=F", ticker: null, corpo: corpo("BZ=F", [["2026-09-30", 103.52999877929688], ["2026-10-01", null]]) }
    ]
  };
  const { validos, invalidos, avisos, detalhes } = collector.normalize(collector.parse(bruto));

  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value]),
    [
      ["YAHOO.BZ.BZZ26.SETTLE", "2026-10-05", 100.32],
      ["YAHOO.BZ.BZZ26.SETTLE", "2026-10-06", 100.58],
      ["YAHOO.BZ_CONTINUO.SETTLE", "2026-09-30", 103.53]
    ]
  );
  assert.deepEqual(detalhes, { pregaoEmAndamentoIgnorado: 1 });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].motivo, /^1 dia\(s\) sem fechamento/);

  const [primeiro] = validos;
  assert.equal(primeiro.unit, "US$/barril");
  assert.equal(primeiro.source_code, "YAHOO");
  // Fim do dia do pregão em Nova York (EDT, UTC-4).
  assert.equal(primeiro.published_at.toISOString(), "2026-10-06T03:59:59.000Z");
  assert.equal(primeiro.published_at_is_estimated, true);
  assert.equal(primeiro.published_at_basis, "lag_rule");
  assert.deepEqual(primeiro.metadata, {
    fonte: "Yahoo Finance (chart v8, não oficial)",
    simbolo: "BZZ26.NYM",
    bolsa: "NYMEX",
    ticker: "BZZ26",
    vencimento: "2026-12",
    regraPublicacao: "fim_do_dia_do_pregao_ny"
  });
  assert.equal(validos.at(-1).metadata.serieContinua, "1º vencimento, montada pelo Yahoo");
});

test("normalize: data repetida e fechamento não numérico viram inválidos sem derrubar o lote", () => {
  const itens = [
    { serie: "YAHOO.BZ.BZZ26.SETTLE", simbolo: "BZZ26.NYM", ticker: "BZZ26", data: "2026-10-05", valor: 100.32, parcial: false },
    { serie: "YAHOO.BZ.BZZ26.SETTLE", simbolo: "BZZ26.NYM", ticker: "BZZ26", data: "2026-10-05", valor: 100.32, parcial: false },
    { serie: "YAHOO.BZ.BZZ26.SETTLE", simbolo: "BZZ26.NYM", ticker: "BZZ26", data: "2026-10-06", valor: "x", parcial: false }
  ];
  const { validos, invalidos } = collector.normalize(itens);
  assert.equal(validos.length, 1);
  assert.deepEqual(
    invalidos.map((i) => i.motivo),
    ["BZZ26.NYM: data repetida na resposta do Yahoo (2026-10-05).", 'BZZ26.NYM 2026-10-06: fechamento inválido ("x").']
  );
});

test("parse: nenhum vencimento encontrado ou símbolo trocado é erro da fonte", () => {
  const semVencimento = {
    agora: AGORA.toISOString(),
    respostas: [
      { simbolo: "BZZ26.NYM", ticker: "BZZ26", corpo: null },
      { simbolo: "BZ=F", ticker: null, corpo: corpo("BZ=F", [["2026-10-06", 100.58]]) }
    ]
  };
  assert.throws(() => collector.parse(semVencimento), /não tem nenhum dos 1 vencimentos/);

  const trocado = { agora: AGORA.toISOString(), respostas: [{ simbolo: "BZZ26.NYM", ticker: "BZZ26", corpo: corpo("CLZ26.NYM", [["2026-10-06", 90]]) }] };
  assert.throws(() => collector.parse(trocado), /resposta inesperada \(símbolo CLZ26\.NYM/);
  assert.throws(() => collector.parse({}), /formato inesperado/);
});

test("normalize: a máxima e a mínima por vencimento (não na contínua); a faixa incoerente fica de fora, com aviso", () => {
  const comFaixa = (simbolo, pontos) => {
    const c = corpo(simbolo, pontos.map(([data, fechamento]) => [data, fechamento]));
    c.chart.result[0].indicators.quote[0].high = pontos.map((p) => p[2]);
    c.chart.result[0].indicators.quote[0].low = pontos.map((p) => p[3]);
    return c;
  };
  // Valores reais do BZF27 (09/10/2026) e um dia com a máxima abaixo do ajuste.
  const bruto = {
    agora: "2026-10-14T14:46:00Z",
    respostas: [
      { simbolo: "BZF27.NYM", ticker: "BZF27", corpo: comFaixa("BZF27.NYM", [["2026-10-09", 101.25, 101.51000213623047, 99.20999908447266], ["2026-10-12", 103.2, 103.1, 99.01]]) },
      { simbolo: "BZ=F", ticker: null, corpo: comFaixa("BZ=F", [["2026-10-09", 101.25, 101.51, 99.21]]) }
    ]
  };
  const { validos, avisos } = collector.normalize(collector.parse(bruto));
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value]),
    [
      ["YAHOO.BZ.BZF27.SETTLE", "2026-10-09", 101.25],
      ["YAHOO.BZ.BZF27.HIGH", "2026-10-09", 101.51],
      ["YAHOO.BZ.BZF27.LOW", "2026-10-09", 99.21],
      ["YAHOO.BZ.BZF27.SETTLE", "2026-10-12", 103.2],
      ["YAHOO.BZ_CONTINUO.SETTLE", "2026-10-09", 101.25]
    ]
  );
  assert.match(avisos[0].motivo, /^1 dia\(s\) com a máxima e a mínima incoerentes/);
});
