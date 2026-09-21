"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { montarCsv, formatarNumero, formatarDataHoraUtc } = require("./csv");

test("montarCsv usa BOM, separador ; e CRLF", () => {
  const csv = montarCsv(["a", "b"], [["1", "2"]]);
  assert.equal(csv, "﻿a;b\r\n1;2\r\n");
});

test("montarCsv escapa campos com ;, aspas e quebra de linha", () => {
  const csv = montarCsv(["x"], [["a;b"], ['diz "oi"'], ["l1\nl2"]]);
  assert.equal(csv, '﻿x\r\n"a;b"\r\n"diz ""oi"""\r\n"l1\nl2"\r\n');
});

test("montarCsv trata null/undefined como campo vazio", () => {
  assert.equal(montarCsv(["a", "b"], [[null, undefined]]), "﻿a;b\r\n;\r\n");
});

test("formatarNumero usa vírgula decimal e não arredonda", () => {
  assert.equal(formatarNumero(5.123456), "5,123456");
  assert.equal(formatarNumero(1234), "1234");
  assert.equal(formatarNumero(null), "");
});

test("formatarDataHoraUtc aceita Date e texto, e devolve vazio sem valor", () => {
  assert.equal(formatarDataHoraUtc(new Date("2026-07-16T13:45:10.123Z")), "2026-07-16 13:45:10");
  assert.equal(formatarDataHoraUtc("2026-07-16T13:45:10Z"), "2026-07-16 13:45:10");
  assert.equal(formatarDataHoraUtc(null), "");
});
