"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIE_PRODUCAO, PARAMETROS_PADRAO, decidirEtanol, derivarEtanolMilho } = require("./etanol-milho.factor");

test("R-ETA-02 v0 (a parte da EIA): 3% abaixo da média de 4 semanas é baixa; forte também abaixo do ano anterior; sem alta", () => {
  const p = PARAMETROS_PADRAO;
  assert.deepEqual([decidirEtanol({ desvio4SemanasPct: -3, anoAnteriorPct: 1 }, p).direcao, decidirEtanol({ desvio4SemanasPct: -3, anoAnteriorPct: 1 }, p).intensidade], ["BAIXA", "MODERADA"]);
  assert.equal(decidirEtanol({ desvio4SemanasPct: -5, anoAnteriorPct: -3 }, p).intensidade, "FORTE");
  assert.equal(decidirEtanol({ desvio4SemanasPct: -2.9 }, p).direcao, "NEUTRA");
  // Produção muito acima da média não dá alta: a regra de alta pede a margem.
  assert.equal(decidirEtanol({ desvio4SemanasPct: 10, anoAnteriorPct: 10 }, p).direcao, "NEUTRA");
  assert.equal(decidirEtanol({ desvio4SemanasPct: null }, p), null);
});

test("um ponto por semana: a moagem implícita e o desvio contra a média das 4 semanas anteriores", () => {
  const linhas = [1000, 1000, 1000, 1000, 930].map((valor, i) => {
    const d = new Date(Date.UTC(2026, 7, 21 + 7 * i)).toISOString().slice(0, 10);
    return { seriesCode: SERIE_PRODUCAO, observedAt: d, value: valor, publishedAt: new Date(`${d}T12:00:00Z`), publishedAtIsEstimated: false };
  });
  const pontos = derivarEtanolMilho(linhas);
  assert.equal(pontos[3].desvio4SemanasPct, null);
  const ultimo = pontos.at(-1);
  assert.equal(ultimo.desvio4SemanasPct, -7);
  assert.equal(ultimo.moagemMilhoesBuDia, 13.95);
  assert.equal(ultimo.decisao.direcao, "BAIXA");
});
