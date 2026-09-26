"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const requireAuth = require("./require-auth");
const userRepository = require("../../repositories/user.repository");
const { sign } = require("../utils/jwt");
const { COOKIE_NAME } = require("../utils/session-cookie");

afterEach(() => mock.restoreAll());

function chamar(cookies) {
  const req = { cookies };
  return new Promise((resolve) => {
    requireAuth(req, {}, (err) => resolve({ req, err }));
  });
}

const comToken = (payload) => ({ [COOKIE_NAME]: sign(payload) });

test("sem cookie: 401", async () => {
  const { err } = await chamar({});
  assert.equal(err.statusCode, 401);
});

test("token inválido: 401 e nem consulta o banco", async () => {
  const findById = mock.method(userRepository, "findById", async () => null);
  const { err } = await chamar({ [COOKIE_NAME]: "token.invalido.aqui" });
  assert.equal(err.statusCode, 401);
  assert.equal(findById.mock.callCount(), 0);
});

test("usuário ativo: req.user vem do BANCO (sub e papel), não do token", async () => {
  mock.method(userRepository, "findById", async () => ({ id: "u1", role: "user", active: true }));
  const { req, err } = await chamar(comToken({ sub: "u1", role: "admin" }));

  assert.equal(err, undefined);
  assert.deepEqual(req.user, { sub: "u1", role: "user" });
});

test("promoção/rebaixamento vale no request seguinte, sem novo login", async () => {
  const token = comToken({ sub: "u1" });
  let papel = "user";
  mock.method(userRepository, "findById", async () => ({ id: "u1", role: papel, active: true }));

  assert.equal((await chamar(token)).req.user.role, "user");
  papel = "admin";
  assert.equal((await chamar(token)).req.user.role, "admin");
});

test("usuário desativado: 401 com token ainda válido", async () => {
  mock.method(userRepository, "findById", async () => ({ id: "u1", role: "admin", active: false }));
  const { err } = await chamar(comToken({ sub: "u1" }));
  assert.equal(err.statusCode, 401);
});

test("usuário inexistente: 401", async () => {
  mock.method(userRepository, "findById", async () => null);
  const { err } = await chamar(comToken({ sub: "sumiu" }));
  assert.equal(err.statusCode, 401);
});

test("falha do banco NÃO vira 401 (não desloga por erro de infraestrutura)", async () => {
  const falha = new Error("conexão perdida");
  mock.method(userRepository, "findById", async () => {
    throw falha;
  });
  const { err } = await chamar(comToken({ sub: "u1" }));
  assert.equal(err, falha);
});
