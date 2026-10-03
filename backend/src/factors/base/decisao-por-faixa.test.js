"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decidirPorFaixa, explicarPorFaixa, exemplosPorFaixa } = require("./decisao-por-faixa");

const PARAMS = { limiarModeradoPct: 3, limiarFortePct: 10, semanasTendencia: 4, limiarTendenciaPp: 2 };

test("direção pela faixa: neutra dentro, alta abaixo, baixa acima; nula sem valor", () => {
  assert.equal(decidirPorFaixa(2.99, null, PARAMS).direcao, "NEUTRA");
  assert.equal(decidirPorFaixa(-3, null, PARAMS).direcao, "ALTA");
  assert.equal(decidirPorFaixa(3, null, PARAMS).direcao, "BAIXA");
  assert.equal(decidirPorFaixa(null, null, PARAMS), null);
});

test("intensidade e tendência pelos limiares", () => {
  assert.equal(decidirPorFaixa(-10, null, PARAMS).intensidade, "FORTE");
  assert.equal(decidirPorFaixa(5, null, PARAMS).intensidade, "MODERADA");
  assert.deepEqual(decidirPorFaixa(5, 4, PARAMS), { direcao: "BAIXA", intensidade: "MODERADA", tendencia: "ESTAVEL", mudancaPp: 1 });
  assert.equal(decidirPorFaixa(5, 8, PARAMS).tendencia, "CAINDO");
  assert.equal(decidirPorFaixa(5, 2, PARAMS).tendencia, "SUBINDO");
});

const TEXTOS = {
  campo: "medida",
  primeiroPasso: (p) => `A medida é ${p.medida}.`,
  nomeValor: "a medida",
  abaixo: "abaixo é aperto",
  acima: "acima é sobra",
  subindo: "está subindo",
  caindo: "está caindo",
  rotulosTendencia: { SUBINDO: "Sobe", CAINDO: "Desce", ESTAVEL: "Parada" }
};

test("explicação: os passos com os números e os textos do fator", () => {
  const ponto = { medida: -12.52, decisao: decidirPorFaixa(-12.52, -15.18, PARAMS) };
  const passos = explicarPorFaixa(ponto, PARAMS, TEXTOS);
  assert.equal(passos[0], "A medida é -12.52.");
  assert.match(passos[1], /-12,52% está abaixo de −3,0%: abaixo é aperto → Pressão de alta/);
  assert.match(passos[2], /12,52% é 10,0% ou mais → Forte/);
  assert.match(passos[3], /a medida era -15,18%; mudou \+2,66 p\.p\.: subiu 2,0 p\.p\. ou mais, está subindo → Sobe/);
  assert.deepEqual(explicarPorFaixa({ medida: null, decisao: null }, PARAMS, TEXTOS), []);
});

test("exemplos: semanas reais pelo histórico e cenários pela mesma regra", () => {
  const pontos = [{ observedAt: "2022-06-24", medida: -12.5, decisao: { direcao: "ALTA" } }];
  const { episodios, cenarios } = exemplosPorFaixa(pontos, PARAMS, {
    campo: "medida",
    episodios: [{ data: "2022-06-24", rotulo: "a" }, { data: "2020-06-26", rotulo: "b" }],
    cenarios: [{ valor: -5, valorAnterior: -5, rotulo: "c" }]
  });
  assert.deepEqual(episodios[0], { data: "2022-06-24", rotulo: "a", valor: -12.5, decisao: { direcao: "ALTA" } });
  assert.equal(episodios[1].decisao, null);
  assert.equal(cenarios[0].decisao.direcao, "ALTA");
});

test("sentido: com acimaPressiona = ALTA (demanda), acima da faixa é alta e abaixo é baixa; a explicação acompanha", () => {
  assert.equal(decidirPorFaixa(4, null, PARAMS, "ALTA").direcao, "ALTA");
  assert.equal(decidirPorFaixa(-4, null, PARAMS, "ALTA").direcao, "BAIXA");
  assert.equal(decidirPorFaixa(1, null, PARAMS, "ALTA").direcao, "NEUTRA");
  const passos = explicarPorFaixa({ medida: 4, decisao: decidirPorFaixa(4, null, PARAMS, "ALTA") }, PARAMS, TEXTOS);
  assert.match(passos[1], /\+4,00% está acima de \+3,0%: acima é sobra → Pressão de alta\./);
  const { cenarios } = exemplosPorFaixa([], PARAMS, { campo: "medida", episodios: [], cenarios: [{ valor: 4, valorAnterior: 4, rotulo: "x" }], acimaPressiona: "ALTA" });
  assert.equal(cenarios[0].decisao.direcao, "ALTA");
});
