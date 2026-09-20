"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./lbma-gold-pm.collector");

// Fixture real do feed (2026-09-20): [USD, GBP, EUR]; primeiras linhas em 1968
// só têm 2 valores e há datas sem leilão (null).
const FIXTURE = [
  { is_cms_locked: 0, d: "1968-04-01", v: [37.7, 15.68, null] },
  { is_cms_locked: 0, d: "1968-04-02", v: [null, null, null] },
  { is_cms_locked: 0, d: "2020-07-15", v: [1804.6, 1420.1, 1580.2] },
  { is_cms_locked: 0, d: "2026-09-18", v: [4348.15, 3259.37, 3793.33] }
];

test("parse descarta datas sem leilão (v[0] nulo)", () => {
  assert.equal(collector.parse(FIXTURE).length, 3);
  assert.throws(() => collector.parse({ nao: "array" }));
});

test("normalize guarda só o USD e estima published_at nas 15:00 de Londres do próprio dia", () => {
  const { validos, invalidos } = collector.normalize(collector.parse(FIXTURE));

  assert.equal(invalidos.length, 0);
  const verao = validos.find((v) => v.observed_at === "2020-07-15");
  assert.equal(verao.series_code, "LBMA.GOLD_PM.USD");
  assert.equal(verao.value, 1804.6, "USD, não a GBP/EUR");
  assert.equal(verao.unit, "USD/oz");
  assert.equal(verao.published_at.toISOString(), "2020-07-15T14:00:00.000Z", "BST: 15:00 Londres = 14:00Z");
  assert.equal(verao.published_at_is_estimated, true);
  assert.equal(verao.metadata.regraPublicacao, "leilao_15h_londres_mesmo_dia");
});

test("normalize rejeita data ou valor inválidos", () => {
  const { validos, invalidos } = collector.normalize([
    { d: "15/07/2020", v: [1800] },
    { d: "2020-07-15", v: [-5] }
  ]);

  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 2);
});
