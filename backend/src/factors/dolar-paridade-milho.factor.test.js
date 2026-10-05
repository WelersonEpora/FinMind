"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, PARAMETROS_PADRAO, decidirParidade, derivarParidadeMilho } = require("./dolar-paridade-milho.factor");

const dir = (d) => d && [d.direcao, d.intensidade];

test("R-CAM-01/02 v0: alta com a paridade subindo pelo câmbio e o preço interno abaixo; baixa caindo com ele acima", () => {
  const p = PARAMETROS_PADRAO;
  assert.deepEqual(dir(decidirParidade({ variacaoPct: 4, parteCambioPct: 60, desvioBaseRs: -1 }, p)), ["ALTA", "MODERADA"]);
  // A alta pede as três condições.
  assert.equal(decidirParidade({ variacaoPct: 4, parteCambioPct: 40, desvioBaseRs: -1 }, p).direcao, "NEUTRA");
  assert.equal(decidirParidade({ variacaoPct: 4, parteCambioPct: 60, desvioBaseRs: 20 }, p).direcao, "NEUTRA");
  assert.deepEqual(dir(decidirParidade({ variacaoPct: -7, parteCambioPct: 0, desvioBaseRs: 20 }, p)), ["BAIXA", "FORTE"]);
  assert.equal(decidirParidade({ variacaoPct: -7, desvioBaseRs: -1 }, p).direcao, "NEUTRA");
  assert.equal(decidirParidade({ variacaoPct: -2.9, desvioBaseRs: 20 }, p).direcao, "NEUTRA");
  // O limiar da base é ajustável: com R$ 30, a base de Campinas contra MT (~R$ 25) passa a contar como "abaixo".
  assert.equal(decidirParidade({ variacaoPct: 4, parteCambioPct: 60, desvioBaseRs: 25 }, { ...p, limiarBaseRs: 30 }).direcao, "ALTA");
});

test("sem decisão: troca do contrato de referência ou quebra da série (30% ou mais)", () => {
  assert.equal(decidirParidade({ variacaoPct: -8, desvioBaseRs: 20, cruzaTroca: true }), null);
  assert.equal(decidirParidade({ variacaoPct: 34, parteCambioPct: 8, desvioBaseRs: -3 }), null);
  assert.equal(decidirParidade({ variacaoPct: null }), null);
});

test("um ponto por semana: variação em 10 pregões, a do dólar nas mesmas datas, a base e a troca de contrato", () => {
  // Dias úteis a partir da sexta 2024-01-05: semanas com os índices [0], [1-5], [6-10], [11-14].
  const dias = [];
  for (let d = new Date(Date.UTC(2024, 0, 5)); dias.length < 15; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dias.push(d.toISOString().slice(0, 10));
  }
  const contrato = (i) => (i < 14 ? "jul/24" : "jul/25");
  const linhas = [
    ...dias.map((d, i) => ({ seriesCode: SERIES.paridade, observedAt: d, value: 40 + (i >= 10 ? 4 : 0), publishedAt: new Date("2024-02-01"), publishedAtIsEstimated: false, metadata: { contratoReferencia: contrato(i) } })),
    ...dias.map((d) => ({ seriesCode: SERIES.preco, observedAt: d, value: 39, publishedAt: new Date(`${d}T21:00:00Z`), publishedAtIsEstimated: true }))
  ];
  const ptax = dias.map((d, i) => ({ data: d, valor: i >= 10 ? 5.3 : 5 }));
  // Janela da mediana de 4 semanas: a mediana precisa de metade dela (2 semanas antes).
  const pontos = derivarParidadeMilho(linhas, ptax, { parametros: { ...PARAMETROS_PADRAO, semanasBase: 4 } });
  assert.equal(pontos.length, 4);
  const [s1, , s2, s3] = pontos;
  assert.equal(s1.variacaoParidadePct, null);
  // 3ª semana (dia 10): paridade 40 → 44 (+10%), dólar 5 → 5,3 (+6%): 60% do câmbio; base -5, R$ 4 abaixo da mediana
  // das semanas anteriores (-1) → alta forte.
  assert.equal(s2.variacaoParidadePct, 10);
  assert.equal(s2.variacaoDolarPct, 6);
  assert.equal(s2.parteCambioPct, 60);
  assert.equal(s2.baseSaca, -5);
  assert.deepEqual([s2.medianaBaseSaca, s2.desvioBaseSaca], [-1, -4]);
  assert.equal(s1.desvioBaseSaca, null);
  assert.deepEqual(dir(s2.decisao), ["ALTA", "FORTE"]);
  // 4ª semana: o último dia já é do contrato novo.
  assert.equal(s3.cruzaTroca, true);
  assert.equal(s3.decisao, null);
});
