"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PAISES_COMEX, codigoDoPaisComex, descreverPaisComex } = require("./comex-pais");

test("tabela de países do Comex Stat: 281 países, nomes sem repetição", () => {
  const nomes = Object.values(PAISES_COMEX);
  assert.equal(nomes.length, 281);
  assert.equal(new Set(nomes).size, nomes.length);
});

test("nome -> código e código -> rótulo; desconhecido não vira código", () => {
  assert.equal(codigoDoPaisComex("China"), "160");
  assert.equal(codigoDoPaisComex("Estados Unidos"), "249");
  assert.equal(codigoDoPaisComex("Nárnia"), null);
  assert.deepEqual(descreverPaisComex("372"), { rotulo: "Irã", agregado: false });
  assert.deepEqual(descreverPaisComex("999999"), { rotulo: "999999", agregado: false });
});
