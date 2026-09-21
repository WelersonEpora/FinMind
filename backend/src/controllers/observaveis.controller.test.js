"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");

async function comServidor(fn) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("GET /api/v1/observaveis sem sessão retorna 401", async () => {
  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observaveis`);
    assert.equal(response.status, 401);
  });
});

test("GET /api/v1/observaveis/USD_BRL sem sessão retorna 401", async () => {
  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observaveis/USD_BRL`);
    assert.equal(response.status, 401);
  });
});

test("GET /api/v1/observaveis/USD_BRL/exportacao.csv sem sessão retorna 401", async () => {
  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observaveis/USD_BRL/exportacao.csv`);
    assert.equal(response.status, 401);
  });
});

test("GET /api/v1/observaveis/USD_BRL/historico sem sessão retorna 401", async () => {
  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/observaveis/USD_BRL/historico`);
    assert.equal(response.status, 401);
  });
});
