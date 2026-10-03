"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, derivarJurosPetroleo, calcularJurosPetroleo, explicarJuros } = require("./juros-petroleo.factor");

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const linha = (seriesCode, observedAt, value) => ({ seriesCode, observedAt, value, publishedAt: new Date(`${observedAt}T23:59:59Z`), publishedAtIsEstimated: true });

// `semanas` sextas seguidas a partir de 2025-01-03 (um dia por semana): o Treasury de `treasury(i)` e a meta de
// `meta(i)`.
function historico(semanas, treasury, meta = () => 4.5) {
  return Array.from({ length: semanas }, (_, i) => {
    const data = somarDias("2025-01-03", 7 * i);
    return [linha(SERIES.treasury10a, data, treasury(i)), linha(SERIES.metaFed, data, meta(i))];
  }).flat();
}

test("A: a semana é a média dos dias do Treasury, com a meta do Fed como contexto", () => {
  const [semana] = derivarJurosPetroleo([
    linha(SERIES.treasury10a, "2026-09-28", 4.2),
    linha(SERIES.treasury10a, "2026-09-29", 4.4),
    linha(SERIES.metaFed, "2026-09-29", 4)
  ]);
  assert.equal(semana.observedAt, "2026-10-02");
  assert.equal(semana.treasury10a, 4.3);
  assert.equal(semana.diasNaSemana, 2);
  assert.equal(semana.metaFed, 4);
  assert.equal(semana.variacao26Semanas, null);
  assert.equal(semana.decisao, null);
});

test("B: a variação é contra o Treasury 26 semanas antes; o ciclo do Fed, contra a meta 52 semanas antes", () => {
  const ultimo = derivarJurosPetroleo(historico(53, (i) => (i < 52 ? 4 : 5.2), (i) => (i < 52 ? 5 : 4.5))).at(-1);
  assert.equal(ultimo.treasury10a26SemanasAntes, 4);
  assert.equal(ultimo.variacao26Semanas, 1.2);
  assert.equal(ultimo.variacaoMeta52Semanas, -0.5);
});

test("C: juro subindo além da faixa é pressão de BAIXA para o petróleo; caindo, de alta", () => {
  const alta = derivarJurosPetroleo(historico(30, (i) => (i < 29 ? 4 : 5.2))).at(-1);
  assert.equal(alta.decisao.direcao, "BAIXA");
  assert.equal(alta.decisao.intensidade, "FORTE");
  assert.match(explicarJuros(alta)[1], /juro em alta .* → Pressão de baixa\./);
  const queda = derivarJurosPetroleo(historico(30, (i) => (i < 29 ? 4 : 3.3))).at(-1);
  assert.equal(queda.decisao.direcao, "ALTA");
  assert.equal(queda.decisao.intensidade, "MODERADA");
});

test("a explicação mostra o limiar com duas casas quando ele tem (0,25 p.p., não 0,3)", () => {
  const ponto = derivarJurosPetroleo(historico(35, (i) => (i < 30 ? 4 : 4.6))).at(-1);
  assert.match(explicarJuros(ponto)[3], /0,25 p\.p\./);
});

test("busca o Treasury de 10 anos e a meta do Fed", async () => {
  let pedido;
  const pointInTimeService = { obterAsOf: async (args) => { pedido = args; return []; } };
  await calcularJurosPetroleo({ asOf: new Date("2026-10-03T12:00:00Z") }, { pointInTimeService });
  assert.deepEqual(pedido.seriesCodes.sort(), Object.values(SERIES).sort());
});
