"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
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
