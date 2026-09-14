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
const { sign } = require("../shared/utils/jwt");
const { COOKIE_NAME } = require("../shared/utils/session-cookie");

async function comServidor(fn) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("GET /api/v1/coletas sem sessão retorna 401", async () => {
  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/coletas`);
    assert.equal(response.status, 401);
  });
});

test("POST /api/v1/coletas sem sessão retorna 401", async () => {
  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/coletas`, { method: "POST" });
    assert.equal(response.status, 401);
  });
});

test("POST /api/v1/coletas com sessão de colaborador (não-owner) retorna 403", async () => {
  const token = sign({ sub: "user-1", role: "colaborador" });

  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/coletas`, {
      method: "POST",
      headers: { Cookie: `${COOKIE_NAME}=${token}` }
    });
    assert.equal(response.status, 403);
  });
});
