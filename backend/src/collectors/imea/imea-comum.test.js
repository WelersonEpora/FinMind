"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { slug, publicadoEm, CADEIA_MILHO, API_BASE } = require("./imea-comum");

test("slug: remove acento, maiúsculas, junta separadores e tira '_' das pontas", () => {
  assert.equal(slug("Médio-Norte"), "MEDIO_NORTE");
  assert.equal(slug("Campo Novo do Parecis"), "CAMPO_NOVO_DO_PARECIS");
  assert.equal(slug("1. SEMENTES"), "1_SEMENTES");
  assert.equal(slug("  Sorriso  "), "SORRISO");
});

test("slug: string vazia ou só pontuação vira vazio (não gera '_' solto)", () => {
  assert.equal(slug(""), "");
  assert.equal(slug("()"), "");
});

test("publicadoEm: fim do dia em UTC quando isso já passou", () => {
  const agora = new Date("2026-09-22T12:00:00Z");
  assert.equal(publicadoEm("2026-09-15", agora).toISOString(), "2026-09-15T23:59:59.000Z");
});

test("publicadoEm: se o fim do dia ainda está no futuro (coleta no próprio dia da publicação), vale o instante da coleta", () => {
  const agora = new Date("2026-09-15T10:00:00Z");
  assert.equal(publicadoEm("2026-09-15", agora).getTime(), agora.getTime());
});

test("constantes básicas", () => {
  assert.equal(CADEIA_MILHO, 3);
  assert.equal(API_BASE, "https://api1.imea.com.br/api");
});
