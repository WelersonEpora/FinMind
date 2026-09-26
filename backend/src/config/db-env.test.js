"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerConfigBanco } = require("./db-env");

const AMBIENTE = {
  MARIADB_HOST: "maria",
  MARIADB_PORT: "3307",
  MARIADB_DATABASE: "fm_maria",
  MARIADB_USER: "u_maria",
  MARIADB_PASSWORD: "p_maria",
  POSTGRES_HOST: "pg",
  POSTGRES_DATABASE: "fm_pg",
  POSTGRES_USER: "u_pg",
  POSTGRES_PASSWORD: "p_pg"
};

test("sem DB_DIALECT usa o MariaDB (dialeto mysql) e as variáveis MARIADB_*", () => {
  const config = lerConfigBanco(AMBIENTE);

  assert.equal(config.dialect, "mysql");
  assert.deepEqual(
    { host: config.host, port: config.port, database: config.database, username: config.username, password: config.password },
    { host: "maria", port: 3307, database: "fm_maria", username: "u_maria", password: "p_maria" }
  );
  assert.deepEqual(config.chavesObrigatorias, ["MARIADB_HOST", "MARIADB_PORT", "MARIADB_DATABASE", "MARIADB_USER", "MARIADB_PASSWORD"]);
});

test("DB_DIALECT=postgres usa as variáveis POSTGRES_*, com a porta 5432 por padrão", () => {
  const config = lerConfigBanco({ ...AMBIENTE, DB_DIALECT: "postgres" });

  assert.equal(config.dialect, "postgres");
  assert.deepEqual(
    { host: config.host, port: config.port, database: config.database, username: config.username, password: config.password },
    { host: "pg", port: 5432, database: "fm_pg", username: "u_pg", password: "p_pg" }
  );
  assert.ok(config.chavesObrigatorias.every((chave) => chave.startsWith("POSTGRES_")));
});

test("DB_DIALECT desconhecido é erro explícito, não cai no padrão em silêncio", () => {
  assert.throws(() => lerConfigBanco({ ...AMBIENTE, DB_DIALECT: "sqlite" }), /DB_DIALECT inválido/);
});
