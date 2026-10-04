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
    // Cada fator tem o que falta decidir ou o que o David já decidiu (ADR 0054).
    assert.ok(fator.perguntas.length + fator.decisoes.length > 0, fator.codigo);
    assert.ok(fator.dados.avaliacao?.texto, fator.codigo);
  }
});

test("todo observável citado existe no catálogo", () => {
  for (const fator of obterMetodologiaOuro().fatores) {
    for (const codigo of fator.dados.observaveis) assert.ok(buscarNoCatalogo(codigo), `${fator.codigo}: ${codigo}`);
  }
});

test("a geopolítica é o fator de evento (janela de 7 dias); os outros sete são calculados; o ouro tem prompt diário (ADR 0054)", () => {
  const { metodologia } = obterMetodologiaAtivo("OURO");
  assert.equal(metodologia.promptDiario, true);
  assert.equal(metodologia.fatores.find((f) => f.codigo === "OURO_GEOPOLITICA").evento.janelaDias, 7);
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

test("decisões do David (ADR 0054): a inflação é contexto do juro real; o COT e os bancos centrais saem das perguntas", () => {
  const { fatores, versao } = obterMetodologiaOuro();
  const fator = (codigo) => fatores.find((f) => f.codigo === codigo);
  assert.equal(versao, 2);
  assert.equal(fator("OURO_INFLACAO").contextoDe, "OURO_JUROS_REAIS");
  assert.deepEqual(fatores.filter((f) => f.contextoDe).map((f) => f.codigo), ["OURO_INFLACAO"]);
  for (const codigo of ["OURO_FUNDOS", "OURO_BANCOS_CENTRAIS"]) {
    assert.equal(fator(codigo).perguntas.length, 0, codigo);
    assert.ok(fator(codigo).decisoes.every((d) => d.includes("ADR 0054")), codigo);
  }
});
