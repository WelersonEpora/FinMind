"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const requireWorkspaceMember = require("./require-workspace-member");
const workspaceRepository = require("../../repositories/workspace.repository");

afterEach(() => mock.restoreAll());

function chamar(middleware, req) {
  return new Promise((resolve) => middleware(req, {}, (err) => resolve({ req, err })));
}

const reqDe = (userId, workspaceId = "w1", role = "user") => ({ user: { sub: userId, role }, params: { workspaceId } });

test("não-membro recebe 404 (não revela que o espaço existe)", async () => {
  mock.method(workspaceRepository, "findMembership", async () => null);
  const { err } = await chamar(requireWorkspaceMember(), reqDe("u1"));
  assert.equal(err.statusCode, 404);
});

test("consulta o vínculo do usuário autenticado no espaço DA ROTA", async () => {
  const find = mock.method(workspaceRepository, "findMembership", async () => ({ workspace_id: "w-rota", role: "viewer" }));
  await chamar(requireWorkspaceMember(), reqDe("u1", "w-rota"));
  assert.deepEqual(find.mock.calls[0].arguments, ["w-rota", "u1"]);
});

test("qualquer membro passa quando nenhum papel é exigido, e req.workspaceMember é preenchido", async () => {
  mock.method(workspaceRepository, "findMembership", async () => ({ workspace_id: "w1", role: "viewer" }));
  const { req, err } = await chamar(requireWorkspaceMember(), reqDe("u1"));
  assert.equal(err, undefined);
  assert.deepEqual(req.workspaceMember, { workspaceId: "w1", role: "viewer" });
});

test("papel insuficiente no espaço: 403", async () => {
  mock.method(workspaceRepository, "findMembership", async () => ({ workspace_id: "w1", role: "editor" }));
  const { err } = await chamar(requireWorkspaceMember("owner"), reqDe("u1"));
  assert.equal(err.statusCode, 403);
});

test("owner do espaço passa quando o papel exigido é owner", async () => {
  mock.method(workspaceRepository, "findMembership", async () => ({ workspace_id: "w1", role: "owner" }));
  const { err } = await chamar(requireWorkspaceMember("owner"), reqDe("u1"));
  assert.equal(err, undefined);
});

test("admin de PLATAFORMA não ganha acesso a espaço alheio", async () => {
  mock.method(workspaceRepository, "findMembership", async () => null);
  const { err } = await chamar(requireWorkspaceMember("owner"), reqDe("u-admin", "w-de-outro", "admin"));
  assert.equal(err.statusCode, 404);
});

test("sem req.user: 401", async () => {
  const { err } = await chamar(requireWorkspaceMember(), { params: { workspaceId: "w1" } });
  assert.equal(err.statusCode, 401);
});

test("falha do banco propaga (não vira 404/403)", async () => {
  const falha = new Error("banco caiu");
  mock.method(workspaceRepository, "findMembership", async () => {
    throw falha;
  });
  const { err } = await chamar(requireWorkspaceMember(), reqDe("u1"));
  assert.equal(err, falha);
});
