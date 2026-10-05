"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, PARAMETROS_PADRAO, decidirInsumos, derivarInsumosMilho } = require("./insumos-milho.factor");

const dir = (d) => [d.direcao, d.intensidade];

test("R-INS-01 v0 (a parte da margem): preço no custo total ou abaixo é alta; forte abaixo do operacional", () => {
  const p = PARAMETROS_PADRAO;
  assert.equal(decidirInsumos({ margemPct: 0.01 }, p).direcao, "NEUTRA");
  assert.deepEqual([decidirInsumos({ margemPct: 0 }, p).direcao, decidirInsumos({ margemPct: 0 }, p).intensidade], ["ALTA", "MODERADA"]);
  assert.equal(decidirInsumos({ margemPct: -20, precoAbaixoDoOperacional: true }, p).intensidade, "FORTE");
  // Margem muito boa sozinha não vira baixa: a regra de baixa pede também o adubo barato (a relação de troca).
  assert.equal(decidirInsumos({ margemPct: 50, margemMediaPct: 10 }, p).direcao, "NEUTRA");
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

test("R-INS v0 com a relação de troca (ADR 0074): adubo caro por 2 meses é alta; barato com margem confortável é baixa", () => {
  const p = PARAMETROS_PADRAO;
  // Adubo caro (P75 ou acima) nos 2 últimos meses, sem custo: alta moderada.
  assert.deepEqual(dir(decidirInsumos({ percentisTroca: [80, 76] }, p)), ["ALTA", "MODERADA"]);
  // Só 1 mês caro: neutra.
  assert.equal(decidirInsumos({ percentisTroca: [80, 60] }, p).direcao, "NEUTRA");
  // Adubo caro e margem no custo: forte.
  assert.deepEqual(dir(decidirInsumos({ margemPct: -3, percentisTroca: [90, 85] }, p)), ["ALTA", "FORTE"]);
  // Adubo barato (P25 ou abaixo) com a margem acima da média das safras anteriores: baixa.
  assert.deepEqual(dir(decidirInsumos({ margemPct: 20, margemMediaPct: 10, percentisTroca: [20, 40] }, p)), ["BAIXA", "MODERADA"]);
  // Adubo barato, mas a margem abaixo da média (ou sem a média): neutra.
  assert.equal(decidirInsumos({ margemPct: 5, margemMediaPct: 10, percentisTroca: [20, 40] }, p).direcao, "NEUTRA");
  assert.equal(decidirInsumos({ margemPct: 20, percentisTroca: [20, 40] }, p).direcao, "NEUTRA");
  // Sem margem e sem percentil: sem decisão.
  assert.equal(decidirInsumos({ percentisTroca: [null, null] }, p), null);
});

test("a relação de troca: a ureia do último mês publicado em R$/t ÷ o indicador médio do mês, com o percentil dos meses anteriores", () => {
  const meses = [];
  for (let k = 0; k < 64; k += 1) {
    const d = new Date(Date.UTC(2018, 6 + k, 1));
    meses.push(d.toISOString().slice(0, 10));
  }
  const pub = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 15, 23, 59, 59));
  // Ureia a US$ 300/t (FOB 300 mil ÷ 1.000 t), e nos 2 últimos meses a US$ 450/t e 500/t; PTAX 5; milho a R$ 50/saca.
  const versoesAdubo = meses.flatMap((m, i) => {
    const usd = i === 63 ? 500 : i === 62 ? 450 : 300;
    return [
      { seriesCode: "COMEX.ADUBO.UREIA.IMPORT.KG", observedAt: m, value: 1_000_000, publishedAt: pub(m) },
      { seriesCode: "COMEX.ADUBO.UREIA.IMPORT.FOB_USD", observedAt: m, value: usd * 1000, publishedAt: pub(m) }
    ];
  });
  const linhasPreco = meses.map((m) => ({ seriesCode: SERIES.preco, observedAt: m.replace(/-01$/, "-10"), value: 50, publishedAt: new Date(`${m}T21:00:00Z`) }));
  // Um pregão depois da publicação do último mês.
  linhasPreco.push({ seriesCode: SERIES.preco, observedAt: "2023-12-20", value: 50, publishedAt: new Date("2023-12-20T21:00:00Z") });
  const ptax = meses.map((m) => ({ data: m.replace(/-01$/, "-10"), valor: 5 }));
  const pontos = derivarInsumosMilho([], linhasPreco, { versoesAdubo, ptax });
  const ultimo = pontos.at(-1);
  assert.equal(ultimo.mesTroca, "out/2023");
  assert.deepEqual([ultimo.ureiaUsdT, ultimo.ureiaRsT, ultimo.relacaoTrocaUreia], [500, 2500, 50]);
  // 60 meses a 30 sacas/t e 1 a 45: o último é o maior de todos (percentil 100); o anterior também.
  assert.equal(ultimo.percentilTroca, 100);
  assert.deepEqual(dir(ultimo.decisao), ["ALTA", "MODERADA"]);
  assert.equal(ultimo.margemPct, null);
  // Antes de 60 meses anteriores, sem percentil (e sem decisão, sem margem).
  assert.equal(pontos.find((p) => p.mesTroca === "jul/2018").percentilTroca, null);
});
