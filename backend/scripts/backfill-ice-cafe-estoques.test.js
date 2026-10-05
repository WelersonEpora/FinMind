"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverIntervalo, resolverSerie, dividirPorMes } = require("./backfill-ice-cafe-estoques");

test("--serie: o certificado (padrão) ou o pendente de classificação (ADR 0061)", () => {
  assert.equal(resolverSerie({}), "ICE.CAFE_C.ESTOQUE.TOTAL.CERTIFICADO");
  assert.equal(resolverSerie({ serie: "pendente" }), "ICE.CAFE_C.ESTOQUE.TOTAL.PENDENTE");
  assert.throws(() => resolverSerie({ serie: "transicao" }), /--serie deve ser/);
});

test("intervalo padrão: do 1º arquivo (2016-01-04) até ontem; antes do 1º arquivo, o 1º arquivo", () => {
  assert.deepEqual(resolverIntervalo({}, "2026-09-28"), { dataInicial: "2016-01-04", dataFinal: "2026-09-27" });
  assert.deepEqual(resolverIntervalo({ desde: "2010-01-01", ate: "2016-02-10" }), { dataInicial: "2016-01-04", dataFinal: "2016-02-10" });
  assert.throws(() => resolverIntervalo({ desde: "2026-09-10", ate: "2026-09-01" }), /Intervalo vazio/);
});

test("blocos mensais, do mais recente para o mais antigo, cortados nas pontas", () => {
  assert.deepEqual(dividirPorMes({ dataInicial: "2025-11-15", dataFinal: "2026-01-10" }), [
    { dataInicial: "2026-01-01", dataFinal: "2026-01-10" },
    { dataInicial: "2025-12-01", dataFinal: "2025-12-31" },
    { dataInicial: "2025-11-15", dataFinal: "2025-11-30" }
  ]);
  assert.equal(dividirPorMes({ dataInicial: "2016-01-04", dataFinal: "2026-09-27" }).length, 129);
});
