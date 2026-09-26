"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
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
  role: "admin"
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
    role: "admin",
    active: true,
    hasPhoto: false
  });
});

test("login looks the e-mail up in lowercase and trimmed (PostgreSQL compares text case-sensitively)", async () => {
  let emailBuscado;
  const deps = {
    userRepository: {
      findByEmail: async (email) => {
        emailBuscado = email;
        return fakeUser;
      }
    },
    password: { compare: async () => true },
    jwt: { sign: () => "token" }
  };

  await authService.login("  Admin@FinMind.Local ", "correct-password", deps);

  assert.equal(emailBuscado, "admin@finmind.local");
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
