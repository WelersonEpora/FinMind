"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const collector = require("./eia-etanol.collector");

// Planilha no layout real da EIA (aba "Data 1"), com valores reais de 2026-09-23.
function planilha(sourcekey, linhas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Workbook Contents"]]), "Contents");
  const dados = [["Back to Contents", "Data 1: ..."], ["Sourcekey", sourcekey], ["Date", "..."], ...linhas, ["", ""]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), "Data 1");
  return XLSX.write(wb, { type: "buffer", bookType: "xls" });
}

const PLANILHAS = [
  { sourcekey: "W_EPOOXE_YOP_NUS_MBBLD", buffer: planilha("W_EPOOXE_YOP_NUS_MBBLD", [["Sep 11, 2026", "1099"], ["Sep 18, 2026", "1028"]]) },
  { sourcekey: "W_EPOOXE_SAE_NUS_MBBL", buffer: planilha("W_EPOOXE_SAE_NUS_MBBL", [["Sep 11, 2026", "25220"], ["Sep 18, 2026", "24683"]]) }
];

// Trecho da tabela real da página de calendário do WPSR (2026-09-23).
const CALENDARIO =
  "<table><tr><td>December 19, 2025</td><td>December 29, 2025</td><td>Monday</td><td>5:00 p.m.</td><td>Christmas</td></tr>" +
  "<tr><td>September 4, 2026</td><td>September 10, 2026</td><td>Thursday</td><td>12:00 p.m.</td><td>Labor Day</td></tr></table>";

test("parse + normalize: uma observação por semana (sexta) e série, publicação estimada na quarta seguinte", () => {
  const { validos, invalidos } = collector.normalize(collector.parse({ planilhas: PLANILHAS, calendario: null }));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.unit, v.published_at.toISOString()]),
    [
      ["EIA.ETANOL.PRODUCAO", "2026-09-11", 1099, "mil barris/dia", "2026-09-16T23:59:59.000Z"],
      ["EIA.ETANOL.PRODUCAO", "2026-09-18", 1028, "mil barris/dia", "2026-09-23T23:59:59.000Z"],
      ["EIA.ETANOL.ESTOQUES", "2026-09-11", 25220, "mil barris", "2026-09-16T23:59:59.000Z"],
      ["EIA.ETANOL.ESTOQUES", "2026-09-18", 24683, "mil barris", "2026-09-23T23:59:59.000Z"]
    ]
  );
  const [primeiro] = validos;
  assert.equal(primeiro.source_code, "EIA");
  assert.equal(primeiro.published_at_is_estimated, true);
  assert.equal(primeiro.metadata.sourcekey, "W_EPOOXE_YOP_NUS_MBBLD");
  assert.equal(primeiro.metadata.regraPublicacao, "quarta_ou_quinta_com_feriado");
});

test("divulgacaoPelaRegra: quarta; quinta com feriado federal de segunda a quarta (bate com o calendário oficial)", () => {
  assert.equal(collector.divulgacaoPelaRegra("2026-09-18"), "2026-09-23"); // semana normal
  assert.equal(collector.divulgacaoPelaRegra("2026-09-04"), "2026-09-10"); // Labor Day (segunda)
  assert.equal(collector.divulgacaoPelaRegra("2026-11-06"), "2026-11-12"); // Veterans Day (quarta)
  assert.equal(collector.divulgacaoPelaRegra("2024-12-27"), "2025-01-02"); // Ano-Novo (quarta)
  assert.equal(collector.divulgacaoPelaRegra("2026-06-19"), "2026-06-24"); // Juneteenth na sexta da semana: não atrasa
  assert.equal(collector.divulgacaoPelaRegra("2025-11-21"), "2025-11-26"); // Thanksgiving (quinta): não atrasa
});

test("calendário oficial: a data alternativa vence a regra (Natal de 2025: 10 dias depois)", () => {
  const excecoes = collector.extrairExcecoes(CALENDARIO);
  assert.deepEqual([...excecoes], [["2025-12-19", "2025-12-29"], ["2026-09-04", "2026-09-10"]]);

  const planilhas = [{ sourcekey: "W_EPOOXE_YOP_NUS_MBBLD", buffer: planilha("W_EPOOXE_YOP_NUS_MBBLD", [["Dec 19, 2025", "1100"]]) }];
  const [v] = collector.normalize(collector.parse({ planilhas, calendario: CALENDARIO })).validos;
  assert.equal(v.published_at.toISOString(), "2025-12-29T23:59:59.000Z");
  assert.equal(v.metadata.regraPublicacao, "calendario_oficial_de_feriados");
  assert.equal(collector.divulgacaoPelaRegra("2025-12-19"), "2025-12-24", "sem a página, a regra antecipa: é o limite documentado");
});

test("normalize: data fora do formato, semana que não é sexta ou valor vazio viram inválidos", () => {
  const planilhas = [
    {
      sourcekey: "W_EPOOXE_YOP_NUS_MBBLD",
      buffer: planilha("W_EPOOXE_YOP_NUS_MBBLD", [["2026-09-18", "1"], ["Sep 17, 2026", "1"], ["Sep 18, 2026", ""], ["Sep 25, 2026", "1,028"]])
    }
  ];
  const { validos, invalidos } = collector.normalize(collector.parse({ planilhas, calendario: null }));
  assert.deepEqual(validos.map((v) => v.value), [1028]);
  assert.deepEqual(invalidos.map((i) => i.motivo.split(":")[0].split(" ")[0]), ["Data", "Semana", "Valor"]);
});

test("parse: planilha de outra série ou sem a aba de dados é falha da fonte", () => {
  assert.throws(() => collector.parse({ planilhas: [{ sourcekey: "W_EPOOXE_YOP_NUS_MBBLD", buffer: planilha("OUTRA", []) }] }), /traz a série "OUTRA"/);
  const soContents = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(soContents, XLSX.utils.aoa_to_sheet([["Workbook Contents"]]), "Contents");
  const semAba = XLSX.write(soContents, { type: "buffer", bookType: "xls" });
  assert.throws(() => collector.parse({ planilhas: [{ sourcekey: "W_EPOOXE_YOP_NUS_MBBLD", buffer: semAba }] }), /sem a aba "Data 1"/);
  assert.throws(() => collector.parse({}), /formato inesperado/);
});

test("download: as duas planilhas e a página de calendário; página fora do ar não derruba a coleta", async () => {
  const pedidas = [];
  const raw = await collector.download({
    fetchFn: async (url) => {
      pedidas.push(url);
      if (url.includes("schedule")) return { ok: false, status: 503 };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }
  });
  assert.deepEqual(pedidas, [
    "https://www.eia.gov/dnav/pet/hist_xls/W_EPOOXE_YOP_NUS_MBBLDw.xls",
    "https://www.eia.gov/dnav/pet/hist_xls/W_EPOOXE_SAE_NUS_MBBLw.xls",
    "https://www.eia.gov/petroleum/supply/weekly/schedule.php"
  ]);
  assert.equal(raw.planilhas.length, 2);
  assert.equal(raw.calendario, null);
});
