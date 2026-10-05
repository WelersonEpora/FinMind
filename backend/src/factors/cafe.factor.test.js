"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { derivarSafraCafe } = require("./safra-cafe.factor");
const { derivarDemandaCafe } = require("./demanda-cafe.factor");
const { medirEstoques, derivarEstoquesCafe } = require("./estoques-cafe-ice.factor");
const { medirDolar } = require("./dolar-cafe.factor");
const { vencimento, decidirCustos, derivarCustosCafe } = require("./custos-cafe.factor");
const { derivarClimaCafe, anosAntes } = require("./clima-cafe.factor");
const { somarDias } = require("./base/semana-de-dias");
const fundos = require("./fundos-cafe.factor");
const juros = require("./juros-cafe.factor");

const v = (seriesCode, observedAt, publishedAt, value, estimado = false) => ({
  seriesCode,
  observedAt,
  publishedAt: new Date(publishedAt),
  value,
  publishedAtIsEstimated: estimado
});

// --- F2 safra ---------------------------------------------------------------------------------------------------

test("safra: a revisão do arábica contra o levantamento anterior da mesma safra; o 1º da safra não decide", () => {
  const A = "CONAB.CAFE.BRASIL.PRODUCAO_ARABICA";
  const pontos = derivarSafraCafe([
    v(A, "2026-01-01", "2026-02-05T12:00:00Z", 44091),
    v(A, "2026-01-01", "2026-05-21T12:00:00Z", 45772.8),
    v(A, "2026-01-01", "2026-09-24T12:00:00Z", 48213),
    v(A, "2025-01-01", "2025-12-04T12:00:00Z", 35763.1)
  ]);
  const porData = Object.fromEntries(pontos.map((p) => [p.observedAt, p]));
  // Em dez/2025, a safra mais nova era 2025; em fev/2026, a 2026, sem revisão.
  assert.equal(porData["2025-12-04"].safra, 2025);
  assert.equal(porData["2026-02-05"].revisaoArabicaPct, null);
  assert.equal(porData["2026-02-05"].decisao, null);
  assert.equal(porData["2026-09-24"].revisaoArabicaPct, 5.33);
  assert.equal(porData["2026-09-24"].contraSafraAnteriorPct, 34.81);
  // +5,33%: acima do forte de 5% -> pressão de baixa forte; +3,81%: moderada.
  assert.deepEqual([porData["2026-09-24"].decisao.direcao, porData["2026-09-24"].decisao.intensidade], ["BAIXA", "FORTE"]);
  assert.deepEqual([porData["2026-05-21"].decisao.direcao, porData["2026-05-21"].decisao.intensidade], ["BAIXA", "MODERADA"]);
});

// --- F6 demanda -------------------------------------------------------------------------------------------------

function consumo(paises, safra, publicado, valor) {
  return Array.from({ length: paises }, (_, i) => v(`USDA.PSD.CAFE.P${i}.CONSUMO`, safra, publicado, valor, true));
}

test("demanda: o crescimento do consumo mundial contra a faixa neutra de 1% a 2% do estudo", () => {
  const versoes = [...consumo(70, "2025-01-01", "2026-07-31T00:00:00Z", 100), ...consumo(70, "2026-01-01", "2026-07-31T00:00:00Z", 103.62)];
  const [ponto] = derivarDemandaCafe(versoes);
  assert.equal(ponto.crescimentoPct, 3.62);
  assert.equal(ponto.desvioFaixaPp, 2.12);
  assert.deepEqual([ponto.decisao.direcao, ponto.decisao.intensidade], ["ALTA", "MODERADA"]);
  // Na faixa (1,5%): neutra.
  const [neutro] = derivarDemandaCafe([...consumo(70, "2025-01-01", "2026-07-31T00:00:00Z", 100), ...consumo(70, "2026-01-01", "2026-07-31T00:00:00Z", 101.5)]);
  assert.equal(neutro.decisao.direcao, "NEUTRA");
});

test("demanda: com menos de 60 países nas duas safras (versões antigas parciais), sem decisão", () => {
  const [ponto] = derivarDemandaCafe([...consumo(20, "2018-01-01", "2019-06-30T00:00:00Z", 100), ...consumo(20, "2019-01-01", "2019-06-30T00:00:00Z", 50)]);
  assert.equal(ponto.paisesComparados, 20);
  assert.equal(ponto.crescimentoPct, null);
  assert.equal(ponto.decisao, null);
});

// --- F3 estoques da ICE -----------------------------------------------------------------------------------------

const ICE = "ICE.CAFE_C.ESTOQUE.TOTAL.CERTIFICADO";

test("estoques: o último pregão da semana e a variação em 4 semanas", () => {
  const semanas = medirEstoques([
    v(ICE, "2026-08-03", "2026-08-03T20:00:00Z", 260720),
    v(ICE, "2026-08-07", "2026-08-07T20:00:00Z", 250000),
    v(ICE, "2026-09-04", "2026-09-04T20:00:00Z", 225000)
  ]);
  assert.deepEqual(
    semanas.map((s) => [s.observedAt, s.estoque, s.medida]),
    [
      ["2026-08-07", 250000, null],
      ["2026-09-04", 225000, -10]
    ]
  );
});

test("estoques: sem 200 semanas de histórico não decide; com ele, a queda fora do normal pesa para alta", () => {
  const linhas = [];
  let valor = 100000;
  let sexta = "2016-01-08";
  for (let i = 0; i < 260; i += 1) {
    valor *= i % 2 ? 1.01 : 0.99;
    linhas.push(v(ICE, sexta, `${sexta}T20:00:00Z`, valor));
    sexta = somarDias(sexta, 7);
  }
  const semQueda = derivarEstoquesCafe(linhas);
  assert.equal(semQueda[150].decisao, null);
  linhas.push(v(ICE, sexta, `${sexta}T20:00:00Z`, valor * 0.6));
  const comQueda = derivarEstoquesCafe(linhas).at(-1);
  assert.equal(comQueda.percentilJanela, 0);
  assert.deepEqual([comQueda.decisao.direcao, comQueda.decisao.intensidade], ["ALTA", "FORTE"]);
});

// --- F4 câmbio --------------------------------------------------------------------------------------------------

test("câmbio: a variação da PTAX em 10 pregões, no último dia útil da semana", () => {
  const ptax = [];
  let dia = "2026-01-05";
  for (let i = 0; i < 15; i += 1) {
    if (![0, 6].includes(new Date(`${dia}T00:00:00Z`).getUTCDay())) ptax.push({ data: dia, valor: 5 + ptax.length * 0.01 });
    dia = somarDias(dia, 1);
  }
  const semanas = medirDolar(ptax);
  const ultima = semanas.at(-1);
  // 11 pregões: o último (5,10) contra 10 antes (5,00).
  assert.equal(ultima.dolar, 5.1);
  assert.equal(ultima.dolar10PregoesAntes, 5);
  assert.equal(ultima.medida, 2);
  assert.equal(semanas[0].medida, null);
});

// --- F5 custos --------------------------------------------------------------------------------------------------

test("custos: a ordem dos vencimentos do ICF e a regra da margem", () => {
  assert.equal(vencimento("ICFZ26"), "2026-12");
  assert.equal(vencimento("ICFH27"), "2027-03");
  const base = { historico: [], margemAnterior: null };
  assert.deepEqual(decidirCustos({ ...base, margemTotalPct: -20, seguidasTotal: 4, seguidasOperacional: 4 }).intensidade, "FORTE");
  assert.deepEqual(decidirCustos({ ...base, margemTotalPct: -5, seguidasTotal: 4, seguidasOperacional: 0 }).intensidade, "MODERADA");
  assert.equal(decidirCustos({ ...base, margemTotalPct: -5, seguidasTotal: 2, seguidasOperacional: 2 }).direcao, "NEUTRA");
  // Margem alta: só decide com 2 anos de histórico.
  assert.equal(decidirCustos({ ...base, margemTotalPct: 120, seguidasTotal: 0, seguidasOperacional: 0 }).direcao, "NEUTRA");
  const historico = Array.from({ length: 104 }, (_, i) => i);
  assert.equal(decidirCustos({ historico, margemAnterior: null, margemTotalPct: 200, seguidasTotal: 0, seguidasOperacional: 0 }).direcao, "BAIXA");
  assert.equal(decidirCustos({ ...base, margemTotalPct: null }), null);
});

test("custos: o vencimento mais próximo do dia, em reais, contra a mediana do custo publicado até a semana", () => {
  const pontos = derivarCustosCafe({
    linhasIcf: [
      v("B3.ICF.ICFZ26.SETTLE", "2026-10-02", "2026-10-02T22:00:00Z", 350, true),
      v("B3.ICF.ICFH27.SETTLE", "2026-10-02", "2026-10-02T22:00:00Z", 340, true)
    ],
    linhasCusto: [
      v("CONAB.CAFE_CUSTO.ARABICA.A.TOTAL_SACA", "2025-01-01", "2026-10-01T00:00:00Z", 1000),
      v("CONAB.CAFE_CUSTO.ARABICA.B.TOTAL_SACA", "2025-01-01", "2026-10-01T00:00:00Z", 1200),
      v("CONAB.CAFE_CUSTO.ARABICA.C.TOTAL_SACA", "2025-01-01", "2026-10-01T00:00:00Z", 1100),
      v("CONAB.CAFE_CUSTO.ARABICA.A.OPERACIONAL_SACA", "2025-01-01", "2026-10-01T00:00:00Z", 900),
      v("CONAB.CAFE_CUSTO.ARABICA.A.TOTAL_SACA", "2024-01-01", "2026-10-01T00:00:00Z", 500)
    ],
    ptax: [{ data: "2026-10-01", valor: 5 }]
  });
  const [ponto] = pontos;
  assert.equal(ponto.vencimento, "ICFZ26");
  // A PTAX do dia anterior, sem a do dia.
  assert.equal(ponto.precoBrl, 1750);
  // Mediana de 2025 (o ano mais novo): 1.100.
  assert.equal(ponto.custoTotalSaca, 1100);
  assert.equal(ponto.anoCusto, 2025);
  assert.equal(ponto.margemTotalPct, 59.09);
});

// --- F1 clima ---------------------------------------------------------------------------------------------------

test("clima: a mesma data anos antes, com o 29 de fevereiro", () => {
  assert.equal(anosAntes("2024-02-29", 1), "2023-02-28");
  assert.equal(anosAntes("2026-09-23", 30), "1996-09-23");
});

function climaSintetico(dataFinal, vhiFinal) {
  const linhas = [];
  for (let k = 30; k >= 1; k -= 1) {
    const data = anosAntes(dataFinal, k);
    for (const uf of ["MG", "SP", "ES", "BA"]) linhas.push(v(`NOAA_VH.CAFE.BR_${uf}.VHI`, data, `${data}T23:00:00Z`, 40 + (k % 10), true));
  }
  for (const uf of ["MG", "SP", "ES", "BA"]) linhas.push(v(`NOAA_VH.CAFE.BR_${uf}.VHI`, dataFinal, `${dataFinal}T23:00:00Z`, vhiFinal, true));
  const conab = ["MG", "SP", "ES", "BA"].map((uf, i) => v(`CONAB.CAFE.${uf}.PRODUCAO_ARABICA`, "2026-01-01", "2026-02-05T12:00:00Z", [70, 15, 10, 5][i]));
  return derivarClimaCafe(linhas, conab).at(-1);
}

test("clima: lavoura bem abaixo da mesma semana dos 30 anos pesa para alta na janela crítica", () => {
  const ponto = climaSintetico("2026-09-23", 20);
  assert.equal(ponto.posicaoRelativa, -50);
  assert.equal(ponto.pesoMgPct, 70);
  assert.equal(ponto.pesosAproximados, false);
  assert.deepEqual([ponto.decisao.direcao, ponto.decisao.intensidade], ["ALTA", "FORTE"]);
});

test("clima: fora das janelas críticas (dezembro a maio), neutra, com a medida", () => {
  const ponto = climaSintetico("2026-02-10", 20);
  assert.equal(ponto.posicaoRelativa, -50);
  assert.equal(ponto.decisao.direcao, "NEUTRA");
  assert.equal(ponto.decisao.foraDaJanela, true);
});

// --- F7 e F8: os moldes comuns ----------------------------------------------------------------------------------

test("fundos e juros do café usam os moldes comuns, com as séries do café", () => {
  assert.equal(fundos.SERIES.comprados, "CFTC.COFFEE.MM_LONG");
  assert.equal(fundos.PARAMETROS_PADRAO.limiarModeradoPct, 30);
  assert.equal(fundos.METODOLOGIA.periodicidade, "SEMANAL");
  assert.equal(juros.SERIES.treasury10a, "FRED.DGS10");
  assert.equal(juros.METODOLOGIA.factorId, "juros_cafe_treasury_10a");
});
