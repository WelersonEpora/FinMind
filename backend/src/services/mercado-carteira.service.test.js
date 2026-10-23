"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerMercadoParaDecisao, lerMercadoParaLiquidacao } = require("./mercado-carteira.service");
const { parametrosPadrao } = require("../carteiras/parametros");
const { calcularAtr } = require("../carteiras/atr");

const D = "2026-10-13";

// 22 pregões do CCMH27 até 09/10, um ajuste que sobe 0,1 por dia; o F27 sem liquidez; o X26 perto demais do limite.
function pregoes(ate, n) {
  const dias = [];
  for (let d = new Date(`${ate}T00:00:00Z`); dias.length < n; d.setUTCDate(d.getUTCDate() - 1)) {
    if (![0, 6].includes(d.getUTCDay())) dias.unshift(d.toISOString().slice(0, 10));
  }
  return dias;
}
const DIAS = pregoes("2026-10-09", 32);
function observacoes() {
  const linhas = [];
  DIAS.forEach((dia, i) => {
    const ajuste = 70 + i * 0.1;
    linhas.push({ series_code: "B3.CCM.CCMH27.SETTLE", observed_at: dia, value: ajuste });
    linhas.push({ series_code: "B3.CCM.CCMH27.HIGH", observed_at: dia, value: ajuste + 0.4 });
    linhas.push({ series_code: "B3.CCM.CCMH27.LOW", observed_at: dia, value: ajuste - 0.3 });
    linhas.push({ series_code: "B3.CCM.CCMH27.CONTRACTS", observed_at: dia, value: 300 });
    linhas.push({ series_code: "B3.CCM.CCMF27.SETTLE", observed_at: dia, value: ajuste - 1 });
    linhas.push({ series_code: "B3.CCM.CCMF27.CONTRACTS", observed_at: dia, value: 50 });
    linhas.push({ series_code: "B3.CCM.CCMX26.SETTLE", observed_at: dia, value: ajuste - 2 });
    linhas.push({ series_code: "B3.CCM.CCMX26.CONTRACTS", observed_at: dia, value: 5000 });
  });
  // Um dado do dia D (o pregão em curso): a decisão nunca pode vê-lo.
  linhas.push({ series_code: "B3.CCM.CCMH27.SETTLE", observed_at: D, value: 999 });
  return linhas;
}

function repoFalso(linhas) {
  const chamadas = [];
  return {
    chamadas,
    listarUltimasDatasItens: async () => ["CCMX26", "CCMF27", "CCMH27"].map((codigo) => ({ codigo })),
    buscarAsOf: async (filtro) => {
      chamadas.push(filtro);
      return linhas.filter((l) => filtro.seriesCodes.includes(l.series_code) && l.observed_at >= filtro.observadoDesde && l.observed_at <= filtro.observadoAte);
    }
  };
}

function marketQuoteFalso({ ptax = {}, selic = {} } = {}) {
  return {
    buscarSerie: async ({ instrumentCode, dataInicio, dataFim }) => {
      const fonte = instrumentCode === "USD_BRL" ? ptax : selic;
      return Object.entries(fonte)
        .filter(([d]) => d >= dataInicio && d <= dataFim)
        .sort()
        .map(([d, v]) => ({ reference_date: d, value: v }));
    }
  };
}

test("decisão: o primeiro contrato com folga até o limite e com liquidez; ATR, ajuste e variação até D−1", async () => {
  const repo = repoFalso(observacoes());
  const { mercado, cambio } = await lerMercadoParaDecisao(
    { data: D, conta: "B3", ativos: ["MILHO"], parametros: parametrosPadrao("B3", ["MILHO"]), agora: new Date(`${D}T09:30:00Z`) },
    { observationRepository: repo, marketQuoteRepository: marketQuoteFalso({ ptax: { "2026-10-09": 5.38 } }) }
  );
  const m = mercado.MILHO;
  assert.equal(m.contrato.ticker, "CCMH27");
  assert.equal(m.contrato.limite, "2027-03-15");
  assert.equal(m.dataAjuste, "2026-10-09");
  assert.ok(Math.abs(m.ajuste - (70 + 31 * 0.1)) < 1e-9);
  const barras = DIAS.map((dia, i) => ({ data: dia, ajuste: 70 + i * 0.1, maxima: 70 + i * 0.1 + 0.4, minima: 70 + i * 0.1 - 0.3 }));
  assert.ok(Math.abs(m.atr - calcularAtr(barras, 14)) < 1e-9);
  assert.ok(m.variacao30dPct > 0);
  assert.equal(m.valorDoPonto, 450);
  assert.equal(cambio, 5.38);
  // Nada depois de D−1.
  assert.ok(repo.chamadas.every((c) => c.observadoAte === "2026-10-12"));
});

test("decisão: sem contrato com liquidez, o ativo fica sem mercado, com o motivo", async () => {
  const linhas = observacoes().filter((l) => !l.series_code.startsWith("B3.CCM.CCMH27"));
  const { mercado, semMercado } = await lerMercadoParaDecisao(
    { data: D, conta: "B3", ativos: ["MILHO"], parametros: parametrosPadrao("B3", ["MILHO"]), agora: new Date() },
    { observationRepository: repoFalso(linhas), marketQuoteRepository: marketQuoteFalso() }
  );
  assert.equal(mercado.MILHO, null);
  assert.equal(semMercado.MILHO, "SEM_LIQUIDEZ");
});

test("decisão do dólar: o 1º vencimento do WDO, com a folga de 3 dias úteis; a variação de 30 dias pela PTAX", async () => {
  // O WDO parado em 5.000 (o juro embutido some até o vencimento); a PTAX sobe de 4,90 para 5,10 no período.
  const linhas = DIAS.flatMap((dia) => [
    { series_code: "B3.WDO.WDOX26.SETTLE", observed_at: dia, value: 5000 },
    { series_code: "B3.WDO.WDOX26.HIGH", observed_at: dia, value: 5030 },
    { series_code: "B3.WDO.WDOX26.LOW", observed_at: dia, value: 4970 },
    { series_code: "B3.WDO.WDOX26.CONTRACTS", observed_at: dia, value: 2000000 }
  ]);
  const repo = { ...repoFalso(linhas), listarUltimasDatasItens: async () => [{ codigo: "WDOX26" }] };
  const ptax = Object.fromEntries(DIAS.map((dia, i) => [dia, 4.9 + (0.2 * i) / (DIAS.length - 1)]));
  const { mercado } = await lerMercadoParaDecisao(
    { data: D, conta: "B3", ativos: ["DOLAR"], parametros: parametrosPadrao("B3", ["DOLAR"]), agora: new Date(`${D}T09:30:00Z`) },
    { observationRepository: repo, marketQuoteRepository: marketQuoteFalso({ ptax }) }
  );
  const m = mercado.DOLAR;
  assert.equal(m.contrato.ticker, "WDOX26");
  assert.equal(m.contrato.limite, "2026-10-30");
  assert.equal(m.valorDoPonto, 10);
  const base = [...DIAS].reverse().find((d) => d <= "2026-09-09");
  assert.ok(Math.abs(m.variacao30dPct - (ptax["2026-10-09"] / ptax[base] - 1) * 100) < 1e-9);
  assert.ok(m.variacao30dPct > 2);
});

test("liquidação: a barra do dia, a PTAX do dia e a Selic diária em 252 dias úteis", async () => {
  const linhas = [
    { series_code: "B3.CCM.CCMH27.SETTLE", observed_at: "2026-10-09", value: 73 },
    { series_code: "B3.CCM.CCMH27.HIGH", observed_at: "2026-10-09", value: 73.5 },
    { series_code: "B3.CCM.CCMH27.LOW", observed_at: "2026-10-09", value: 72.4 },
    { series_code: "B3.CCM.CCMH27.AVG", observed_at: "2026-10-09", value: 72.9 }
  ];
  const r = await lerMercadoParaLiquidacao(
    { data: "2026-10-09", tickers: { MILHO: ["CCMH27"] }, agora: new Date("2026-10-13T09:30:00Z"), hoje: D },
    { observationRepository: repoFalso(linhas), marketQuoteRepository: marketQuoteFalso({ ptax: { "2026-10-09": 5.38 }, selic: { "2026-10-08": 14.9 } }) }
  );
  assert.deepEqual(r.barras.CCMH27, { ajuste: 73, maxima: 73.5, minima: 72.4, medio: 72.9 });
  assert.equal(r.cambio, 5.38);
  assert.ok(Math.abs(r.taxaCaixaDia - (Math.pow(1.149, 1 / 252) - 1)) < 1e-12);
  assert.equal(r.diaUtil, true);
});

test("liquidação: sem o dado do dia, espera; passada a espera, é feriado (sem barra, caixa sem render, último câmbio)", async () => {
  const deps = { observationRepository: repoFalso([]), marketQuoteRepository: marketQuoteFalso({ ptax: { "2026-10-09": 5.38 }, selic: { "2026-10-09": 14.9 } }) };
  const pedido = { data: "2026-10-12", tickers: { CAFE: ["ICFZ26"] }, agora: new Date("2026-10-13T09:30:00Z") };
  assert.deepEqual(await lerMercadoParaLiquidacao({ ...pedido, hoje: "2026-10-13" }, deps), { pendente: "SEM_PTAX_DO_DIA" });
  const feriado = await lerMercadoParaLiquidacao({ ...pedido, hoje: "2026-10-16" }, deps);
  assert.deepEqual([feriado.barras, feriado.cambio, feriado.taxaCaixaDia, feriado.diaUtil], [{}, 5.38, 0, false]);
});

test("liquidação: o feriado reconhecido pelo dado de um dia posterior, sem esperar os 4 dias", async () => {
  const pedido = { data: "2026-10-12", tickers: { CAFE: ["ICFZ26"] }, agora: new Date("2026-10-14T09:30:00Z"), hoje: "2026-10-14" };
  const posterior = [{ series_code: "B3.ICF.ICFZ26.SETTLE", observed_at: "2026-10-13", value: 350 }];
  // Feriado do BCB e da B3 (12/10): a PTAX e o ajuste de 13/10 já existem.
  const ambos = { observationRepository: repoFalso(posterior), marketQuoteRepository: marketQuoteFalso({ ptax: { "2026-10-09": 5.38, "2026-10-13": 5.41 }, selic: { "2026-10-09": 14.9 } }) };
  const feriado = await lerMercadoParaLiquidacao(pedido, ambos);
  assert.deepEqual([feriado.barras, feriado.cambio, feriado.taxaCaixaDia, feriado.diaUtil], [{}, 5.38, 0, false]);
  // Na manhã de 13/10 ainda não há dado de 13/10: espera.
  assert.deepEqual(await lerMercadoParaLiquidacao({ ...pedido, hoje: "2026-10-13", agora: new Date("2026-10-13T09:30:00Z") }, ambos), { pendente: "SEM_PTAX_DO_DIA" });
  // Só a B3 fechada (com a PTAX do dia): o ajuste posterior basta; o caixa rende (dia útil do BCB).
  const soB3 = { observationRepository: repoFalso(posterior), marketQuoteRepository: marketQuoteFalso({ ptax: { "2026-10-12": 5.39 }, selic: { "2026-10-12": 14.9 } }) };
  const semPregao = await lerMercadoParaLiquidacao(pedido, soB3);
  assert.deepEqual([semPregao.barras, semPregao.cambio, semPregao.diaUtil], [{}, 5.39, true]);
  // PTAX posterior, mas sem ajuste posterior do contrato: a barra pode só estar atrasada; espera.
  const semAjuste = { observationRepository: repoFalso([]), marketQuoteRepository: marketQuoteFalso({ ptax: { "2026-10-13": 5.41 } }) };
  assert.deepEqual(await lerMercadoParaLiquidacao(pedido, semAjuste), { pendente: "SEM_PTAX_DO_DIA" });
  // Sem contrato a marcar, a PTAX posterior basta.
  const semContrato = await lerMercadoParaLiquidacao({ ...pedido, tickers: {} }, semAjuste);
  assert.equal(semContrato.diaUtil, false);
});

test("liquidação na conta internacional: o dia útil pelo Brent contínuo, o caixa pela meta do Fed, sem câmbio", async () => {
  const linhas = [
    { series_code: "YAHOO.BZ_CONTINUO.SETTLE", observed_at: "2026-10-12", value: 103.2 },
    { series_code: "YAHOO.BZ.BZF27.SETTLE", observed_at: "2026-10-12", value: 103.2 },
    { series_code: "YAHOO.BZ.BZF27.HIGH", observed_at: "2026-10-12", value: 103.73 },
    { series_code: "YAHOO.BZ.BZF27.LOW", observed_at: "2026-10-12", value: 99.01 },
    { series_code: "FRED.DFEDTARL", observed_at: "2026-10-09", value: 3.75 },
    { series_code: "FRED.DFEDTARU", observed_at: "2026-10-09", value: 4 }
  ];
  const deps = { observationRepository: repoFalso(linhas), marketQuoteRepository: marketQuoteFalso() };
  // 12/10: feriado no Brasil (sem PTAX), pregão na NYMEX.
  const r = await lerMercadoParaLiquidacao({ data: "2026-10-12", tickers: { PETROLEO: ["BZF27"] }, conta: "INTERNACIONAL", agora: new Date("2026-10-13T09:30:00Z"), hoje: "2026-10-13" }, deps);
  assert.deepEqual(r.barras.BZF27, { ajuste: 103.2, maxima: 103.73, minima: 99.01, medio: undefined });
  assert.deepEqual([r.cambio, r.diaUtil], [null, true]);
  assert.ok(Math.abs(r.taxaCaixaDia - (Math.pow(1.03875, 1 / 252) - 1)) < 1e-12);
  // 13/10 sem o Brent do dia ainda: espera; com o de 14/10 já gravado, é feriado da NYMEX.
  const pedido = { data: "2026-10-13", tickers: {}, conta: "INTERNACIONAL", agora: new Date("2026-10-14T09:30:00Z"), hoje: "2026-10-14" };
  assert.deepEqual(await lerMercadoParaLiquidacao(pedido, deps), { pendente: "SEM_PREGAO_NYMEX_DO_DIA" });
  const comPosterior = { ...deps, observationRepository: repoFalso([...linhas, { series_code: "YAHOO.BZ_CONTINUO.SETTLE", observed_at: "2026-10-14", value: 104 }]) };
  const feriado = await lerMercadoParaLiquidacao({ ...pedido, hoje: "2026-10-15", agora: new Date("2026-10-15T09:30:00Z") }, comPosterior);
  assert.deepEqual([feriado.diaUtil, feriado.taxaCaixaDia], [false, 0]);
});

test("confirmacaoDoCafe (ADR 0149): o z de 20 pregões do KC e os dois primeiros vencimentos negociados no último pregão", async () => {
  const { confirmacaoDoCafe } = require("./mercado-carteira.service");
  const dia = "2026-10-22";
  const linha = (ticker, campo, value) => ({ series_code: `B3.ICF.${ticker}.${campo}`, observed_at: dia, value });
  const repo = {
    buscarAsOf: async () => [
      linha("ICFZ26", "SETTLE", 380),
      linha("ICFZ26", "CONTRACTS", 900),
      linha("ICFH27", "SETTLE", 370),
      linha("ICFH27", "CONTRACTS", 0),
      linha("ICFK27", "SETTLE", 365),
      linha("ICFK27", "CONTRACTS", 40)
    ]
  };
  const vencimentos = ["ICFZ26", "ICFH27", "ICFK27"].map((ticker) => ({ ticker }));
  const comZ = (z) => ({ calcularMomentumKc: async () => ({ momentum: { janelas: [{ pregoes: 20, z }] } }) });

  const r = await confirmacaoDoCafe({ data: "2026-10-23", ultimoPregao: dia, vencimentos, prefixo: "B3.ICF" }, repo, comZ(1.26));
  // O H27 não negociou no dia: o 2º vencimento negociado é o K27.
  assert.deepEqual(r.vencimentos.map((v) => v.ticker), ["ICFZ26", "ICFK27"]);
  assert.equal(r.backwardation, true);
  assert.equal(r.exigeNaBaixa, true);
  assert.equal((await confirmacaoDoCafe({ data: "2026-10-23", ultimoPregao: dia, vencimentos, prefixo: "B3.ICF" }, repo, comZ(-0.4))).exigeNaBaixa, false);
  assert.equal((await confirmacaoDoCafe({ data: "2026-10-23", ultimoPregao: dia, vencimentos, prefixo: "B3.ICF" }, repo, comZ(null))).exigeNaBaixa, false);
});
