"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const password = require("./password");

test("hash produces a value different from the plain password", async () => {
  const hash = await password.hash("Senha123!");
  assert.notEqual(hash, "Senha123!");
});

test("compare returns true for the correct password", async () => {
  const hash = await password.hash("Senha123!");
  assert.equal(await password.compare("Senha123!", hash), true);
});

test("compare returns false for the wrong password", async () => {
  const hash = await password.hash("Senha123!");
  assert.equal(await password.compare("outra-senha", hash), false);
});
