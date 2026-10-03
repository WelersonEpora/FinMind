"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIE_DOLAR, derivarDolarPetroleo, calcularDolarPetroleo, explicarDolar } = require("./dolar-petroleo.factor");

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const linha = (observedAt, value) => ({ seriesCode: SERIE_DOLAR, observedAt, value, publishedAt: new Date(`${observedAt}T23:59:59Z`), publishedAtIsEstimated: true });

// `semanas` sextas seguidas a partir de 2025-01-03, o índice de cada uma vindo de `valor(i)` (um dia por semana).
function historico(semanas, valor) {
  return Array.from({ length: semanas }, (_, i) => linha(somarDias("2025-01-03", 7 * i), valor(i)));
}

test("A: a semana é a média dos dias (sábado a sexta), com quantos dias entraram", () => {
  const [semana] = derivarDolarPetroleo([linha("2026-09-28", 110), linha("2026-09-29", 112)]);
  assert.equal(semana.observedAt, "2026-10-02");
  assert.equal(semana.indice, 111);
  assert.equal(semana.diasNaSemana, 2);
  assert.equal(semana.media52Semanas, null);
  assert.equal(semana.decisao, null);
});

test("B: o desvio é contra a média das 52 semanas anteriores; com menos de 48 delas, nulo", () => {
  const pontos = derivarDolarPetroleo(historico(53, (i) => (i < 52 ? 100 : 106)));
  const ultimo = pontos.at(-1);
  assert.equal(ultimo.media52Semanas, 100);
  assert.equal(ultimo.desvioPct, 6);
  assert.equal(ultimo.variacao13SemanasPct, 6);
  assert.equal(derivarDolarPetroleo(historico(40, () => 100)).at(-1).desvioPct, null);
});

test("C: dólar acima do normal é pressão de BAIXA para o petróleo; abaixo, de alta", () => {
  const forte = derivarDolarPetroleo(historico(53, (i) => (i < 52 ? 100 : 106))).at(-1);
  assert.equal(forte.decisao.direcao, "BAIXA");
  assert.equal(forte.decisao.intensidade, "FORTE");
  assert.match(explicarDolar(forte)[1], /dólar acima do normal \(forte\) pressiona o petróleo → Pressão de baixa\./);
  const fraco = derivarDolarPetroleo(historico(53, (i) => (i < 52 ? 100 : 97))).at(-1);
  assert.equal(fraco.decisao.direcao, "ALTA");
  assert.equal(fraco.decisao.intensidade, "MODERADA");
});

test("busca só o índice das economias avançadas, o histórico inteiro", async () => {
  let pedido;
  const pointInTimeService = { obterAsOf: async (args) => { pedido = args; return []; } };
  await calcularDolarPetroleo({ asOf: new Date("2026-10-03T12:00:00Z") }, { pointInTimeService });
  assert.deepEqual(pedido.seriesCodes, [SERIE_DOLAR]);
});
