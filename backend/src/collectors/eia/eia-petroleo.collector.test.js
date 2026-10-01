"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const collector = require("./eia-petroleo.collector");

// Planilha no layout real da EIA (aba "Data 1"), com valores reais de 2026-10-01.
function planilha(sourcekey, linhas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Workbook Contents"]]), "Contents");
  const dados = [["Back to Contents", "Data 1: ..."], ["Sourcekey", sourcekey], ["Date", "..."], ...linhas, ["", ""]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), "Data 1");
  return XLSX.write(wb, { type: "buffer", bookType: "xls" });
}

const CALENDARIO =
  "<table><tr><td>September 4, 2026</td><td>September 10, 2026</td><td>Thursday</td><td>12:00 p.m.</td><td>Labor Day</td></tr></table>";

test("as séries confirmadas por chamada real: 11 semanais e 4 diárias, sem código repetido", () => {
  assert.equal(collector.SERIES.filter((s) => !s.diaria).length, 11);
  assert.equal(collector.SERIES.filter((s) => s.diaria).length, 4);
  const codigos = collector.SERIES.map((s) => `${s.prefixo}.${s.campo}`);
  assert.equal(new Set(codigos).size, codigos.length);
  assert.equal(new Set(collector.SERIES.map((s) => s.sourcekey)).size, collector.SERIES.length);
});

test("semanal: semana encerrada na sexta, publicação estimada na quarta seguinte", () => {
  const planilhas = [{ sourcekey: "WCESTUS1", buffer: planilha("WCESTUS1", [["Sep 18, 2026", "425000"], ["Sep 25, 2026", "427320"]]) }];
  const { validos, invalidos } = collector.normalize(collector.parse({ planilhas, calendario: null }));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.unit, v.published_at.toISOString()]),
    [
      ["EIA.PETROLEO_ESTOQUES.PETROLEO_SEM_SPR", "2026-09-18", 425000, "mil barris", "2026-09-23T23:59:59.000Z"],
      ["EIA.PETROLEO_ESTOQUES.PETROLEO_SEM_SPR", "2026-09-25", 427320, "mil barris", "2026-09-30T23:59:59.000Z"]
    ]
  );
  assert.equal(validos[0].published_at_is_estimated, true);
});

test("diário: o preço sai na divulgação da semana que fecha na 1ª terça >= o dia (medido em 2026-09-30)", () => {
  // Divulgação de quarta 2026-09-30: dias de quarta 23/09 a terça 29/09.
  assert.equal(collector.semanaDoPreco("2026-09-23"), "2026-09-25");
  assert.equal(collector.semanaDoPreco("2026-09-25"), "2026-09-25");
  assert.equal(collector.semanaDoPreco("2026-09-29"), "2026-09-25");
  // Terça 22/09 ainda saiu na divulgação anterior (quarta 23/09).
  assert.equal(collector.semanaDoPreco("2026-09-22"), "2026-09-18");

  const planilhas = [{ sourcekey: "RWTC", buffer: planilha("RWTC", [["Sep 22, 2026", "95.10"], ["Sep 23, 2026", "95.80"], ["Sep 29, 2026", "96.16"]]) }];
  const { validos } = collector.normalize(collector.parse({ planilhas, calendario: null }));
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.published_at.toISOString().slice(0, 10)]),
    [
      ["EIA.PETROLEO_PRECOS.WTI", "2026-09-22", 95.1, "2026-09-23"],
      ["EIA.PETROLEO_PRECOS.WTI", "2026-09-23", 95.8, "2026-09-30"],
      ["EIA.PETROLEO_PRECOS.WTI", "2026-09-29", 96.16, "2026-09-30"]
    ]
  );
});

test("diário em semana de feriado: vale a data do calendário oficial (Labor Day 2026: quinta 10/09)", () => {
  const planilhas = [{ sourcekey: "RBRTE", buffer: planilha("RBRTE", [["Sep 08, 2026", "110.00"]]) }];
  const { validos } = collector.normalize(collector.parse({ planilhas, calendario: CALENDARIO }));
  assert.equal(validos[0].published_at.toISOString().slice(0, 10), "2026-09-10");
  assert.equal(validos[0].metadata.regraPublicacao, "calendario_oficial_de_feriados");
});

test("preço negativo é válido (WTI de 2020-04-20); estoque negativo, fim de semana ou semana fora da sexta não", () => {
  const planilhas = [
    { sourcekey: "RWTC", buffer: planilha("RWTC", [["Apr 20, 2020", "-36.98"], ["Apr 18, 2020", "18.00"]]) },
    { sourcekey: "WCSSTUS1", buffer: planilha("WCSSTUS1", [["Sep 25, 2026", "-1"], ["Sep 24, 2026", "283767"], ["Sep 18, 2026", ""]]) }
  ];
  const { validos, invalidos } = collector.normalize(collector.parse({ planilhas, calendario: null }));
  assert.deepEqual(validos.map((v) => [v.series_code, v.value]), [["EIA.PETROLEO_PRECOS.WTI", -36.98]]);
  assert.equal(invalidos.length, 4);
});

test("download: as 15 planilhas com o sufixo da frequência e a página de calendário", async () => {
  const pedidas = [];
  const raw = await collector.download({
    fetchFn: async (url) => {
      pedidas.push(url);
      if (url.includes("schedule")) return { ok: true, text: async () => CALENDARIO };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }
  });
  assert.equal(raw.planilhas.length, 15);
  assert.ok(pedidas.includes("https://www.eia.gov/dnav/pet/hist_xls/WCESTUS1w.xls"));
  assert.ok(pedidas.includes("https://www.eia.gov/dnav/pet/hist_xls/RWTCd.xls"));
  assert.equal(pedidas.at(-1), "https://www.eia.gov/petroleum/supply/weekly/schedule.php");
});
