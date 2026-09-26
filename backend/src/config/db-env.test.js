"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerConfigBanco } = require("./db-env");

test("lê a conexão do PostgreSQL das variáveis POSTGRES_*", () => {
  const config = lerConfigBanco({
    POSTGRES_HOST: "postgres",
    POSTGRES_PORT: "5433",
    POSTGRES_DATABASE: "finmind",
    POSTGRES_USER: "finmind",
    POSTGRES_PASSWORD: "segredo"
  });

  assert.deepEqual(
    { dialect: config.dialect, host: config.host, port: config.port, database: config.database, username: config.username, password: config.password },
    { dialect: "postgres", host: "postgres", port: 5433, database: "finmind", username: "finmind", password: "segredo" }
  );
});

test("porta 5432 por padrão, e as cinco variáveis são obrigatórias para o servidor subir", () => {
  const config = lerConfigBanco({});

  assert.equal(config.port, 5432);
  assert.deepEqual(config.chavesObrigatorias, ["POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DATABASE", "POSTGRES_USER", "POSTGRES_PASSWORD"]);
});
