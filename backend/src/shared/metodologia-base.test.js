"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SITUACAO, montarFatores, montarMetodologia } = require("./metodologia-base");
const { obterMetodologiaPetroleo } = require("./metodologia-petroleo");
const { obterMetodologiaOuro } = require("./metodologia-ouro");

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

test("o ativo tem as decisões e as pendências dele, fora dos fatores; sem as duas listas, é erro", () => {
  const base = { ativo: "OURO", nome: "Ouro", versao: 1, dataVersao: "2026-10-04", fatores: [] };
  const metodologia = montarMetodologia({ ...base, doAtivo: { decisoes: ["d"], perguntas: [] } });
  assert.deepEqual(metodologia.doAtivo, { decisoes: ["d"], perguntas: [] });
  assert.throws(() => montarMetodologia(base), /doAtivo/);
  assert.throws(() => montarMetodologia({ ...base, doAtivo: { decisoes: [] } }), /doAtivo/);
});

test("todo ativo com metodologia diz o preço de referência decidido; o instrumento do ouro segue pendente (ADR 0055)", () => {
  for (const metodologia of [obterMetodologiaPetroleo(), obterMetodologiaOuro()]) {
    assert.ok(metodologia.doAtivo.decisoes.some((d) => d.startsWith("Preço de referência:")), metodologia.ativo);
  }
  assert.match(obterMetodologiaPetroleo().doAtivo.decisoes[0], /Brent/);
  assert.ok(obterMetodologiaOuro().doAtivo.perguntas.some((p) => p.startsWith("Instrumento operado:")));
});
