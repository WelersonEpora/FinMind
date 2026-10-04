"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SITUACAO, montarFatores } = require("./metodologia-base");

const definicao = (codigo) => ({ codigo, fel1: { tipo: "Macroeconômico" }, dados: { observaveis: [] }, proposta: { objetivo: "x" }, perguntas: [] });

test("o fator leva o nome e o peso do FEL 1 e começa como proposta", () => {
  const [fator] = montarFatores("OURO", [definicao("OURO_DOLAR")]);
  assert.equal(fator.nomeFel1, "Dólar (índice DXY)");
  assert.equal(fator.nome, fator.nomeFel1);
  assert.equal(fator.peso, "Alto");
  assert.equal(fator.proposta.situacao, SITUACAO.PROPOSTA);
  assert.equal(fator.evento, null);
});

test("um código fora do catálogo, ou de outro ativo, é erro", () => {
  assert.throws(() => montarFatores("OURO", [definicao("OURO_INEXISTENTE")]), /OURO_INEXISTENTE/);
  assert.throws(() => montarFatores("OURO", [definicao("PETROLEO_DOLAR")]), /PETROLEO_DOLAR/);
});
