"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { somarDias, diaDaSemanaIso, proximoDiaUtil, proximaSegunda, fimDoDiaUtc, paraDatetimeSql } = require("./date-utils");
const { zonedParaUtc } = require("./zoned-time");

test("somarDias atravessa mês e ano sem depender do fuso da máquina", () => {
  assert.equal(somarDias("2025-12-31", 1), "2026-01-01");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
});

test("proximoDiaUtil pula o fim de semana (sem calendário de feriados)", () => {
  assert.equal(proximoDiaUtil("2026-09-17"), "2026-09-18"); // quinta -> sexta
  assert.equal(proximoDiaUtil("2026-09-18"), "2026-09-21"); // sexta -> segunda
  assert.equal(proximoDiaUtil("2026-09-19"), "2026-09-21"); // sábado -> segunda
});

test("proximaSegunda é sempre ESTRITAMENTE depois da data", () => {
  assert.equal(proximaSegunda("2026-09-11"), "2026-09-14"); // sexta
  assert.equal(proximaSegunda("2026-09-14"), "2026-09-21"); // a própria segunda -> a seguinte
  assert.equal(proximaSegunda("2026-09-13"), "2026-09-14"); // domingo
  assert.equal(diaDaSemanaIso("2026-09-13"), 7);
});

test("fimDoDiaUtc e paraDatetimeSql", () => {
  assert.equal(fimDoDiaUtc("2026-09-18").toISOString(), "2026-09-18T23:59:59.000Z");
  assert.equal(paraDatetimeSql(new Date("2026-09-18T19:30:07.471Z")), "2026-09-18 19:30:07");
});

test("zonedParaUtc respeita o horário de verão de Nova York (CFTC sexta 15:30 ET)", () => {
  assert.equal(zonedParaUtc("2026-09-18", "15:30", "America/New_York").toISOString(), "2026-09-18T19:30:00.000Z"); // EDT (UTC-4)
  assert.equal(zonedParaUtc("2025-11-21", "15:30", "America/New_York").toISOString(), "2025-11-21T20:30:00.000Z"); // EST (UTC-5)
});

test("zonedParaUtc na virada do DST dos EUA (8/mar/2026) usa o offset de cada dia", () => {
  assert.equal(zonedParaUtc("2026-03-06", "15:30", "America/New_York").toISOString(), "2026-03-06T20:30:00.000Z"); // antes: EST
  assert.equal(zonedParaUtc("2026-03-09", "15:30", "America/New_York").toISOString(), "2026-03-09T19:30:00.000Z"); // depois: EDT
});

test("zonedParaUtc: leilão LBMA 15:00 de Londres (GMT no inverno, BST no verão)", () => {
  assert.equal(zonedParaUtc("2026-01-15", "15:00", "Europe/London").toISOString(), "2026-01-15T15:00:00.000Z");
  assert.equal(zonedParaUtc("2020-07-15", "15:00", "Europe/London").toISOString(), "2020-07-15T14:00:00.000Z");
});
