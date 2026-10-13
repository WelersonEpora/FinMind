"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ehDiaUtil, somarDiasUteis, diasUteisEntre, semanaIso } = require("./calendario");

const FERIADOS = ["2026-10-12"];

test("dia útil: fim de semana e feriado não contam", () => {
  assert.equal(ehDiaUtil("2026-10-09"), true);
  assert.equal(ehDiaUtil("2026-10-10"), false);
  assert.equal(ehDiaUtil("2026-10-12", FERIADOS), false);
  assert.equal(ehDiaUtil("2026-10-12"), true);
});

test("somar dias úteis pula fim de semana e feriado, nos dois sentidos", () => {
  assert.equal(somarDiasUteis("2026-10-09", 1, FERIADOS), "2026-10-13");
  assert.equal(somarDiasUteis("2026-10-13", -1, FERIADOS), "2026-10-09");
  assert.equal(somarDiasUteis("2026-10-13", 0, FERIADOS), "2026-10-13");
  assert.equal(somarDiasUteis("2026-10-13", 5), "2026-10-20");
});

test("dias úteis entre duas datas: (de, ate], negativo ao contrário", () => {
  assert.equal(diasUteisEntre("2026-10-09", "2026-10-13", FERIADOS), 1);
  assert.equal(diasUteisEntre("2026-10-09", "2026-10-13"), 2);
  assert.equal(diasUteisEntre("2026-10-13", "2026-10-09", FERIADOS), -1);
  assert.equal(diasUteisEntre("2026-10-13", "2026-10-13"), 0);
});

test("semana ISO: segunda a domingo, com a virada do ano", () => {
  assert.equal(semanaIso("2026-10-12"), semanaIso("2026-10-18"));
  assert.notEqual(semanaIso("2026-10-18"), semanaIso("2026-10-19"));
  assert.equal(semanaIso("2027-01-01"), "2026-W53");
  assert.equal(semanaIso("2026-01-01"), "2026-W01");
});
