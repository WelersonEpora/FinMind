"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { derivarSafraCafe, decairPelaIdade } = require("./safra-cafe.factor");
const { derivarDemandaCafe } = require("./demanda-cafe.factor");
const { medirEstoques, derivarEstoquesCafe, textoNivel } = require("./estoques-cafe-ice.factor");
const { medirDolar } = require("./dolar-cafe.factor");
const { PARAMETROS_PADRAO, decidirCustos, derivarCustosCafe } = require("./custos-cafe.factor");
const { derivarClimaCafe, anosAntes, faseEnso } = require("./clima-cafe.factor");
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

test("safra (v2, ADR 0135): o levantamento vigente perde força com a idade; os anteriores ficam como saíram", () => {
  const A = "CONAB.CAFE.BRASIL.PRODUCAO_ARABICA";
  const versoes = [v(A, "2026-01-01", "2026-05-21T12:00:00Z", 45772.8), v(A, "2026-01-01", "2026-09-24T12:00:00Z", 48213)];
  const naData = (data) => derivarSafraCafe(versoes, { dataReferencia: `${data}T12:00:00Z` }).at(-1);
  const leitura = (p) => [p.decisao.direcao, p.decisao.intensidade];
  assert.deepEqual(leitura(naData("2026-10-08")), ["BAIXA", "FORTE"], "14 dias: a leitura do levantamento");
  const reduzida = naData("2026-10-21");
  assert.deepEqual(leitura(reduzida), ["BAIXA", "MODERADA"], "27 dias: um nível abaixo");
  assert.equal(reduzida.decisao.idadeDias, 27);
  assert.match(reduzida.decisao.decaimento, /publicada há 27 dias \(de 15 a 42\): um nível abaixo/);
  assert.deepEqual([reduzida.decisaoNoLevantamento.direcao, reduzida.decisaoNoLevantamento.intensidade], ["BAIXA", "FORTE"]);
  assert.deepEqual(leitura(naData("2026-11-06")), ["NEUTRA", "FRACA"], "43 dias: neutra");
  // Sem a data da leitura (a tela do histórico), cada levantamento fica com a leitura do dia.
  assert.equal(derivarSafraCafe(versoes).at(-1).decisao.intensidade, "FORTE");
  // Moderada cai para neutra; neutra fica neutra.
  assert.equal(decairPelaIdade({ direcao: "BAIXA", intensidade: "MODERADA", tendencia: null }, 20).direcao, "NEUTRA");
  assert.equal(decairPelaIdade({ direcao: "NEUTRA", intensidade: "FRACA", tendencia: null }, 60).decaimento, undefined);
});

// --- F6 demanda -------------------------------------------------------------------------------------------------

function consumo(paises, safra, publicado, valor) {
  return Array.from({ length: paises }, (_, i) => v(`USDA.PSD.CAFE.P${i}.CONSUMO`, safra, publicado, valor, true));
}

test("demanda: o crescimento do consumo mundial contra 1,5%, com a faixa neutra calibrada de 2 p.p. (ADR 0088)", () => {
  const versoes = [...consumo(70, "2025-01-01", "2026-07-31T00:00:00Z", 100), ...consumo(70, "2026-01-01", "2026-07-31T00:00:00Z", 103.62)];
  const [ponto] = derivarDemandaCafe(versoes);
  assert.equal(ponto.crescimentoPct, 3.62);
  assert.equal(ponto.desvioFaixaPp, 2.12);
  assert.deepEqual([ponto.decisao.direcao, ponto.decisao.intensidade], ["ALTA", "MODERADA"]);
  // Na faixa (1,5%): neutra.
  const [neutro] = derivarDemandaCafe([...consumo(70, "2025-01-01", "2026-07-31T00:00:00Z", 100), ...consumo(70, "2026-01-01", "2026-07-31T00:00:00Z", 101.5)]);
  assert.equal(neutro.decisao.direcao, "NEUTRA");
  // 3% ficava fora da faixa do estudo (1% a 2%); com a calibrada (-0,5% a 3,5%), é neutro.
  const [calibrado] = derivarDemandaCafe([...consumo(70, "2025-01-01", "2026-07-31T00:00:00Z", 100), ...consumo(70, "2026-01-01", "2026-07-31T00:00:00Z", 103)]);
  assert.equal(calibrado.decisao.direcao, "NEUTRA");
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

test("estoques: as pendentes da semana e o último mês da ECF publicado até ela, como contexto (ADR 0085)", () => {
  const PEND = "ICE.CAFE_C.ESTOQUE.TOTAL.PENDENTE";
  const ECF = "ECF.CAFE.ESTOQUE_TOTAL";
  const semanas = medirEstoques([
    v(ICE, "2026-08-07", "2026-08-07T20:00:00Z", 250000),
    v(ICE, "2026-09-04", "2026-09-04T20:00:00Z", 225000),
    v(PEND, "2026-08-07", "2026-08-07T20:00:00Z", 9000),
    v(PEND, "2026-09-04", "2026-09-04T20:00:00Z", 12000),
    v(ECF, "2026-05-01", "2026-07-20T12:00:00Z", 500000),
    v(ECF, "2026-06-01", "2026-08-20T12:00:00Z", 480000),
    v(ECF, "2026-07-01", "2026-09-20T12:00:00Z", 470000)
  ]);
  const ultima = semanas.at(-1);
  assert.deepEqual([ultima.pendente, ultima.pendente4SemanasAntes], [12000, 9000]);
  // Julho só sai em 20/09: na semana de 04/09, o último conhecido é junho.
  assert.deepEqual([ultima.ecfMes, ultima.ecfToneladas, ultima.ecfToneladasAnterior], ["2026-06", 480000, 500000]);
  assert.equal(semanas[0].ecfMes, "2026-05");
});

test("estoques: um mês da ECF revisado depois da semana aparece com a versão que a semana conhecia (ADR 0085)", () => {
  const ECF = "ECF.CAFE.ESTOQUE_TOTAL";
  const semanas = medirEstoques([
    v(ICE, "2026-08-07", "2026-08-07T20:00:00Z", 250000),
    v(ECF, "2026-03-01", "2026-05-01T12:00:00Z", 410000),
    v(ECF, "2026-04-01", "2026-06-01T12:00:00Z", 408956),
    v(ECF, "2026-04-01", "2026-09-01T12:00:00Z", 400000)
  ]);
  assert.deepEqual([semanas[0].ecfMes, semanas[0].ecfToneladas, semanas[0].ecfToneladasAnterior], ["2026-04", 408956, 410000]);
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

test("estoques (v4, ADR 0131): o nível no histórico de pregões e a mínima da série, como contexto, sem mudar a decisão", () => {
  // 300 pregões (dias úteis) caindo de 1.000.000 a 701.000, com uma mínima intermediária e uma volta no fim.
  const linhas = [];
  let dia = "2025-01-01";
  for (let i = 0; i < 300; i += 1) {
    while ([0, 6].includes(new Date(`${dia}T00:00:00Z`).getUTCDay())) dia = somarDias(dia, 1);
    const valor = i === 250 ? 500000 : 1000000 - i * 1000;
    linhas.push(v(ICE, dia, `${dia}T20:00:00Z`, valor));
    dia = somarDias(dia, 1);
  }
  const semanas = medirEstoques(linhas);
  const ultima = semanas.at(-1);
  assert.equal(ultima.nivelPercentil, 0.3); // abaixo de todos os anteriores, menos a mínima de 500.000
  assert.equal(ultima.minimaSerie, 500000);
  assert.equal(ultima.nivelDesde, "2025-01-01");
  // Com menos de 1 ano de pregões (252), sem percentil.
  assert.equal(semanas[10].nivelPercentil, null);

  const [ponto] = derivarEstoquesCafe(linhas).slice(-1);
  assert.match(textoNivel(ponto), /nível do estoque no percentil 0,3 dos pregões desde 01\/2025 \(0 = o menor\); a mínima da série \(desde 01\/2025\) é de 500\.000 sacas, em /);
  assert.equal(ponto.decisao, null, "o nível não decide nada: a decisão continua sendo a da variação em 4 semanas");

  // No pregão da mínima, o texto diz que é a mínima.
  const ultimo = linhas.at(-1);
  const naMinima = medirEstoques([...linhas.slice(0, -1), { ...ultimo, value: 400000 }]).at(-1);
  assert.equal(naMinima.minimaSerie, 400000);
  assert.match(textoNivel(naMinima), /; é a mínima da série \(desde 01\/2025\)$/);
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
  // Sem o KC, sem o preço em reais.
  assert.equal(ultima.kcReais, null);
});

test("câmbio v2 (ADR 0136): o KC em reais no último pregão até o fim da semana e o percentil nas semanas anteriores", () => {
  const ptax = [];
  const kc = [];
  let dia = "2020-01-06";
  // ~5 anos de dias úteis: PTAX fixa em 5; o KC sobe 0,05 US¢/lb por dia.
  while (ptax.length < 1400) {
    if (![0, 6].includes(new Date(`${dia}T00:00:00Z`).getUTCDay())) {
      ptax.push({ data: dia, valor: 5 });
      kc.push({ data: dia, valor: 100 + kc.length * 0.05 });
    }
    dia = somarDias(dia, 1);
  }
  const semanas = medirDolar(ptax, kc);
  const ultima = semanas.at(-1);
  // US¢/lb x 1,32277 = US$/saca (132,277 lb); x PTAX = R$/saca.
  const kcUltimo = kc.at(-1).valor;
  assert.equal(ultima.kcData, kc.at(-1).data);
  assert.equal(ultima.kcReais, Math.round(kcUltimo * 1.32277 * 5 * 100) / 100);
  // O preço só sobe: o maior das 260 semanas anteriores.
  assert.equal(ultima.percentilKcReais, 100);
  // Antes de 200 semanas com preço, sem percentil.
  assert.equal(semanas[150].percentilKcReais, null);
  // Um KC velho (mais de 7 dias antes do fim da semana) não vale.
  const semKcRecente = medirDolar(ptax, kc.slice(0, 10));
  assert.equal(semKcRecente.at(-1).kcReais, null);
});

// --- F5 custos --------------------------------------------------------------------------------------------------

test("custos v3 (ADR 0138): a regra por faixa de margem", () => {
  const leitura = (margemTotalPct, seguidasTotal = 0, seguidasOperacional = 0) => {
    const d = decidirCustos({ margemTotalPct, seguidasTotal, seguidasOperacional, margemAnterior: null });
    return `${d.direcao} ${d.intensidade}`;
  };
  // Abaixo do custo por 4 semanas: forte sobre o operacional, moderada sobre o total.
  assert.equal(leitura(-20, 4, 4), "ALTA FORTE");
  assert.equal(leitura(-5, 4, 0), "ALTA MODERADA");
  // Abaixo do custo há só 2 semanas, ou até 15% acima: o preço perto do custo, alta fraca.
  assert.equal(leitura(-5, 2, 2), "ALTA FRACA");
  assert.equal(leitura(15), "ALTA FRACA");
  assert.equal(leitura(15.01), "NEUTRA FRACA");
  assert.equal(leitura(200), "NEUTRA FRACA");
  assert.equal(leitura(200.01), "BAIXA MODERADA");
  // Os limiares são parâmetros do Comitê.
  const d = decidirCustos({ margemTotalPct: 120, seguidasTotal: 0, seguidasOperacional: 0, margemAnterior: 100 }, { ...PARAMETROS_PADRAO, margemAltaPct: 100 });
  assert.equal(d.direcao, "BAIXA");
  assert.equal(d.tendencia, "SUBINDO");
  assert.equal(decidirCustos({ margemTotalPct: null }), null);
});

test("custos: o KC da semana, em reais, contra a mediana do custo publicado até a semana", () => {
  const pontos = derivarCustosCafe({
    linhasKc: [
      v("YAHOO.KC_CONTINUO.SETTLE", "2026-10-01", "2026-10-01T22:00:00Z", 300),
      v("YAHOO.KC_CONTINUO.SETTLE", "2026-10-02", "2026-10-02T22:00:00Z", 264.6)
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
  // Uma semana: o último pregão dela (02/10).
  assert.equal(pontos.length, 1);
  const [ponto] = pontos;
  assert.equal(ponto.ultimoPregao, "2026-10-02");
  // 264,6 US¢/lb x 1,32277 = US$ 350,00/saca; a PTAX do dia anterior (5), sem a do dia.
  assert.equal(ponto.precoUsd, 350);
  assert.equal(ponto.precoBrl, 1750.02);
  // Mediana de 2025 (o ano mais novo): 1.100.
  assert.equal(ponto.custoTotalSaca, 1100);
  assert.equal(ponto.anoCusto, 2025);
  assert.equal(ponto.margemTotalPct, 59.09);
  assert.equal(ponto.decisao.direcao, "NEUTRA");
  // Sem o mês dos preços, dezembro de 2025 + 12 meses fica depois da coleta: vale a coleta.
  assert.equal(ponto.custoConhecidoDesde, "2026-10-01");
  assert.equal(ponto.custoEstimado, false);
});

test("custos v2 (ADR 0137): o custo conta como conhecido 12 meses depois do mês dos preços, data estimada", () => {
  const comMes = (linha, mes) => ({ ...linha, metadata: { mesReferenciaPrecos: mes } });
  const coleta = "2026-10-01T00:00:00Z";
  const pontos = derivarCustosCafe({
    linhasKc: [
      v("YAHOO.KC_CONTINUO.SETTLE", "2022-11-25", "2022-11-25T22:00:00Z", 170),
      v("YAHOO.KC_CONTINUO.SETTLE", "2023-11-24", "2023-11-24T22:00:00Z", 190)
    ],
    linhasCusto: [
      // 2021, preços de nov/2021: conhecido em 01/11/2022.
      comMes(v("CONAB.CAFE_CUSTO.ARABICA.A.TOTAL_SACA", "2021-01-01", coleta, 600), "2021-11"),
      // 2022, preços de nov/2022: conhecido só em 01/11/2023.
      comMes(v("CONAB.CAFE_CUSTO.ARABICA.A.TOTAL_SACA", "2022-01-01", coleta, 800), "2022-11")
    ],
    ptax: [{ data: "2022-11-25", valor: 5 }, { data: "2023-11-24", valor: 5 }]
  });
  assert.deepEqual(
    pontos.map((p) => [p.anoCusto, p.custoTotalSaca, p.custoConhecidoDesde, p.custoEstimado, p.disponivelEmEhEstimado]),
    [
      [2021, 600, "2022-11-01", true, true],
      [2022, 800, "2023-11-01", true, true]
    ]
  );
});

// --- F1 clima ---------------------------------------------------------------------------------------------------

test("clima: a mesma data anos antes, com o 29 de fevereiro", () => {
  assert.equal(anosAntes("2024-02-29", 1), "2023-02-28");
  assert.equal(anosAntes("2026-09-23", 30), "1996-09-23");
});

function climaSintetico(dataFinal, vhiFinal, versoesRoni = []) {
  const linhas = [];
  for (let k = 30; k >= 1; k -= 1) {
    const data = anosAntes(dataFinal, k);
    for (const uf of ["MG", "SP", "ES", "BA"]) linhas.push(v(`NOAA_VH.CAFE.BR_${uf}.VHI`, data, `${data}T23:00:00Z`, 40 + (k % 10), true));
  }
  for (const uf of ["MG", "SP", "ES", "BA"]) linhas.push(v(`NOAA_VH.CAFE.BR_${uf}.VHI`, dataFinal, `${dataFinal}T23:00:00Z`, vhiFinal, true));
  const conab = ["MG", "SP", "ES", "BA"].map((uf, i) => v(`CONAB.CAFE.${uf}.PRODUCAO_ARABICA`, "2026-01-01", "2026-02-05T12:00:00Z", [70, 15, 10, 5][i]));
  return derivarClimaCafe(linhas, conab, { versoesRoni }).at(-1);
}

test("clima: lavoura bem abaixo da mesma semana dos 30 anos pesa para alta na janela crítica", () => {
  const ponto = climaSintetico("2026-09-23", 20);
  assert.equal(ponto.posicaoRelativa, -50);
  assert.equal(ponto.pesoMgPct, 70);
  assert.equal(ponto.pesosAproximados, false);
  assert.deepEqual([ponto.decisao.direcao, ponto.decisao.intensidade], ["ALTA", "FORTE"]);
});

test("clima (v3, ADRs 0134 e 0143): o RONI conhecido na semana, com a força do CPC e 3 meses antes; com +1,0 ou mais, a pressão do El Niño só no LONGO, sem mudar a decisão", () => {
  const RONI = "NOAA_CPC.ENSO.RONI";
  const versoes = [
    v(RONI, "2026-04-01", "2026-06-14T23:59:59Z", 0.2, true),
    v(RONI, "2026-07-01", "2026-09-14T23:59:59Z", 1.36, true),
    // Publicado depois da semana de 23/09: não é conhecido nela.
    v(RONI, "2026-08-01", "2026-10-14T23:59:59Z", 1.69, true)
  ];
  const ponto = climaSintetico("2026-09-23", 20, versoes);
  assert.equal(ponto.roni, 1.36);
  assert.equal(
    ponto.roniTexto,
    "jun-ago/2026 (JJA): El Niño moderado; 3 meses antes, +0,20 °C (neutro). Com o RONI de +1,0 ou mais, pressão de alta fraca só no horizonte LONGO (abaixo)."
  );
  assert.deepEqual(ponto.pressoesAdicionais, [
    { origem: "El Niño", horizonte: "LONGO", direcao: "ALTA", intensidade: "FRACA", texto: "RONI de +1,36 °C em jun-ago/2026, acima de +1,0" }
  ]);
  assert.deepEqual([ponto.decisao.direcao, ponto.decisao.intensidade], ["ALTA", "FORTE"], "a decisão é a do VHI");
  // Fora da janela do VHI (fevereiro), a pressão do El Niño continua: vale o ano todo no LONGO.
  assert.equal(climaSintetico("2027-02-10", 20, versoes).pressoesAdicionais.length, 1);

  // Abaixo do limiar: só contexto.
  const fraco = climaSintetico("2026-09-23", 20, [v(RONI, "2026-07-01", "2026-09-14T23:59:59Z", 0.8, true)]);
  assert.deepEqual(fraco.pressoesAdicionais, []);
  assert.match(fraco.roniTexto, /Contexto de regime, sem pressão própria \(a pressão do El Niño, só no LONGO, liga com o RONI de \+1,0 ou mais\)\.$/);
  assert.equal(climaSintetico("2026-09-23", 20).roni, null);
  assert.deepEqual(climaSintetico("2026-09-23", 20).pressoesAdicionais, []);
  assert.deepEqual([faseEnso(0.4), faseEnso(-0.6), faseEnso(1.69), faseEnso(2.16)], ["neutro", "La Niña fraca", "El Niño forte", "El Niño muito forte"]);
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

test("fundos (v2, ADR 0132): o percentil nos 10 anos anteriores vai como contexto, ao lado do de 3 anos que decide", () => {
  // 560 terças: a líquida sobe devagar (0 a 399) e depois fica num recorde (1.000) por 2 anos; a última semana volta a 300.
  // Em 3 anos, o recorde faz a semana parecer vendida em extremo; em 10, ela fica no meio.
  const linhas = [];
  let terca = "2015-12-29";
  for (let i = 0; i < 560; i += 1) {
    const liquida = i === 559 ? 300 : i < 400 ? i : 1000;
    const pub = `${somarDias(terca, 3)}T20:00:00Z`;
    linhas.push(v(fundos.SERIES.comprados, terca, pub, liquida + 5000), v(fundos.SERIES.vendidos, terca, pub, 5000), v(fundos.SERIES.contratosEmAberto, terca, pub, 10000));
    terca = somarDias(terca, 7);
  }
  const ultimo = fundos.derivarFundosCafe(linhas).at(-1);
  assert.ok(ultimo.percentilJanela < 10, `3 anos: ${ultimo.percentilJanela}`);
  assert.ok(ultimo.percentilContexto > 40, `10 anos: ${ultimo.percentilContexto}`);
  assert.ok(fundos.METODOLOGIA.apresentacao.quadros.some((q) => q.campo === "percentilContexto" && q.camada === "B"));
});

test("juros: o dólar global em 26 semanas vai como contexto, sem mudar a decisão (ADR 0090, revisão)", () => {
  // O Treasury sobe 1 p.p. em 26 semanas (de 3% a 4%), um valor por sexta; o índice do dólar, também por sexta.
  const linhas = (dolarFinal) => {
    const out = [];
    let sexta = "2026-01-02";
    for (let i = 0; i <= 26; i += 1) {
      out.push(v("FRED.DGS10", sexta, `${somarDias(sexta, 3)}T12:00:00Z`, 3 + i / 26));
      out.push(v("FRED.DTWEXBGS", sexta, `${somarDias(sexta, 3)}T12:00:00Z`, i === 26 ? dolarFinal : 120));
      sexta = somarDias(sexta, 7);
    }
    return out;
  };
  const subindo = juros.derivarJurosCafe(linhas(126)).at(-1);
  assert.equal(subindo.variacaoDolar26Semanas, 5);
  assert.deepEqual([subindo.decisao.direcao, subindo.decisao.intensidade], ["BAIXA", "FORTE"]);
  const caindo = juros.derivarJurosCafe(linhas(114)).at(-1);
  assert.equal(caindo.variacaoDolar26Semanas, -5);
  assert.equal(caindo.decisao.direcao, "BAIXA");
  assert.match(juros.METODOLOGIA.explicar(caindo)[0], /contexto, fora da decisão/);
  const semIndice = juros.derivarJurosCafe(linhas(126).filter((l) => l.seriesCode !== "FRED.DTWEXBGS")).at(-1);
  assert.equal(semIndice.variacaoDolar26Semanas, null);
});

test("safra (v3, ADR 0135, adendo): a Conab contra o USDA (PSD) da mesma safra, o conhecido quando ela publicou, como contexto", () => {
  const A = "CONAB.CAFE.BRASIL.PRODUCAO_ARABICA";
  const U = "USDA.PSD.CAFE.BR.PRODUCAO_ARABICA";
  const versoes = [
    v(A, "2026-01-01", "2026-05-21T12:00:00Z", 45772.8),
    v(A, "2026-01-01", "2026-09-24T12:00:00Z", 48213),
    v(U, "2026-01-01", "2026-06-30T12:00:00Z", 46000, true),
    // Publicado depois do levantamento de 24/09: não é o que se sabia nele.
    v(U, "2026-01-01", "2026-12-15T12:00:00Z", 49000)
  ];
  const [maio, setembro] = derivarSafraCafe(versoes);
  assert.equal(maio.observedAt, "2026-05-21");
  assert.equal(maio.contraUsdaPct, null, "o USDA de 2026/27 ainda não existia em maio");
  assert.equal(setembro.usdaArabica, 46000);
  assert.equal(setembro.contraUsdaPct, 4.81);
  assert.equal(
    setembro.usdaTexto,
    "USDA (PSD), conhecido até o levantamento: 46.000 mil sacas para 2026/27, publicado em 06/2026 (data estimada). Outra estimativa oficial, não a expectativa do mercado: contexto, sem pressão própria."
  );
  // O USDA não vira levantamento nem muda a revisão.
  assert.equal(derivarSafraCafe(versoes).length, 2);
  assert.equal(setembro.revisaoArabicaPct, 5.33);
});
