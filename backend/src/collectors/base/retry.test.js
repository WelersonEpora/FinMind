"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { withRetry } = require("./retry");

test("withRetry returns the result on the first success", async () => {
  let chamadas = 0;
  const resultado = await withRetry(async () => {
    chamadas += 1;
    return "ok";
  });

  assert.equal(resultado, "ok");
  assert.equal(chamadas, 1);
});

test("withRetry retries transient failures until it succeeds", async () => {
  let chamadas = 0;
  const resultado = await withRetry(
    async () => {
      chamadas += 1;
      if (chamadas < 3) throw new Error("falha transitória");
      return "ok";
    },
    { tentativas: 3, delayMs: 1 }
  );

  assert.equal(resultado, "ok");
  assert.equal(chamadas, 3);
});

test("withRetry throws the last error after exhausting all attempts", async () => {
  let chamadas = 0;

  await assert.rejects(
    () =>
      withRetry(
        async () => {
          chamadas += 1;
          throw new Error(`falha ${chamadas}`);
        },
        { tentativas: 3, delayMs: 1 }
      ),
    /falha 3/
  );

  assert.equal(chamadas, 3);
});
