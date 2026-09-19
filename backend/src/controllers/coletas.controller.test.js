"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const userRepository = require("../repositories/user.repository");
const { sign } = require("../shared/utils/jwt");
const { COOKIE_NAME } = require("../shared/utils/session-cookie");

afterEach(() => mock.restoreAll());

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

// O papel vem do banco (require-auth.js), não do token - por isso o
// repositório de usuários é simulado aqui, sem abrir conexão real.
test("POST /api/v1/coletas com sessão de usuário comum (não-admin) retorna 403", async () => {
  mock.method(userRepository, "findById", async () => ({ id: "user-1", role: "user", active: true }));
  const token = sign({ sub: "user-1" });

  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/coletas`, {
      method: "POST",
      headers: { Cookie: `${COOKIE_NAME}=${token}` }
    });
    assert.equal(response.status, 403);
  });
});

test("o papel do token é ignorado: token antigo dizendo 'owner' não dá acesso de admin", async () => {
  mock.method(userRepository, "findById", async () => ({ id: "user-1", role: "user", active: true }));
  const token = sign({ sub: "user-1", role: "owner" });

  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/coletas`, {
      method: "POST",
      headers: { Cookie: `${COOKIE_NAME}=${token}` }
    });
    assert.equal(response.status, 403);
  });
});

test("usuário desativado perde o acesso na hora, mesmo com token ainda válido", async () => {
  mock.method(userRepository, "findById", async () => ({ id: "user-1", role: "admin", active: false }));
  const token = sign({ sub: "user-1" });

  await comServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/coletas`, { headers: { Cookie: `${COOKIE_NAME}=${token}` } });
    assert.equal(response.status, 401);
  });
});
