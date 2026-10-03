"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  SERIE_DEMANDA,
  derivarDemandaPetroleoEua,
  calcularDemandaPetroleoEua,
  explicarDemanda,
  exemplosDemanda
} = require("./demanda-petroleo-eua.factor");

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const linha = (observedAt, value) => ({ seriesCode: SERIE_DEMANDA, observedAt, value, publishedAt: new Date(), publishedAtIsEstimated: true });

// 60 semanas: as 52 primeiras em `antes`, as seguintes em `depois`.
function historico(antes, depois) {
  return Array.from({ length: 60 }, (_, i) => linha(somarDias("2025-01-03", 7 * i), i < 52 ? antes : depois));
}

test("consumo crescendo acima da faixa é pressão de ALTA (o sentido inverso dos fatores de oferta)", () => {
  const ultimo = derivarDemandaPetroleoEua(historico(20000, 20800)).at(-1);
  assert.equal(ultimo.media4Semanas, 20800);
  assert.equal(ultimo.mediaAnoAnterior, 20000);
  assert.equal(ultimo.crescimentoAnualPct, 4);
  assert.equal(ultimo.decisao.direcao, "ALTA");
  assert.equal(ultimo.decisao.intensidade, "MODERADA");
  assert.match(explicarDemanda(ultimo)[1], /consumo crescendo é demanda forte → Pressão de alta\./);
});

test("consumo encolhendo é pressão de BAIXA; dentro da faixa de 2%, neutra", () => {
  const encolhendo = derivarDemandaPetroleoEua(historico(20000, 18800)).at(-1);
  assert.equal(encolhendo.decisao.direcao, "BAIXA");
  assert.equal(encolhendo.decisao.intensidade, "FORTE");
  assert.match(explicarDemanda(encolhendo)[1], /consumo encolhendo é demanda fraca → Pressão de baixa\./);
  assert.equal(derivarDemandaPetroleoEua(historico(20000, 20200)).at(-1).decisao.direcao, "NEUTRA");
});

test("os cenários hipotéticos usam o mesmo sentido: crescendo forte é alta", () => {
  const { cenarios } = exemplosDemanda([]);
  assert.equal(cenarios.find((c) => c.valor === 7).decisao.direcao, "ALTA");
  assert.equal(cenarios.find((c) => c.valor === -8).decisao.direcao, "BAIXA");
});

test("busca só o consumo dos EUA, o histórico inteiro", async () => {
  let pedido;
  const pointInTimeService = { obterAsOf: async (args) => { pedido = args; return []; } };
  await calcularDemandaPetroleoEua({ asOf: new Date("2026-10-03T12:00:00Z") }, { pointInTimeService });
  assert.deepEqual(pedido.seriesCodes, [SERIE_DEMANDA]);
  assert.equal(pedido.observadoDesde, undefined);
});
