"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const collector = require("./conab-custo-cafe.collector");

// Abas nos layouts reais (2025, 2010 e 2003; RO 2014 sem o custo total), com valores reais de Patrocínio-MG-2025.
function planilha(abas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["CUSTOS DE PRODUÇÃO - SÉRIE HISTÓRICA"]]), "Índice");
  for (const [nome, linhas] of abas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  return XLSX.write(wb, { type: "buffer", bookType: "xls" });
}

const ABA_2025 = [
  ["Custo de Produção - Resumo"],
  ["SAFRA ANUAL - 2025 - Patrocínio - MG"],
  ["Mês/Ano: Outubro/2025", "Etapa de Cultivo: PRODUÇÃO"],
  ["DISCRIMINAÇÃO", "CUSTO POR HA", "CUSTO /  60 kg", "PARTICIPAÇÃO CV(%)", "PARTICIPAÇÃO CT(%)"],
  ["9 - Fertilizantes", 4624.96, 165.18, 21.45, 13.7],
  ["CUSTO VARIÁVEL (A+B+C=D)", 21563.75, 770.13, 100, 63.87],
  ["CUSTO FIXO (E+F=G)", 6600.46, 235.73, 30.61, 19.57],
  ["CUSTO OPERACIONAL (D+G=H)", 28164.21, 1005.86, 130.61, 83.44],
  ["CUSTO TOTAL (H+I=J)", 33752.94, 1205.46, 156.53, 100]
];
const ABA_2010 = [
  ["SAFRA: 2010/11"],
  ["A PREÇOS DE:", "Jun/2010", "PARTICI-"],
  ["CUSTO VARIÁVEL  (A+B+C = D)", 8012.86, 145.69, 0.85],
  ["Custo Fixo  (E+F = G)", 1294.35, 23.53, 0.14],
  ["CUSTO OPERACIONAL  (D+G = H) ", 9307.21, 169.22, 0.99],
  ["CUSTO TOTAL  (H+I = J) ", 9411.31, 171.11, 1]
];
const ABA_RO_2014 = [
  ["CUSTO DE PRODUÇÃO ESTIMADO-AGRICULTURA FAMILIAR"],
  ["A PREÇOS DE:", "24.07.2014"],
  ["CUSTO VARIÁVEL  (A+B+C = D)", 3340.34, 166.98, 0.88],
  ["Custo Fixo  (E+F = G)", 471.62, 23.58, 0.12],
  ["CUSTO OPERACIONAL  (D+G = H) ", 3811.96, 190.56, 1]
];

test("lerNomeDaAba: município-UF-ano, variante de sistema e o formato de Franca desde 2019", () => {
  assert.deepEqual(collector.lerNomeDaAba("Patrocínio-MG-2025"), { local: "Patrocínio-MG", ano: 2025 });
  assert.deepEqual(collector.lerNomeDaAba("Guaxupé-MG-2014-S.Mec"), { local: "Guaxupé-MG-S.Mec", ano: 2014 });
  assert.deepEqual(collector.lerNomeDaAba("SP-Franca 2019"), { local: "Franca-SP", ano: 2019 });
  assert.equal(collector.lerNomeDaAba("Índice"), null);
  assert.equal(collector.codigoDoLocal("S.S. Paraíso-MG-S.Mec"), "S_S_PARAISO_MG_S_MEC");
  assert.equal(collector.codigoDoLocal("Machadinho D´Oeste-RO"), "MACHADINHO_D_OESTE_RO");
});

test("mesDeReferencia: Mês/Ano por extenso, mês abreviado, data com pontos e data serial do Excel", () => {
  assert.equal(collector.mesDeReferencia(ABA_2025), "2025-10");
  assert.equal(collector.mesDeReferencia(ABA_2010), "2010-06");
  assert.equal(collector.mesDeReferencia([["A PREÇOS DE:", "24.07.03"]]), "2003-07");
  assert.equal(collector.mesDeReferencia([["A PREÇOS DE:", 38563, "PARTICI-"]]), "2005-07");
  assert.equal(collector.mesDeReferencia([["sem data"]]), null);
});

test("normalize: os 4 totais em R$/ha e R$/saca, por tipo, local e ano; sem published_at (vale a coleta)", () => {
  const planilhas = [
    { tipo: "ARABICA", arquivo: "arabica.xls", buffer: planilha([["Patrocínio-MG-2025", ABA_2025], ["L.Eduardo-BA-2010", ABA_2010]]) }
  ];
  const { validos, invalidos, avisos } = collector.normalize(collector.parse(planilhas));
  assert.equal(invalidos.length, 0);
  assert.equal(avisos.length, 0);
  assert.equal(validos.length, 16);
  const porCodigo = Object.fromEntries(validos.map((v) => [v.series_code, v]));
  const total = porCodigo["CONAB.CAFE_CUSTO.ARABICA.PATROCINIO_MG.TOTAL_SACA"];
  assert.deepEqual([total.observed_at, total.value, total.unit], ["2025-01-01", 1205.46, "R$/sc 60 kg"]);
  assert.equal(total.published_at, undefined);
  assert.equal(total.metadata.mesReferenciaPrecos, "2025-10");
  assert.equal(porCodigo["CONAB.CAFE_CUSTO.ARABICA.L_EDUARDO_BA.VARIAVEL_HA"].value, 8012.86);
});

test("aba sem o custo total (RO, 2014) grava os demais totais e vira aviso; aba sem nenhum total ou repetida é inválida", () => {
  const planilhas = [
    {
      tipo: "CONILON",
      arquivo: "conilon.xls",
      buffer: planilha([
        ["Ji-Paraná-RO-2014", ABA_RO_2014],
        ["Cacoal-RO-2015", [["nada aqui"]]],
        ["Folha solta", ABA_2010]
      ])
    }
  ];
  const { validos, invalidos, avisos } = collector.normalize(collector.parse(planilhas));
  assert.equal(validos.length, 6);
  assert.ok(validos.every((v) => v.series_code.startsWith("CONAB.CAFE_CUSTO.CONILON.JI_PARANA_RO.")));
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].motivo, /TOTAL na fonte/);
  assert.equal(invalidos.length, 2);
});

test("download: acha os links na página (o nome do arquivo muda todo ano); link sumido derruba a coleta", async () => {
  const pagina =
    '<a href="https://www.gov.br/conab/x/agricolas/seriehistoricacustoscafearabica2003a2026.xls">Café arábica</a>' +
    '<a href="https://www.gov.br/conab/x/agricolas/serie-historica-custos-cafe-conilon-2007-a-2026.xlsx">Café conilon</a>';
  const pedidas = [];
  const fetchFn = async (url) => {
    pedidas.push(url);
    if (url.includes("copy_of_agricolas")) return { ok: true, text: async () => pagina };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  };
  const planilhas = await collector.download({ fetchFn });
  assert.deepEqual(planilhas.map((p) => [p.tipo, p.arquivo]), [
    ["ARABICA", "seriehistoricacustoscafearabica2003a2026.xls"],
    ["CONILON", "serie-historica-custos-cafe-conilon-2007-a-2026.xlsx"]
  ]);
  assert.equal(pedidas.length, 3);

  const semConilon = async (url) => (url.includes("copy_of_agricolas") ? { ok: true, text: async () => pagina.split("<a")[1] } : fetchFn(url));
  await assert.rejects(collector.download({ fetchFn: semConilon }), /conilon/);
});
