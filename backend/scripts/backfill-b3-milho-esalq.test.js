"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverIntervalo, parseArgs, dividirPorAno } = require("./backfill-b3-milho-esalq");

test("resolverIntervalo: por padrão, do 1º pregão com o milho no arquivo (2018-06-08) até hoje", () => {
  assert.deepEqual(resolverIntervalo({}, "2026-09-23"), { dataInicial: "2018-06-08", dataFinal: "2026-09-23" });
});

test("resolverIntervalo: respeita os argumentos, mas nunca começa antes de 2018-06-08", () => {
  assert.deepEqual(resolverIntervalo({ desde: "2024-01-02", ate: "2024-01-31" }), { dataInicial: "2024-01-02", dataFinal: "2024-01-31" });
  assert.deepEqual(resolverIntervalo({ desde: "2010-01-01", ate: "2019-01-01" }), { dataInicial: "2018-06-08", dataFinal: "2019-01-01" });
  assert.throws(() => resolverIntervalo({ ate: "2017-12-31" }), /Intervalo vazio/);
});

test("parseArgs lê --desde= e --ate=", () => {
  assert.deepEqual(parseArgs(["--desde=2024-01-02", "--ate=2024-01-31", "lixo"]), { desde: "2024-01-02", ate: "2024-01-31" });
});

test("dividirPorAno: um bloco por ano civil, do mais recente para o mais antigo, cortado no intervalo", () => {
  assert.deepEqual(dividirPorAno({ dataInicial: "2018-06-08", dataFinal: "2020-03-15" }), [
    { dataInicial: "2020-01-01", dataFinal: "2020-03-15" },
    { dataInicial: "2019-01-01", dataFinal: "2019-12-31" },
    { dataInicial: "2018-06-08", dataFinal: "2018-12-31" }
  ]);
  assert.deepEqual(dividirPorAno({ dataInicial: "2024-02-01", dataFinal: "2024-02-29" }), [{ dataInicial: "2024-02-01", dataFinal: "2024-02-29" }]);
});
