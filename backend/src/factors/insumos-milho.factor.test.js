"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, PARAMETROS_PADRAO, decidirInsumos, derivarInsumosMilho } = require("./insumos-milho.factor");

test("R-INS-01 v0 (a parte da margem): preço no custo total ou abaixo é alta; forte abaixo do operacional; sem baixa", () => {
  const p = PARAMETROS_PADRAO;
  assert.equal(decidirInsumos({ margemPct: 0.01 }, p).direcao, "NEUTRA");
  assert.deepEqual([decidirInsumos({ margemPct: 0 }, p).direcao, decidirInsumos({ margemPct: 0 }, p).intensidade], ["ALTA", "MODERADA"]);
  assert.equal(decidirInsumos({ margemPct: -20, precoAbaixoDoOperacional: true }, p).intensidade, "FORTE");
  // Margem muito boa não vira baixa: a regra de baixa pede a relação de troca (preço do fertilizante).
  assert.equal(decidirInsumos({ margemPct: 50 }, p).direcao, "NEUTRA");
});

test("point-in-time: a semana só usa o custo que o IMEA já tinha publicado; sem custo, sem ponto", () => {
  const custo = (serie, valor, publicado) => ({ seriesCode: serie, observedAt: "2025-09-01", value: valor, publishedAt: new Date(publicado), publishedAtIsEstimated: false });
  const versoes = [
    custo(SERIES.custoTotal, 6000, "2026-09-15T12:00:00Z"),
    custo(SERIES.custoOperacional, 4500, "2026-09-15T12:00:00Z"),
    custo(SERIES.produtividade, 100, "2026-09-15T12:00:00Z")
  ];
  const preco = (d, v) => ({ seriesCode: SERIES.preco, observedAt: d, value: v, publishedAt: new Date(`${d}T21:00:00Z`), publishedAtIsEstimated: true });
  const pontos = derivarInsumosMilho(versoes, [preco("2026-09-10", 55), preco("2026-09-17", 60), preco("2026-09-18", 57)]);
  // A semana de 10/09 (antes da publicação do custo) fica de fora; a de 18/09 usa o último pregão dela.
  assert.equal(pontos.length, 1);
  assert.equal(pontos[0].observedAt, "2026-09-18");
  assert.equal(pontos[0].custoTotalSaca, 60);
  assert.equal(pontos[0].margemPct, -5);
  assert.deepEqual([pontos[0].decisao.direcao, pontos[0].decisao.intensidade], ["ALTA", "MODERADA"]);
});
