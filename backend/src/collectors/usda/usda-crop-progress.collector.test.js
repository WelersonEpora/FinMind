"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
// Vazia (não `delete`): o dotenv não sobrescreve variável já definida, então a
// chave real do .env local não vaza para este teste.
process.env.NASS_API_KEY = "";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./usda-crop-progress.collector");

// Fixture no formato documentado do QuickStats (NÃO capturada da API real -
// não havia chave; ver cabeçalho do coletor).
const FIXTURE = [
  { commodity_desc: "CORN", statisticcat_desc: "CONDITION", unit_desc: "PCT GOOD", week_ending: "2026-06-14", Value: "54", short_desc: "CORN - CONDITION, MEASURED IN PCT GOOD", load_time: "2026-06-15 16:03:39" },
  { commodity_desc: "CORN", statisticcat_desc: "CONDITION", unit_desc: "PCT VERY POOR", week_ending: "2026-06-14", Value: "(D)", short_desc: "x" },
  { commodity_desc: "CORN", statisticcat_desc: "PROGRESS", unit_desc: "PCT PLANTED", week_ending: "2026-05-03", Value: "1,000", short_desc: "CORN - PROGRESS, MEASURED IN PCT PLANTED" }
];

test("dataDeDivulgacao: normalmente a segunda-feira seguinte ao week_ending (domingo)", () => {
  assert.equal(collector.dataDeDivulgacao("2026-09-13"), "2026-09-14");
});

test("dataDeDivulgacao: NÃO é sempre segunda - feriado federal empurra para terça", () => {
  assert.equal(collector.dataDeDivulgacao("2025-08-31"), "2025-09-02", "Labor Day 2025-09-01");
  assert.equal(collector.dataDeDivulgacao("2025-05-25"), "2025-05-27", "Memorial Day 2025-05-26");
  assert.equal(collector.dataDeDivulgacao("2025-10-12"), "2025-10-14", "Columbus Day 2025-10-13");
  assert.equal(collector.dataDeDivulgacao("2024-11-10"), "2024-11-12", "Veterans Day 2024-11-11 (segunda)");
});

test("dataDeDivulgacao: feriado fixo num domingo é observado na segunda", () => {
  assert.equal(collector.dataDeDivulgacao("2021-07-04"), "2021-07-06", "4/jul/2021 foi domingo -> feriado observado 5/jul");
});

test("dataDeDivulgacao: feriado que cai em outro dia da semana não desloca a divulgação", () => {
  assert.equal(collector.dataDeDivulgacao("2025-06-15"), "2025-06-16", "Juneteenth 2025 foi quinta");
  assert.equal(collector.dataDeDivulgacao("2025-07-06"), "2025-07-07", "4/jul/2025 foi sexta");
});

test("parse descarta valores não numéricos do QuickStats ('(D)')", () => {
  assert.equal(collector.parse(FIXTURE).length, 2);
});

test("normalize: série USDA.CORN.<CATEGORIA>.<CLASSE>, published_at 16:00 ET ESTIMADO, load_time guardado só como metadado", () => {
  const { validos, invalidos } = collector.normalize(collector.parse(FIXTURE));

  assert.equal(invalidos.length, 0);
  const good = validos.find((v) => v.series_code === "USDA.CORN.CONDITION.GOOD");
  assert.equal(good.value, 54);
  assert.equal(good.observed_at, "2026-06-14");
  assert.equal(good.published_at.toISOString(), "2026-06-15T20:00:00.000Z", "segunda 16:00 EDT");
  assert.equal(good.published_at_is_estimated, true);
  assert.equal(good.metadata.loadTime, "2026-06-15 16:03:39");

  const planted = validos.find((v) => v.series_code === "USDA.CORN.PROGRESS.PLANTED");
  assert.equal(planted.value, 1000, "separador de milhar removido");
});

test("normalize rejeita linha sem week_ending", () => {
  const { validos, invalidos } = collector.normalize([{ statisticcat_desc: "CONDITION", unit_desc: "PCT GOOD", Value: "5" }]);

  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 1);
});

test("download sem NASS_API_KEY falha com mensagem clara (o coletor nem é registrado sem a chave)", async () => {
  await assert.rejects(() => collector.download({ signal: undefined }), /NASS_API_KEY/);
});
