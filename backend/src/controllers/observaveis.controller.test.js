"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
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
