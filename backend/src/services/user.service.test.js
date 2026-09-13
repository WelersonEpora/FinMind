"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const userService = require("./user.service");

function makeRepo({ existing = null } = {}) {
  const created = [];
  return {
    findByEmail: async () => existing,
    create: async (data) => {
      const user = { id: "new-user", ...data };
      created.push(user);
      return user;
    },
    findAll: async () => created,
    _created: created
  };
}

test("createUser rejects a password shorter than 8 characters", async () => {
  const repo = makeRepo();
  await assert.rejects(() =>
    userService.createUser(
      { name: "Fulano", email: "fulano@finmind.local", password: "1234567" },
      { userRepository: repo }
    )
  );
});

test("createUser rejects an invalid role", async () => {
  const repo = makeRepo();
  await assert.rejects(() =>
    userService.createUser(
      { name: "Fulano", email: "fulano@finmind.local", password: "12345678", role: "gerente" },
      { userRepository: repo }
    )
  );
});

test("createUser rejects a duplicate e-mail", async () => {
  const repo = makeRepo({ existing: { id: "existing" } });
  await assert.rejects(() =>
    userService.createUser(
      { name: "Fulano", email: "fulano@finmind.local", password: "12345678" },
      { userRepository: repo }
    )
  );
});

test("createUser defaults role to colaborador and hashes the password", async () => {
  const repo = makeRepo();
  const pwd = { hash: async (plain) => `hashed-${plain}` };

  const user = await userService.createUser(
    { name: "Fulano", email: "Fulano@FinMind.local", password: "12345678" },
    { userRepository: repo, password: pwd }
  );

  assert.equal(user.role, "colaborador");
  assert.equal(user.email, "fulano@finmind.local");
  assert.equal(repo._created[0].password_hash, "hashed-12345678");
});

function makeUserInstance(data) {
  const user = { ...data };
  user.update = async (patch) => {
    Object.assign(user, patch);
    return user;
  };
  return user;
}

function makeUpdateRepo({ user, otherActiveOwners = 1, emailTaken = false }) {
  return {
    findById: async () => user,
    findByEmail: async () => (emailTaken ? { id: "someone-else" } : null),
    update: async (u, patch) => u.update(patch),
    countActiveOwners: async () => otherActiveOwners
  };
}

test("updateUser rejects an empty name", async () => {
  const repo = makeUpdateRepo({ user: makeUserInstance({ id: "u1", name: "A", email: "a@finmind.local", role: "owner", active: true }) });
  await assert.rejects(() => userService.updateUser("u1", { name: "   " }, { userRepository: repo }));
});

test("updateUser rejects an invalid role", async () => {
  const repo = makeUpdateRepo({ user: makeUserInstance({ id: "u1", name: "A", email: "a@finmind.local", role: "owner", active: true }) });
  await assert.rejects(() => userService.updateUser("u1", { role: "gerente" }, { userRepository: repo }));
});

test("updateUser rejects an e-mail already used by someone else", async () => {
  const repo = makeUpdateRepo({
    user: makeUserInstance({ id: "u1", name: "A", email: "a@finmind.local", role: "owner", active: true }),
    emailTaken: true
  });
  await assert.rejects(() => userService.updateUser("u1", { email: "outro@finmind.local" }, { userRepository: repo }));
});

test("updateUser rejects deactivating the last active owner", async () => {
  const repo = makeUpdateRepo({
    user: makeUserInstance({ id: "u1", name: "A", email: "a@finmind.local", role: "owner", active: true }),
    otherActiveOwners: 0
  });
  await assert.rejects(() => userService.updateUser("u1", { active: false }, { userRepository: repo }));
});

test("updateUser allows deactivating an owner when another active owner remains", async () => {
  const repo = makeUpdateRepo({
    user: makeUserInstance({ id: "u1", name: "A", email: "a@finmind.local", role: "owner", active: true }),
    otherActiveOwners: 1
  });
  const user = await userService.updateUser("u1", { active: false }, { userRepository: repo });
  assert.equal(user.active, false);
});

test("updateUser hashes the password only when one is provided", async () => {
  const repo = makeUpdateRepo({ user: makeUserInstance({ id: "u1", name: "A", email: "a@finmind.local", role: "colaborador", active: true }) });
  const pwd = { hash: async (plain) => `hashed-${plain}` };

  const user = await userService.updateUser("u1", { password: "novaSenha123" }, { userRepository: repo, password: pwd });

  assert.equal(user.name, "A");
});

test("updateOwnProfile updates name and password", async () => {
  const repo = makeUpdateRepo({ user: makeUserInstance({ id: "u1", name: "A", email: "a@finmind.local", role: "colaborador", active: true }) });
  const pwd = { hash: async (plain) => `hashed-${plain}` };

  const user = await userService.updateOwnProfile("u1", { name: "Novo Nome", password: "novaSenha123" }, { userRepository: repo, password: pwd });

  assert.equal(user.name, "Novo Nome");
});

test("updateOwnProfile ignores role/active even if somehow present in the payload", async () => {
  const repo = makeUpdateRepo({ user: makeUserInstance({ id: "u1", name: "A", email: "a@finmind.local", role: "colaborador", active: true }) });

  const user = await userService.updateOwnProfile(
    "u1",
    { name: "Novo Nome", role: "owner", active: false },
    { userRepository: repo }
  );

  assert.equal(user.role, "colaborador");
  assert.equal(user.active, true);
});
