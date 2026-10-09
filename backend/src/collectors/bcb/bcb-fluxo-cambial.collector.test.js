"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./bcb-fluxo-cambial.collector");

// Pontos reais de 2026-10-09 (SGS 13961, 13967 e 13970: o total é a soma do comercial com o financeiro).
const RESPOSTAS = {
  13961: [{ data: "30/09/2026", valor: "766.76300938" }, { data: "02/10/2026", valor: "470.43767147" }],
  13967: [{ data: "30/09/2026", valor: "478.98110978" }],
  13970: [{ data: "30/09/2026", valor: "287.78189960" }, { data: "01/10/2026", valor: "-232.47291933" }]
};

const baixarFn = async (url) => JSON.stringify(RESPOSTAS[/sgs\.(\d+)\//.exec(url)[1]] ?? []);
const esperar = async () => {};

test("as 10 colunas da Tabela 13 (SGS 13961 a 13970), cada uma com o seu código", () => {
  assert.deepEqual(
    collector.SERIES.map((s) => s.sgs).sort(),
    [13961, 13962, 13963, 13964, 13965, 13966, 13967, 13968, 13969, 13970]
  );
  assert.equal(new Set(collector.SERIES.map((s) => s.seriesCode)).size, 10);
});

test("coleta diária: os últimos 75 dias de cada série, um pedido por série", async () => {
  const urls = [];
  await collector.download({ hoje: "2026-10-09", esperar, baixarFn: async (url) => { urls.push(url); return baixarFn(url); } });
  assert.equal(urls.length, 10);
  assert.equal(urls[0], "https://api.bcb.gov.br/dados/serie/bcdata.sgs.13962/dados?formato=json&dataInicial=26/07/2026&dataFinal=09/10/2026");
});

test("backfill desde 2008-09-01: duas janelas de até 10 anos por série", async () => {
  assert.deepEqual(collector.dividirEmJanelas("2008-09-01", "2026-10-09"), [
    { dataInicial: "2008-09-01", dataFinal: "2017-12-31" },
    { dataInicial: "2018-01-01", dataFinal: "2026-10-09" }
  ]);
  const urls = [];
  await collector.downloadIntervalo({ dataFinal: "2026-10-09", esperar, baixarFn: async (url) => { urls.push(url); return "[]"; } });
  assert.equal(urls.length, 20);
});

test("valores em US$ milhões, saldos negativos aceitos; publicação estimada na quarta da semana seguinte", async () => {
  const { validos, invalidos } = collector.normalize(collector.parse(await collector.download({ hoje: "2026-10-09", esperar, baixarFn })));
  assert.equal(invalidos.length, 0);
  const ponto = (serie, data) => validos.find((v) => v.series_code === serie && v.observed_at === data);
  assert.equal(ponto("BCB_SGS.FLUXO_CAMBIAL.SALDO_FINANCEIRO", "2026-10-01").value, -232.47291933);
  assert.equal(ponto("BCB_SGS.FLUXO_CAMBIAL.SALDO_TOTAL", "2026-09-30").unit, "US$ milhões");
  // Quarta 30/09 e sexta 02/10 saem na quarta 07/10 (a sexta 02/10 estava na API em 09/10; o PDF de quarta 07/01/2026 ia até 02/01).
  assert.equal(ponto("BCB_SGS.FLUXO_CAMBIAL.SALDO_TOTAL", "2026-09-30").published_at.toISOString(), "2026-10-07T23:59:59.000Z");
  assert.equal(ponto("BCB_SGS.FLUXO_CAMBIAL.SALDO_TOTAL", "2026-10-02").published_at.toISOString(), "2026-10-07T23:59:59.000Z");
  assert.equal(collector.quartaDaSemanaSeguinte("2026-01-02"), "2026-01-07");
  assert.equal(collector.quartaDaSemanaSeguinte("2026-10-05"), "2026-10-14", "segunda");
  assert.ok(validos.every((v) => v.published_at_is_estimated));
});

test("resposta que não é JSON se repete e, persistindo, é falha da fonte; ponto ilegível ou repetido vira inválido", async () => {
  let chamadas = 0;
  const instavel = async (url) => (++chamadas === 1 ? "<html>Requisição inválida!</html>" : baixarFn(url));
  await collector.download({ hoje: "2026-10-09", esperar, baixarFn: instavel });
  assert.equal(chamadas, 11, "o 1º pedido repetido uma vez");
  await assert.rejects(collector.download({ hoje: "2026-10-09", esperar, baixarFn: async () => "<html>erro</html>" }), /não é JSON/);
  const { invalidos } = collector.normalize([
    { sgs: 13961, ponto: { data: "2026-10-01", valor: "1" } },
    { sgs: 13961, ponto: { data: "01/10/2026", valor: "" } },
    { sgs: 13961, ponto: { data: "02/10/2026", valor: "1" } },
    { sgs: 13961, ponto: { data: "02/10/2026", valor: "2" } }
  ]);
  assert.equal(invalidos.length, 3);
});
