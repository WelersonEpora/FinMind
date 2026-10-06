"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const coletor = require("./eia-steo.collector");
const { lerEdicao } = require("./eia-steo.parser");
const { resolverIntervalo } = require("../../../scripts/backfill-eia-steo");

const MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Uma planilha no formato do STEO: 2025 e 2026, com o histórico até `ultimo` (índice do mês, 0 = jan/2025) nos
// países e os totais seguindo na previsão.
function planilha({ aba = "3dtab", ultimo = 19, comData = true, extras = [] } = {}) {
  const anos = [null, null];
  const meses = [comData ? "Thursday, September 3, 2026" : null, null];
  for (const ano of [2025, 2026]) {
    MESES.forEach((m, i) => {
      anos.push(i === 0 ? ano : null);
      meses.push(m);
    });
  }
  const serie = (codigo, nome, base, comPrevisao) => [codigo, nome, ...Array.from({ length: 24 }, (_, i) => (i <= ultimo || comPrevisao ? base + i / 100 : "-  "))];
  const linhas = [
    ["Table of Contents", "Table 3d.  World Crude Oil Production (million barrels per day)"],
    [null, "U.S. Energy Information Administration  |  Short-Term Energy Outlook  - September 2026"],
    [comData ? "Forecast date:" : null, null, ...anos.slice(2)],
    meses,
    serie("copr_opecplus", "OPEC+ total (b)", 30, true),
    serie("copr_opec", "OPEC total (c)", 25, true),
    serie("copr_sa", "Saudi Arabia", 9, false),
    serie("copr_IR", "Iran", 3, false),
    serie("copr_opecplus", "OPEC+ total (b)", 99, true),
    serie("copr_rs", "Russia", 9, false),
    serie("cops_opec", "OPEC total", 2, true),
    serie("copr_world", "World total", 80, true),
    ...extras.map(([codigo, nome]) => serie(codigo, nome, 1, false))
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Contents"]]), "Contents");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), aba);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

test("parser: acha a tabela pela Arábia Saudita, grava só os meses históricos e usa o 1º total da OPEP+ repetido", () => {
  const e = lerEdicao(planilha());
  assert.equal(e.tabela, "3dtab");
  assert.equal(e.ultimoMes, "2026-08");
  assert.equal(e.dataEdicao, "2026-09-03");
  const meses = new Set(e.valores.map((v) => v.mes));
  assert.ok(!meses.has("2026-09"), "a previsão não entra");
  assert.equal(meses.size, 20);
  const opecPlus = e.valores.filter((v) => v.serie === "PETROLEO.OPEP_MAIS.PRODUCAO");
  assert.equal(opecPlus.length, 20);
  assert.equal(opecPlus[0].valor, 30, "o bloco repetido (99) é ignorado");
  assert.ok(e.valores.some((v) => v.serie === "PETROLEO.IR.PRODUCAO"), "o código em maiúsculas (copr_IR) é lido");
  assert.ok(e.valores.some((v) => v.serie === "PETROLEO.RU.PRODUCAO"));
  assert.ok(e.valores.some((v) => v.serie === "PETROLEO.OPEP.CAPACIDADE_OCIOSA"));
  assert.ok(!e.valores.some((v) => v.codigoEia === "copr_world"), "o total mundial não é coletado");
});

test("parser: país sem mapa fica de fora e é listado; edição antiga (3c, sem data) também é lida", () => {
  const e = lerEdicao(planilha({ aba: "3ctab", comData: false, extras: [["copr_zz", "Atlântida"]] }));
  assert.equal(e.tabela, "3ctab");
  assert.equal(e.dataEdicao, null);
  assert.deepEqual(e.desconhecidos, ["copr_zz"]);
});

test("parser: sem a tabela da OPEP, erro", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), "1tab");
  assert.throws(() => lerEdicao(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })), /copr_sa/);
});

test("URL da edição: XLSX desde 2014, XLS até 2013 (cada um com o outro como 2ª tentativa)", () => {
  assert.deepEqual(coletor.urlsDaEdicao("2026-09"), [
    "https://www.eia.gov/outlooks/steo/archives/sep26_base.xlsx",
    "https://www.eia.gov/outlooks/steo/archives/sep26_base.xls"
  ]);
  assert.equal(coletor.urlsDaEdicao("2012-06")[0], "https://www.eia.gov/outlooks/steo/archives/jun12_base.xls");
});

test("published_at: fim da quarta depois da 1ª quinta do mês, estimado pela edição", () => {
  // Jan/2016: 1ª quinta 07, divulgação na terça 12 (conferida), estimativa no fim da quarta 13.
  assert.equal(coletor.publicacao("2016-01").published_at.toISOString(), "2016-01-13T23:59:59.000Z");
  // Out/2026: a 1ª quinta é o dia 1.
  assert.equal(coletor.publicacao("2026-10").published_at.toISOString(), "2026-10-07T23:59:59.000Z");
  const p = coletor.publicacao("2026-09");
  assert.equal(p.published_at.toISOString(), "2026-09-09T23:59:59.000Z");
  assert.equal(p.published_at_is_estimated, true);
  assert.equal(p.published_at_basis, "edition_lag_rule");
});

test("normalize: uma observação por série e mês, com a edição no metadata; erro de leitura vira inválido", () => {
  const lida = { edicao: "2026-09", url: "u", ...lerEdicao(planilha()) };
  const { validos, invalidos, avisos } = coletor.normalize([lida, { edicao: "2026-08", erro: "Falha ao ler a planilha: x" }]);
  assert.equal(invalidos.length, 1);
  assert.deepEqual(avisos, []);
  const sa = validos.find((v) => v.series_code === "EIA_STEO.PETROLEO.SA.PRODUCAO" && v.observed_at === "2025-01-01");
  assert.equal(sa.value, 9000);
  assert.equal(sa.unit, "mil barris/dia");
  assert.equal(sa.source_code, "EIA_STEO");
  assert.equal(sa.metadata.edicao, "2026-09");
  assert.equal(sa.metadata.dataPrevisao, "2026-09-03");
  assert.equal(sa.published_at.toISOString(), "2026-09-09T23:59:59.000Z");
});

test("download diário: só as edições recentes que ainda não estão no banco", async () => {
  const pedidos = [];
  const fetchFn = async (url) => {
    pedidos.push(url);
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const deps = { observationRepository: { listarSeriesEInstantes: async () => [{ series_code: "x", published_at: coletor.publicacao("2026-09").published_at }] } };
  const r = await coletor.download({ fetchFn, esperar: async () => {}, agora: new Date("2026-10-06T12:00:00Z"), deps });
  assert.deepEqual(r.naoPublicadas, ["2026-10"]);
  assert.ok(pedidos.every((u) => u.includes("oct26")));
});

test("download: uma página de erro em HTML com status 200 (o oct13_base.xls) cai para a outra extensão", async () => {
  const html = Buffer.from("<!DOCTYPE HTML><title>EIA - Sorry!  Unexpected Error</title>".padEnd(3000, " "));
  const xlsx = planilha();
  const corpo = (b) => ({ ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
  const pedidos = [];
  const fetchFn = async (url) => {
    pedidos.push(url);
    return corpo(url.endsWith(".xls") ? html : xlsx);
  };
  const r = await coletor.downloadIntervalo({ edicaoInicial: "2013-10", edicaoFinal: "2013-10", fetchFn, esperar: async () => {} });
  assert.equal(pedidos.length, 2);
  assert.equal(r.edicoes[0].url, "https://www.eia.gov/outlooks/steo/archives/oct13_base.xlsx");
  assert.equal(r.edicoes[0].tabela, "3dtab");
});

test("backfill: de jan/2008 à edição do mês corrente", () => {
  assert.deepEqual(resolverIntervalo({}, new Date("2026-10-06T00:00:00Z")), { edicaoInicial: "2008-01", edicaoFinal: "2026-10" });
  assert.deepEqual(resolverIntervalo({ desde: "2005-01", ate: "2010-12" }), { edicaoInicial: "2008-01", edicaoFinal: "2010-12" });
  assert.throws(() => resolverIntervalo({ desde: "2026-13" }), /inválido/);
});
