"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverIntervalo, parseArgs } = require("./backfill-b3-ccm-bdi");

test("resolverIntervalo cobre, por padrão, todo o período em que o BDI tem a tabela do CCM", () => {
  assert.deepEqual(resolverIntervalo({}), { dataInicial: "2022-03-01", dataFinal: "2025-12-11" });
});

test("resolverIntervalo respeita os argumentos, mas nunca sai do período com tabela", () => {
  assert.deepEqual(resolverIntervalo({ desde: "2023-01-02", ate: "2023-01-31" }), { dataInicial: "2023-01-02", dataFinal: "2023-01-31" });
  assert.deepEqual(resolverIntervalo({ desde: "2020-01-01", ate: "2026-09-01" }), { dataInicial: "2022-03-01", dataFinal: "2025-12-11" });
  assert.throws(() => resolverIntervalo({ desde: "2026-01-02" }), /Intervalo vazio/);
});

test("parseArgs lê --desde= e --ate=", () => {
  assert.deepEqual(parseArgs(["--desde=2023-01-02", "--ate=2023-01-31", "lixo"]), { desde: "2023-01-02", ate: "2023-01-31" });
});
