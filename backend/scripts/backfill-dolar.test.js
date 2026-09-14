"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverIntervalo, paraDataBr } = require("./backfill-dolar");

function paraData(dataBr) {
  const [dia, mes, ano] = dataBr.split("/").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

test("paraDataBr formata uma data em DD/MM/AAAA", () => {
  assert.equal(paraDataBr(new Date(Date.UTC(2026, 8, 14))), "14/09/2026");
});

test("resolverIntervalo usa 60 dias por padrão quando nenhum argumento é passado", () => {
  const { dataInicial, dataFinal } = resolverIntervalo({});
  const diffDias = (paraData(dataFinal) - paraData(dataInicial)) / (1000 * 60 * 60 * 24);
  assert.equal(diffDias, 60);
});

test("resolverIntervalo respeita --dias explícito", () => {
  const { dataInicial, dataFinal } = resolverIntervalo({ dias: "10" });
  const diffDias = (paraData(dataFinal) - paraData(dataInicial)) / (1000 * 60 * 60 * 24);
  assert.equal(diffDias, 10);
});

test("resolverIntervalo usa dataInicial/dataFinal explícitos quando fornecidos", () => {
  const resultado = resolverIntervalo({ dataInicial: "01/06/2026", dataFinal: "30/06/2026" });
  assert.deepEqual(resultado, { dataInicial: "01/06/2026", dataFinal: "30/06/2026" });
});

test("resolverIntervalo usa hoje como dataFinal quando só dataInicial é fornecida", () => {
  const { dataInicial, dataFinal } = resolverIntervalo({ dataInicial: "01/06/2026" });
  assert.equal(dataInicial, "01/06/2026");
  assert.equal(dataFinal, paraDataBr(new Date()));
});
