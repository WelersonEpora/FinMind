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
