"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dataAlvoDoHorizonte, REFERENCIA_HORIZONTES: R } = require("./analise-diaria-base");

test("data-alvo: do preço recebido, nunca antes da leitura; da data da análise; e a da v1 do petróleo", () => {
  const segunda = { dataAnalise: "2026-10-05", dataPreco: "2026-10-02" };
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { ...segunda, dias: 1 }), "2026-10-05"); // o próximo pregão
  // Depois do feriado (ADR 0106, adendo): a terça com o preço de sexta conta dele; o imediato é a própria terça.
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { dataAnalise: "2026-10-13", dataPreco: "2026-10-09", dias: 1 }), "2026-10-13");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { ...segunda, dias: 7 }), "2026-10-09");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { ...segunda, dias: 90 }), "2026-12-31");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DA_ANALISE, { ...segunda, dias: 1 }), "2026-10-06");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_ULTIMO_PRECO, { ...segunda, dias: 1 }), "2026-10-03");
  assert.equal(dataAlvoDoHorizonte(R.DATA_DO_PRECO_RECEBIDO, { dataAnalise: "2026-10-05", dataPreco: null, dias: 1 }), null);
});
