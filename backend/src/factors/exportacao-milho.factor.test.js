"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, derivarExportacaoMilho } = require("./exportacao-milho.factor");

const linha = (seriesCode, mes, kg) => ({
  seriesCode,
  observedAt: mes,
  value: kg,
  publishedAt: new Date(`${mes.slice(0, 7)}-28T12:00:00Z`),
  publishedAtIsEstimated: false
});

// De fev/2020 a mar/2026, 1 milhão de t por mês; em 2026, `fev` e `mar` (mil t) e a China em mar/2026.
function historico({ fev, mar, chinaMar }) {
  const linhas = [];
  for (let ano = 2020; ano <= 2026; ano += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const mes = `${ano}-${String(m).padStart(2, "0")}-01`;
      if (mes < "2020-02-01" || mes > "2026-03-01") continue;
      let milT = 1000;
      if (mes === "2026-02-01") milT = fev;
      if (mes === "2026-03-01") milT = mar;
      linhas.push(linha(SERIES.total, mes, milT * 1e6));
    }
  }
  linhas.push(linha(SERIES.china, "2026-03-01", chinaMar * 1e6), linha(SERIES.china, "2025-03-01", 100 * 1e6));
  return linhas;
}

test("o ritmo é o acumulado do ano comercial (desde fevereiro) contra a média do mesmo trecho nos 5 anos anteriores", () => {
  const ponto = derivarExportacaoMilho(historico({ fev: 1200, mar: 1300, chinaMar: 260 })).at(-1);
  assert.equal(ponto.observedAt, "2026-03-01");
  assert.equal(ponto.exportadoMilT, 1300);
  assert.equal(ponto.acumuladoMilT, 2500);
  assert.equal(ponto.media5AnosMilT, 2000);
  assert.equal(ponto.desvioPct, 25);
  assert.deepEqual([ponto.decisao.direcao, ponto.decisao.intensidade], ["ALTA", "FORTE"]);
  // A China: 20% do mês, contra 10% em mar/2025 (+10 p.p.).
  assert.equal(ponto.participacaoChinaPct, 20);
  assert.equal(ponto.participacaoChinaVariacaoPp, 10);
});

test("abaixo do ritmo é pressão de baixa; dentro de 10% é neutra; sem 5 anos completos, sem leitura", () => {
  const abaixo = derivarExportacaoMilho(historico({ fev: 800, mar: 900, chinaMar: 0 })).at(-1);
  assert.deepEqual([abaixo.desvioPct, abaixo.decisao.direcao], [-15, "BAIXA"]);
  assert.equal(abaixo.participacaoChinaPct, 0);
  const normal = derivarExportacaoMilho(historico({ fev: 1050, mar: 1000, chinaMar: 0 })).at(-1);
  assert.equal(normal.decisao.direcao, "NEUTRA");
  // Sem fev/2021, o ano comercial 2021 (o 5º anterior a 2026) fica incompleto.
  const curto = derivarExportacaoMilho(historico({ fev: 1000, mar: 1000, chinaMar: 0 }).filter((l) => l.observedAt >= "2021-03-01"));
  assert.equal(curto.at(-1).desvioPct, null);
  assert.equal(curto.at(-1).decisao, null);
});
