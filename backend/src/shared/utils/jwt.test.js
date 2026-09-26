"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("./jwt");

test("sign/verify round-trips a payload", () => {
  const token = jwt.sign({ sub: "user-1", role: "admin" });
  const decoded = jwt.verify(token);

  assert.equal(decoded.sub, "user-1");
  assert.equal(decoded.role, "admin");
});

test("verify throws for a tampered token", () => {
  const token = jwt.sign({ sub: "user-1", role: "admin" });
  assert.throws(() => jwt.verify(`${token}tampered`));
});
