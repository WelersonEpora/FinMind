"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { montarTextoPrompt } = require("./texto-prompt");
const faixa = require("./decisao-por-faixa");

const APRESENTACAO = {
  nota: "Semanal, não é tempo real.",
  quadros: [
    { camada: "A", rotulo: "Estoque", campo: "estoque", casas: 0, sufixo: "mil barris" },
    { camada: "A", rotulo: "Contexto", campo: "contexto", casas: 1, unidadeValor: "%" },
    { camada: "B", rotulo: "Desvio", campo: "desvio", casas: 2, sinal: true, unidadeValor: "%", secundario: { campo: "desvioAbs", casas: 0, sinal: true, sufixo: "mil barris" } }
  ],
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: { SUBINDO: "Subindo", CAINDO: "Caindo", ESTAVEL: "Estável" } },
  parametros: faixa.parametrosFaixa()
};
const FATOR = { nome: "Estoques", peso: "Alto", dados: { avaliacao: { texto: "Anda com o preço." } } };
const PARAMETROS = { limiarModeradoPct: 3, limiarFortePct: 10, semanasTendencia: 4, limiarTendenciaPp: 0.25 };
const PONTO = {
  observedAt: "2026-09-25",
  estoque: 427320,
  contexto: null,
  desvio: 1.86,
  desvioAbs: 7794,
  decisao: { direcao: "ALTA", intensidade: "MODERADA", tendencia: "ESTAVEL", mudancaPp: 0.1 }
};

function texto(calculo = {}, ponto = PONTO) {
  return montarTextoPrompt({
    ativo: "PETROLEO",
    fator: FATOR,
    calculo: { apresentacao: APRESENTACAO, periodicidade: "SEMANAL", parametros: PARAMETROS, origemParametros: null, simulacao: false, ...calculo },
    ponto
  });
}

test("o bloco traz o período, as medidas A e B como a tela, a decisão com a regra e a avaliação do dado", () => {
  const t = texto();
  assert.match(t, /^FATOR — Estoques — PETRÓLEO \(peso Alto\)\n/);
  assert.match(t, /Semana encerrada em 25\/09\/2026\. Semanal, não é tempo real\./);
  assert.match(t, /Medida \(A\):\n- Estoque: 427\.320 \(mil barris\)\n- Contexto: sem dado neste período/);
  assert.match(t, /Leitura \(B\):\n- Desvio: \+1,86% \(\+7\.794 mil barris\)/);
  assert.match(t, /Decisão sugerida \(C\): Pressão de alta, intensidade moderada, tendência: Estável\./);
  assert.match(t, /Regra \(parâmetros padrão do FinMind\): neutra entre -3,0% e \+3,0%, forte a partir de 10,0%; tendência em 4 semanas, mudança mínima de 0,25 p\.p\.\n/);
  assert.match(t, /Avaliação do dado e relação histórica com o preço: Anda com o preço\.$/);
});

test("a origem dos parâmetros: versão salva ou simulação; mês num fator mensal; sem decisão e sem ponto", () => {
  assert.match(texto({ origemParametros: { versao: 2, alteradoEm: "2026-10-01T15:00:00Z" } }), /Regra \(parâmetros da versão 2, salva em 01\/10\/2026\)/);
  assert.match(texto({ simulacao: true }), /Regra \(parâmetros simulados na tela, não salvos\)/);
  assert.match(texto({ periodicidade: "MENSAL" }, { ...PONTO, observedAt: "2026-07-01" }), /Mês de 07\/2026\./);
  assert.match(texto({}, { ...PONTO, decisao: null }), /Decisão sugerida \(C\): não calculada, o histórico até a data não basta\./);
  assert.match(texto({}, null), /Sem dado na data: nada do que o fator usa tinha sido publicado até ela/);
});
