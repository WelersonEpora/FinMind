"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FATORES } = require("./fatores-fel1");
const { SITUACAO, obterMetodologiaOuro } = require("./metodologia-ouro");
const { buscarNoCatalogo } = require("../services/observaveis.service");
const { obterMetodologiaAtivo } = require("../services/metodologia-ativo.service");

test("os 8 fatores do ouro do FEL 1, na ordem da planilha, todos como proposta", () => {
  const { ativo, fatores } = obterMetodologiaOuro();
  assert.equal(ativo, "OURO");
  assert.deepEqual(
    fatores.map((f) => f.codigo),
    FATORES.filter((f) => f.ativo === "OURO").map((f) => f.codigo)
  );
  for (const fator of fatores) {
    assert.equal(fator.proposta.situacao, SITUACAO.PROPOSTA, fator.codigo);
    assert.ok(fator.perguntas.length > 0, fator.codigo);
    assert.ok(fator.dados.avaliacao?.texto, fator.codigo);
  }
});

test("todo observável citado existe no catálogo", () => {
  for (const fator of obterMetodologiaOuro().fatores) {
    for (const codigo of fator.dados.observaveis) assert.ok(buscarNoCatalogo(codigo), `${fator.codigo}: ${codigo}`);
  }
});

test("a geopolítica é o fator de evento; os outros sete são calculados; o ouro ainda não tem prompt diário", () => {
  const { metodologia } = obterMetodologiaAtivo("OURO");
  assert.equal(metodologia.promptDiario, false);
  assert.equal(obterMetodologiaAtivo("PETROLEO").metodologia.promptDiario, true);
  assert.deepEqual(
    metodologia.fatores.filter((f) => f.deEvento).map((f) => f.codigo),
    ["OURO_GEOPOLITICA"]
  );
  assert.deepEqual(
    metodologia.fatores.filter((f) => !f.calculado && !f.deEvento).map((f) => f.codigo),
    []
  );
});
