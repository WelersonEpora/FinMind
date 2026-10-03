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
const FATOR = {
  codigo: "PETROLEO_ESTOQUES_EIA",
  nome: "Estoques",
  nomeFel1: "Estoques",
  peso: "Alto",
  fel1: { tipo: "Fundamentalista" },
  proposta: { situacao: "PROPOSTA" },
  dados: { avaliacao: { texto: "Anda com o preço." } }
};
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
    calculo: { apresentacao: APRESENTACAO, factorId: "estoques_teste", factorVersion: 2, periodicidade: "SEMANAL", parametros: PARAMETROS, origemParametros: null, simulacao: false, ...calculo },
    ponto
  });
}

test("o bloco traz o período e as partes A (medida), B (leitura e regra), C (leitura do fator) e D (validação), nessa ordem", () => {
  const t = texto();
  assert.match(
    t,
    /^FATOR — Estoques — PETRÓLEO \(peso Alto\)\nCódigo: PETROLEO_ESTOQUES_EIA \| Tipo no FEL 1: Fundamentalista \| Regra: proposta \| Cálculo: estoques_teste v2\n/
  );
  assert.match(t, /Semana encerrada em 25\/09\/2026\. Semanal, não é tempo real\./);
  assert.match(t, /\nA — Medida:\n- Estoque: 427\.320 \(mil barris\)\n- Contexto: sem dado neste período\n/);
  assert.match(
    t,
    /\nB — Leitura:\n- Desvio: \+1,86% \(\+7\.794 mil barris\)\n- Regra aplicada \(parâmetros padrão do FinMind\): neutra entre -3,0% e \+3,0%, forte a partir de 10,0%; tendência em 4 semanas, mudança mínima de 0,25 p\.p\.\n/
  );
  assert.match(t, /\nC — Leitura do fator:\n- Pressão: alta\n- Intensidade: moderada\n- Tendência: Estável\n/);
  assert.match(t, /\nD — Validação histórica \(contexto para avaliar a relação; não entra na leitura acima\):\n- Anda com o preço\.$/);
  assert.doesNotMatch(t, /[Dd]ecisão/);
});

test("a origem dos parâmetros: versão salva ou simulação; mês num fator mensal; sem leitura e sem ponto", () => {
  assert.match(texto({ origemParametros: { versao: 2, alteradoEm: "2026-10-01T15:00:00Z" } }), /Regra aplicada \(parâmetros da versão 2, salva em 01\/10\/2026\)/);
  assert.match(texto({ simulacao: true }), /Regra aplicada \(parâmetros simulados na tela, não salvos\)/);
  assert.match(texto({ periodicidade: "MENSAL" }, { ...PONTO, observedAt: "2026-07-01" }), /Mês de 07\/2026\./);
  assert.match(texto({}, { ...PONTO, decisao: null }), /C — Leitura do fator: não calculada, o histórico até a data não basta\./);
  // Sem ponto na data, a validação histórica continua: é sobre a relação com o preço, não sobre o dia.
  const semPonto = texto({}, null);
  assert.match(semPonto, /Sem dado na data: nada do que o fator usa tinha sido publicado até ela/);
  assert.match(semPonto, /D — Validação histórica/);
});

test("a regra não ganha ponto duplo nem perde a última letra da unidade", () => {
  const apresentacao = { ...APRESENTACAO, parametros: faixa.parametrosFaixa({ unidade: "US$/barril", unidadeMudanca: "US$/barril" }) };
  assert.match(texto({ apresentacao }), /mudança mínima de 0,25 US\$\/barril\.\n/);
  assert.doesNotMatch(texto(), /p\.p\.\./);
});

test("o nome no FEL 1 não entra no texto: o título diz o dado usado", () => {
  const t = montarTextoPrompt({
    ativo: "PETROLEO",
    fator: { ...FATOR, nome: "Demanda dos EUA", nomeFel1: "Demanda global" },
    calculo: { apresentacao: APRESENTACAO, periodicidade: "SEMANAL", parametros: PARAMETROS, origemParametros: null, simulacao: false },
    ponto: PONTO
  });
  assert.doesNotMatch(t, /Nome no FEL 1|Demanda global/);
});
