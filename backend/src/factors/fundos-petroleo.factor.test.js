"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, percentil, derivarFundosPetroleo, calcularFundosPetroleo, explicarFundos } = require("./fundos-petroleo.factor");

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Uma semana do COT (terça): comprados, vendidos e contratos em aberto.
function semana(observedAt, comprados, vendidos, contratosEmAberto = 1000000) {
  const linha = (seriesCode, value) => ({ seriesCode, observedAt, value, publishedAt: new Date(`${somarDias(observedAt, 3)}T19:30:00Z`), publishedAtIsEstimated: false });
  return [linha(SERIES.comprados, comprados), linha(SERIES.vendidos, vendidos), linha(SERIES.contratosEmAberto, contratosEmAberto)];
}

// `semanas` terças seguidas a partir de 2023-01-03; a posição líquida (em contratos, sobre 1 milhão em aberto) de cada
// uma vem de `liquida(i)`.
function historico(semanas, liquida) {
  return Array.from({ length: semanas }, (_, i) => semana(somarDias("2023-01-03", 7 * i), 200000 + liquida(i), 200000)).flat();
}

test("percentil: onde o valor fica entre os anteriores, empates contam meio", () => {
  assert.equal(percentil(5, [1, 2, 3, 4]), 100);
  assert.equal(percentil(0, [1, 2, 3, 4]), 0);
  assert.equal(percentil(2, [1, 2, 3, 4]), 37.5);
});

test("A: a posição líquida, a variação semanal e a líquida em % dos contratos em aberto; semana incompleta fica de fora", () => {
  const linhas = [...semana("2026-09-22", 300000, 100000, 2000000), ...semana("2026-09-29", 280000, 120000, 2000000)];
  linhas.push({ seriesCode: SERIES.comprados, observedAt: "2026-10-06", value: 1, publishedAt: new Date(), publishedAtIsEstimated: false });
  const pontos = derivarFundosPetroleo(linhas);
  assert.equal(pontos.length, 2);
  const ultimo = pontos.at(-1);
  assert.equal(ultimo.liquida, 160000);
  assert.equal(ultimo.variacaoSemanal, -40000);
  assert.equal(ultimo.liquidaPctOi, 8);
  assert.equal(ultimo.percentilJanela, null);
  assert.equal(ultimo.decisao, null);
  assert.equal(ultimo.disponivelEm.toISOString(), "2026-10-02T19:30:00.000Z");
});

test("B: o percentil é contra as 156 semanas anteriores; com menos de 150 delas, nulo", () => {
  const pontos = derivarFundosPetroleo(historico(157, (i) => (i < 156 ? i * 100 : 99999)));
  const ultimo = pontos.at(-1);
  assert.equal(ultimo.percentilJanela, 100);
  assert.equal(ultimo.posicaoRelativa, 50);
  assert.ok(ultimo.p10Janela < ultimo.medianaJanela && ultimo.medianaJanela < ultimo.p90Janela);
  assert.equal(derivarFundosPetroleo(historico(140, (i) => i * 100)).at(-1).percentilJanela, null);
});

test("C: fundos muito comprados é pressão de BAIXA (risco de reversão); muito vendidos, de alta", () => {
  const comprados = derivarFundosPetroleo(historico(157, (i) => (i < 156 ? i * 100 : 99999))).at(-1);
  assert.equal(comprados.decisao.direcao, "BAIXA");
  assert.equal(comprados.decisao.intensidade, "FORTE");
  assert.match(explicarFundos(comprados)[1], /fundos muito comprados .* risco de reversão para baixo → Pressão de baixa\./);
  const vendidos = derivarFundosPetroleo(historico(157, (i) => (i < 156 ? i * 100 : -99999))).at(-1);
  assert.equal(vendidos.decisao.direcao, "ALTA");
  const normal = derivarFundosPetroleo(historico(157, (i) => (i < 156 ? i * 100 : 7800))).at(-1);
  assert.equal(normal.decisao.direcao, "NEUTRA");
});

test("busca só as três séries do COT do WTI", async () => {
  let pedido;
  const pointInTimeService = { obterAsOf: async (args) => { pedido = args; return []; } };
  await calcularFundosPetroleo({ asOf: new Date("2026-10-03T12:00:00Z") }, { pointInTimeService });
  assert.deepEqual(pedido.seriesCodes.sort(), Object.values(SERIES).sort());
});
