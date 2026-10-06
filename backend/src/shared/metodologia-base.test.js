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

// --- Pesos e relações (só na tela; o prompt leva o peso do FEL 1) ---

const BASE_PESOS = { ativo: "OURO", nome: "Ouro", versao: 1, dataVersao: "2026-10-04", doAtivo: { decisoes: [], perguntas: [] } };
const FATORES_PESOS = montarFatores("OURO", [definicao("OURO_JUROS_REAIS"), definicao("OURO_DOLAR")]);
const comPesos = (pesos) => montarMetodologia({ ...BASE_PESOS, fatores: FATORES_PESOS, pesos });

test("sem definição do especialista, os pesos são só os do FEL 1, numerados F1...Fn", () => {
  const { pesos } = comPesos(null);
  assert.equal(pesos.situacao, null);
  assert.equal(pesos.relacoes, null);
  assert.deepEqual(pesos.agregacao, []);
  assert.deepEqual(
    pesos.fatores.map((f) => [f.sigla, f.pesoFel1, f.meses, f.fixo, f.papel]),
    [
      ["F1", "Alto", null, null, null],
      ["F2", "Alto", null, null, null]
    ]
  );
});

test("o calendário vira 12 meses; o mês fora dele fica sem peso, e a condição marca os meses dela", () => {
  const { pesos } = comPesos({
    autoria: "David",
    fatores: {
      OURO_JUROS_REAIS: { meses: { Alto: [7], Médio: [6, 8] }, condicoes: [{ texto: "c", meses: [7] }, { texto: "geral" }] },
      OURO_DOLAR: { fixo: "Baixo" }
    }
  });
  assert.equal(pesos.situacao, SITUACAO.PROPOSTA);
  const [juros, dolar] = pesos.fatores;
  assert.equal(juros.meses.length, 12);
  assert.equal(juros.meses[0], null);
  assert.deepEqual(juros.meses[6], { peso: "Alto", condicao: "c" });
  assert.deepEqual(juros.meses[5], { peso: "Médio", condicao: null });
  // O que vai ao prompt, linha a linha (a condição com os meses e a geral); as notas ficam só com a explicação.
  assert.deepEqual(juros.noPrompt, ["F1 (jul): c", "F1: geral"]);
  assert.deepEqual(juros.notas, []);
  assert.equal(dolar.fixo, "Baixo");
});

test("peso desconhecido, mês repetido, mais de uma forma ou fator de outro ativo são erro", () => {
  assert.throws(() => comPesos({ fatores: { OURO_DOLAR: { meses: { Altíssimo: [1] } } } }), /peso desconhecido/);
  assert.throws(() => comPesos({ fatores: { OURO_DOLAR: { meses: { Alto: [1], Baixo: [1] } } } }), /dois pesos/);
  assert.throws(() => comPesos({ fatores: { OURO_DOLAR: { meses: { Alto: [13] } } } }), /mês inválido/);
  assert.throws(() => comPesos({ fatores: { OURO_DOLAR: { fixo: "Alto", papel: "x" } } }), /um entre/);
  assert.throws(() => comPesos({ fatores: { PETROLEO_DOLAR: { fixo: "Alto" } } }), /fora do ativo/);
});

test("a matriz de relações precisa ser completa, com símbolos da legenda e simétrica", () => {
  const simbolos = [{ simbolo: "+", significado: "média" }, { simbolo: "−", significado: "inversa" }];
  const relacoes = (a, b) => ({ simbolos, matriz: { OURO_JUROS_REAIS: [null, a], OURO_DOLAR: [b, null] } });
  assert.doesNotThrow(() => comPesos({ relacoes: relacoes("+", "+") }));
  assert.throws(() => comPesos({ relacoes: relacoes("+", "−") }), /simétrica/);
  assert.throws(() => comPesos({ relacoes: relacoes("?", "?") }), /desconhecido/);
  assert.throws(() => comPesos({ relacoes: { simbolos, matriz: { OURO_DOLAR: [null] } } }), /uma linha por fator/);
});

test("a regra de agregação diz como está no FinMind e só cita fatores do ativo", () => {
  const regra = { tema: "t", tratamento: "x", fatores: ["OURO_DOLAR"], noFinMind: { situacao: "FORA", texto: "y" } };
  assert.equal(comPesos({ agregacao: [regra] }).pesos.agregacao.length, 1);
  assert.throws(() => comPesos({ agregacao: [{ ...regra, fatores: ["MILHO_FUNDOS"] }] }), /fora do ativo/);
  assert.throws(() => comPesos({ agregacao: [{ ...regra, noFinMind: {} }] }), /situação no FinMind/);
});

test("as relações por par só citam fatores do ativo, dois de cada vez", () => {
  const par = { fatores: ["OURO_JUROS_REAIS", "OURO_DOLAR"], sentido: "s", canal: "c", defasagem: "d", tratamento: "t" };
  assert.equal(comPesos({ pares: [par] }).pesos.pares.length, 1);
  assert.throws(() => comPesos({ pares: [{ ...par, fatores: ["OURO_DOLAR", "MILHO_FUNDOS"] }] }), /fora do ativo/);
  assert.throws(() => comPesos({ pares: [{ ...par, fatores: ["OURO_DOLAR"] }] }), /fora do ativo/);
});

test("ajustes ao FEL 1: partem do texto original (do fel1 ou, no peso, do catálogo); campo desconhecido ou texto que não existe é erro", () => {
  const comAjustes = (ajustesFel1) => ({ ...definicao("OURO_DOLAR"), fel1: { tipo: "Macroeconômico", fonte: "FRED" }, ajustesFel1 });
  const [fator] = montarFatores("OURO", [
    comAjustes([
      { campo: "Fonte", noFel1: "FRED", ajuste: "FRED e BCB", origem: "Usuário, ADR X" },
      { campo: "Peso", noFel1: "Alto", ajuste: "Médio", origem: "Usuário, ADR X" }
    ])
  ]);
  assert.deepEqual(fator.ajustesFel1.map((a) => a.ajuste), ["FRED e BCB", "Médio"]);
  assert.deepEqual(montarFatores("OURO", [definicao("OURO_DOLAR")])[0].ajustesFel1, []);
  assert.throws(() => montarFatores("OURO", [comAjustes([{ campo: "Cor", noFel1: "x", ajuste: "y", origem: "z" }])]), /desconhecido/);
  assert.throws(() => montarFatores("OURO", [comAjustes([{ campo: "Fonte", noFel1: "LBMA", ajuste: "y", origem: "z" }])]), /não parte do texto/);
  assert.throws(() => montarFatores("OURO", [comAjustes([{ campo: "Peso", noFel1: "Médio", ajuste: "y", origem: "z" }])]), /não parte do texto/);
  assert.throws(() => montarFatores("OURO", [comAjustes([{ campo: "Fonte", noFel1: "FRED", ajuste: "y" }])]), /origem/);
});
