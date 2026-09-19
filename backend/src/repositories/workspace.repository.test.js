"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { Workspace, WorkspaceMember, User, sequelize } = require("../models");
const workspaceRepository = require("./workspace.repository");

afterEach(() => mock.restoreAll());

test("createPersonalFor cria o espaço pessoal e o vínculo owner na mesma transação", async () => {
  const transaction = { id: "tx" };
  const wsCreate = mock.method(Workspace, "create", async (data) => ({ id: "ws-1", ...data }));
  const memberCreate = mock.method(WorkspaceMember, "create", async (data) => data);

  const workspace = await workspaceRepository.createPersonalFor({ id: "user-1" }, { transaction });

  assert.equal(workspace.id, "ws-1");
  assert.deepEqual(wsCreate.mock.calls[0].arguments, [
    { name: workspaceRepository.PERSONAL_WORKSPACE_NAME, personal_user_id: "user-1" },
    { transaction }
  ]);
  assert.deepEqual(memberCreate.mock.calls[0].arguments, [
    { workspace_id: "ws-1", user_id: "user-1", role: "owner" },
    { transaction }
  ]);
});

test("createPersonalFor recusa rodar sem transação", async () => {
  const wsCreate = mock.method(Workspace, "create", async () => ({ id: "ws-1" }));

  await assert.rejects(() => workspaceRepository.createPersonalFor({ id: "user-1" }), /transação/);
  assert.equal(wsCreate.mock.callCount(), 0);
});

test("createSharedWithOwner cria espaço NÃO pessoal + vínculo owner na mesma transação", async () => {
  const transaction = { id: "tx" };
  mock.method(sequelize, "transaction", async (callback) => callback(transaction));
  const wsCreate = mock.method(Workspace, "create", async (data) => ({ id: "ws-9", ...data }));
  const memberCreate = mock.method(WorkspaceMember, "create", async (data) => data);

  const workspace = await workspaceRepository.createSharedWithOwner({ name: "Família Souza", ownerUserId: "user-1" });

  assert.equal(workspace.id, "ws-9");
  assert.deepEqual(wsCreate.mock.calls[0].arguments, [{ name: "Família Souza", personal_user_id: null }, { transaction }]);
  assert.deepEqual(memberCreate.mock.calls[0].arguments, [
    { workspace_id: "ws-9", user_id: "user-1", role: "owner" },
    { transaction }
  ]);
});

test("createSharedWithOwner: se o vínculo falha, o erro sobe (a transação desfaz o espaço)", async () => {
  mock.method(sequelize, "transaction", async (callback) => callback({ id: "tx" }));
  mock.method(Workspace, "create", async () => ({ id: "ws-9" }));
  mock.method(WorkspaceMember, "create", async () => {
    throw new Error("falha no vínculo");
  });

  await assert.rejects(() => workspaceRepository.createSharedWithOwner({ name: "X", ownerUserId: "u" }), /falha no vínculo/);
});

test("findMembers nunca traz password_hash: só id, name e email do usuário", async () => {
  const findAll = mock.method(WorkspaceMember, "findAll", async () => []);
  await workspaceRepository.findMembers("ws-1");

  const { where, include } = findAll.mock.calls[0].arguments[0];
  assert.deepEqual(where, { workspace_id: "ws-1" });
  assert.deepEqual(include[0].attributes, ["id", "name", "email"]);
});

test("WorkspaceMember só aceita os papéis owner, editor e viewer", async () => {
  const base = { workspace_id: "ws-1", user_id: "user-1" };

  for (const role of ["owner", "editor", "viewer"]) {
    await WorkspaceMember.build({ ...base, role }).validate();
  }

  await assert.rejects(() => WorkspaceMember.build({ ...base, role: "colaborador" }).validate());
});

test("WorkspaceMember usa o menor privilégio (viewer) como papel padrão", () => {
  assert.equal(WorkspaceMember.build({ workspace_id: "ws-1", user_id: "user-1" }).role, "viewer");
});

test("findAddableUsers: só ativos, sem quem já é membro DESTE espaço, só nome e e-mail", async () => {
  const findAll = mock.method(User, "findAll", async () => []);
  await workspaceRepository.findAddableUsers("ws-1");

  const { where, attributes, order } = findAll.mock.calls[0].arguments[0];
  assert.equal(where.active, true);
  assert.deepEqual(attributes, ["name", "email"], "nunca id, password_hash ou papel");
  assert.deepEqual(order, [["name", "ASC"]]);

  const subselect = where.id[Op.notIn].val;
  assert.match(subselect, /FROM workspace_member WHERE workspace_id = 'ws-1'/);
});

test("findAddableUsers escapa o id do espaço (sem injeção de SQL)", async () => {
  const findAll = mock.method(User, "findAll", async () => []);
  await workspaceRepository.findAddableUsers("x' OR '1'='1");

  const subselect = findAll.mock.calls[0].arguments[0].where.id[Op.notIn].val;
  assert.doesNotMatch(subselect, /workspace_id = 'x' OR/);
  assert.match(subselect, /\'/);
});

test("findMemberInWorkspace e removeMember filtram pelo id do vínculo E pelo espaço", async () => {
  const findOne = mock.method(WorkspaceMember, "findOne", async () => null);
  const destroy = mock.method(WorkspaceMember, "destroy", async () => 0);

  await workspaceRepository.findMemberInWorkspace("ws-1", "m-9");
  await workspaceRepository.removeMember("ws-1", "m-9");

  assert.deepEqual(findOne.mock.calls[0].arguments[0].where, { id: "m-9", workspace_id: "ws-1" });
  assert.deepEqual(destroy.mock.calls[0].arguments[0].where, { id: "m-9", workspace_id: "ws-1" });
});

test("deleteSharedWorkspace apaga vínculos e espaço numa transação, só se NÃO for pessoal", async () => {
  const transaction = { id: "tx" };
  mock.method(sequelize, "transaction", async (callback) => callback(transaction));
  const memberDestroy = mock.method(WorkspaceMember, "destroy", async () => 3);
  const wsDestroy = mock.method(Workspace, "destroy", async () => 1);

  await workspaceRepository.deleteSharedWorkspace("ws-1");

  assert.deepEqual(memberDestroy.mock.calls[0].arguments[0], { where: { workspace_id: "ws-1" }, transaction });
  assert.deepEqual(wsDestroy.mock.calls[0].arguments[0], { where: { id: "ws-1", personal_user_id: null }, transaction });
});

test("deleteSharedWorkspace: se o espaço não foi apagado (ex.: é pessoal), lança para desfazer a transação", async () => {
  mock.method(sequelize, "transaction", async (callback) => callback({ id: "tx" }));
  mock.method(WorkspaceMember, "destroy", async () => 1);
  mock.method(Workspace, "destroy", async () => 0);

  await assert.rejects(() => workspaceRepository.deleteSharedWorkspace("ws-pessoal"), /não encontrado para exclusão/);
});
