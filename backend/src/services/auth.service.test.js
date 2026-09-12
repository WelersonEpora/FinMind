"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const authService = require("./auth.service");

const fakeUser = {
  id: "user-1",
  email: "admin@finmind.local",
  name: "Administrador",
  password_hash: "hashed",
  active: true,
  role: { name: "admin" }
};

test("login returns a token and the safe user on valid credentials", async () => {
  const deps = {
    userRepository: { findByEmail: async () => fakeUser },
    password: { compare: async () => true },
    jwt: { sign: (payload) => `token-for-${payload.sub}` }
  };

  const result = await authService.login("admin@finmind.local", "correct-password", deps);

  assert.equal(result.token, "token-for-user-1");
  assert.deepEqual(result.user, {
    id: "user-1",
    email: "admin@finmind.local",
    name: "Administrador",
    role: "admin"
  });
});

test("login rejects when the user does not exist", async () => {
  const deps = {
    userRepository: { findByEmail: async () => null },
    password: { compare: async () => true },
    jwt: { sign: () => "token" }
  };

  await assert.rejects(() => authService.login("nope@finmind.local", "x", deps));
});

test("login rejects when the password does not match", async () => {
  const deps = {
    userRepository: { findByEmail: async () => fakeUser },
    password: { compare: async () => false },
    jwt: { sign: () => "token" }
  };

  await assert.rejects(() => authService.login("admin@finmind.local", "wrong", deps));
});

test("login rejects an inactive user", async () => {
  const deps = {
    userRepository: { findByEmail: async () => ({ ...fakeUser, active: false }) },
    password: { compare: async () => true },
    jwt: { sign: () => "token" }
  };

  await assert.rejects(() => authService.login("admin@finmind.local", "correct-password", deps));
});
