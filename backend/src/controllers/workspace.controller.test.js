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

test("GET /api/v1/workspaces sem sessão retorna 401", async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/workspaces`);
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test("GET /api/v1/workspaces/:id/membros/candidatos sem sessão retorna 401", async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/workspaces/qualquer/membros/candidatos`);
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

for (const [metodo, caminho] of [
  ["DELETE", "/api/v1/workspaces/qualquer/membros/qualquer"],
  ["DELETE", "/api/v1/workspaces/qualquer"]
]) {
  test(`${metodo} ${caminho} sem sessão retorna 401`, async () => {
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const response = await fetch(`http://127.0.0.1:${port}${caminho}`, { method: metodo });
      assert.equal(response.status, 401);
    } finally {
      server.close();
    }
  });
}
