"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, PARAMETROS_PADRAO, METODOLOGIA, decidirClima, derivarClimaMilho } = require("./clima-milho-eua.factor");
const { montarTextoPrompt } = require("./base/texto-prompt");

test("R-CLI v0: 5 p.p. abaixo da média ou queda de 3 p.p. na semana é alta; as duas, forte", () => {
  const p = PARAMETROS_PADRAO;
  const soNivel = decidirClima({ mes: 7, desvioPp: -5, variacaoSemanalPp: 0 }, p);
  assert.deepEqual([soNivel.direcao, soNivel.intensidade], ["ALTA", "MODERADA"]);
  assert.equal(decidirClima({ mes: 7, desvioPp: -4.9, variacaoSemanalPp: -2.9 }, p).direcao, "NEUTRA");
  assert.equal(decidirClima({ mes: 6, desvioPp: 0, variacaoSemanalPp: -3 }, p).direcao, "ALTA");
  assert.equal(decidirClima({ mes: 7, desvioPp: -6, variacaoSemanalPp: -3 }, p).intensidade, "FORTE");
});

test("R-CLI v0: 3 p.p. acima da média por 3 semanas seguidas é baixa; forte com a polinização concluída", () => {
  const p = PARAMETROS_PADRAO;
  assert.equal(decidirClima({ mes: 8, desvioPp: 3, variacaoSemanalPp: 0, desviosAnteriores: [4, 2.9] }, p).direcao, "NEUTRA");
  assert.equal(decidirClima({ mes: 8, desvioPp: 3, variacaoSemanalPp: 0, desviosAnteriores: [4, 3] }, p).intensidade, "MODERADA");
  assert.equal(
    decidirClima({ mes: 8, desvioPp: 3, variacaoSemanalPp: 0, desviosAnteriores: [4, 3], polinizacaoConcluida: true }, p).intensidade,
    "FORTE"
  );
  // Acima da média há 3 semanas, mas caindo 3 p.p. agora: as duas regras ao mesmo tempo, neutra.
  const conflito = decidirClima({ mes: 7, desvioPp: 4, variacaoSemanalPp: -3, desviosAnteriores: [7, 6] }, p);
  assert.deepEqual([conflito.direcao, conflito.conflito], ["NEUTRA", true]);
});

test("fora de junho a agosto a regra não vale: neutra, marcada", () => {
  const d = decidirClima({ mes: 9, desvioPp: -10, variacaoSemanalPp: -5 }, PARAMETROS_PADRAO);
  assert.deepEqual([d.direcao, d.foraDaJanela], ["NEUTRA", true]);
  assert.equal(decidirClima({ mes: 7, desvioPp: null }, PARAMETROS_PADRAO), null);
});

test("um ponto por semana: boa + excelente, a média da mesma semana em 5 anos, o desvio e o peso do mês", () => {
  const linhas = [];
  // A mesma semana (52 semanas antes) de 2021 a 2025, com 60% de boa + excelente; em 2026, 52%.
  for (let k = 0; k <= 5; k += 1) {
    const d = new Date(Date.UTC(2026, 6, 19 - 364 * k)).toISOString().slice(0, 10);
    const ge = k === 0 ? 52 : 60;
    const base = { observedAt: d, publishedAt: new Date(`${d}T20:00:00Z`), publishedAtIsEstimated: false };
    linhas.push({ ...base, seriesCode: SERIES.boa, value: ge - 10 }, { ...base, seriesCode: SERIES.excelente, value: 10 });
  }
  const ponto = derivarClimaMilho(linhas).at(-1);
  assert.equal(ponto.observedAt, "2026-07-19");
  assert.equal(ponto.boaExcelentePct, 52);
  assert.equal(ponto.media5AnosPct, 60);
  assert.equal(ponto.desvioPp, -8);
  assert.equal(ponto.pesoDoMes, "Alto");
  assert.equal(ponto.decisao.direcao, "ALTA");
});

test("o texto do prompt traz a regra própria do fator, com os limiares em uso e a lacuna do CPC", () => {
  const texto = montarTextoPrompt({
    ativo: "MILHO",
    fator: { codigo: "MILHO_CLIMA_SAFRA_EUA", nome: "Clima", peso: "Alto", proposta: { situacao: "PROPOSTA" } },
    calculo: { apresentacao: METODOLOGIA.apresentacao, periodicidade: "SEMANAL", parametros: PARAMETROS_PADRAO, factorId: METODOLOGIA.factorId, factorVersion: 1 },
    ponto: { observedAt: "2026-07-19", boaExcelentePct: 52, decisao: { direcao: "ALTA", intensidade: "MODERADA", tendencia: null } }
  });
  assert.match(texto, /só de junho a agosto .* 5,0 p\.p\. ou mais abaixo .* por 3 semanas seguidas/);
  assert.match(texto, /previsão do NOAA\/CPC .* não é aplicada/);
});
