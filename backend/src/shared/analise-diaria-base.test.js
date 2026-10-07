"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dataAlvoDoHorizonte, precoDoPregaoAnterior, REFERENCIA_HORIZONTES: R } = require("./analise-diaria-base");

test("pregão anterior (ADR 0106): sem dia útil entre o preço e a leitura", () => {
  assert.equal(precoDoPregaoAnterior("2026-10-06", "2026-10-07"), true); // terça -> quarta
  assert.equal(precoDoPregaoAnterior("2026-10-02", "2026-10-05"), true); // sexta -> segunda
  assert.equal(precoDoPregaoAnterior("2026-10-02", "2026-10-03"), true); // sexta -> sábado
  assert.equal(precoDoPregaoAnterior("2026-10-07", "2026-10-07"), true); // o do próprio dia
  assert.equal(precoDoPregaoAnterior("2026-09-29", "2026-10-03"), false); // terça -> sábado: três dias úteis no meio
  assert.equal(precoDoPregaoAnterior(null, "2026-10-03"), false);
});

test("data-alvo: do preço recebido, nunca antes da leitura; da data da análise; e a da v1 do petróleo", () => {
  const segunda = { dataAnalise: "2026-10-05", dataPreco: "2026-10-02" };
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { ...segunda, dias: 1 }), "2026-10-05"); // o próximo pregão
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { ...segunda, dias: 7 }), "2026-10-09");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { ...segunda, dias: 90 }), "2026-12-31");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DA_ANALISE, { ...segunda, dias: 1 }), "2026-10-06");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_ULTIMO_PRECO, { ...segunda, dias: 1 }), "2026-10-03");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { dataAnalise: "2026-10-05", dataPreco: null, dias: 1 }), null);
});
