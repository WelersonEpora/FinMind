"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { lerRelatorio, lerAsOf, slugOrigem } = require("./ice-cafe-estoques.parser");

// Planilha no layout real (XLS antigo, uma aba). Os portos mudam com o tempo: o parser só usa a coluna "Total".
function xls({ asOf = "As of: Sep 25, 2026  1:18:21PM", portos = ["ANT", "HOU"], linhas, total, comRotulo = true, titulo = 'COFFEE "C" CERTIFIED WAREHOUSE STOCK REPORT' } = {}) {
  const aoa = [
    ["ICE Futures U.S."],
    [titulo],
    [asOf],
    ...(comRotulo ? [["TOTAL BAGS CERTIFIED"]] : []),
    [null, ...portos, "Total"],
    ...linhas,
    ["Total in Bags", ...portos.map(() => 0), total],
    ["Pending Grading Report"],
    [null, ...portos, "Total"],
    ["Brazil", 1, 0, 1],
    ["Total in Bags", 1, 0, 1]
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "biff8" });
}

test("lê a data do relatório, as origens e o total (só o 1º bloco, só a coluna Total)", () => {
  const r = lerRelatorio(xls({ linhas: [["Brazil", 52000, 791, 52791], ["Papua New Guinea", 1528, 0, 1528]], total: 54319 }));
  assert.deepEqual(r.asOf, { data: "2026-09-25", horario: "13:18:21" });
  assert.deepEqual(r.origens, [
    { codigo: "BRAZIL", nome: "Brazil", sacas: 52791 },
    { codigo: "PAPUA_NEW_GUINEA", nome: "Papua New Guinea", sacas: 1528 }
  ]);
  assert.equal(r.total, 54319);
});

test("layout de 2016: sem a linha TOTAL BAGS CERTIFIED e com outros portos", () => {
  const r = lerRelatorio(xls({ asOf: "As of: Jan 4, 2016  1:13:50PM", comRotulo: false, portos: ["ANTWERP", "BARCELONA", "NEW YORK"], linhas: [["Colombia", 1, 2, 3, 6]], total: 6 }));
  assert.equal(r.asOf.data, "2016-01-04");
  assert.equal(r.origens[0].sacas, 6);
});

test("soma das origens diferente do total, título errado ou data ilegível derrubam a leitura do arquivo", () => {
  assert.throws(() => lerRelatorio(xls({ linhas: [["Brazil", 1, 0, 1]], total: 2 })), /não fecha/);
  assert.throws(() => lerRelatorio(xls({ titulo: "COCOA CERTIFIED STOCK", linhas: [], total: 0 })), /não é o relatório/);
  assert.throws(() => lerRelatorio(xls({ asOf: "As of: 25/09/2026", linhas: [], total: 0 })), /data do relatório/);
  assert.throws(() => lerRelatorio(xls({ linhas: [["Brazil", 1, 0, "n/d"]], total: 0 })), /ilegível/);
});

test("lerAsOf converte 12h: meia-noite e meio-dia", () => {
  assert.deepEqual(lerAsOf("As of: Jan 4, 2016 12:05:00AM"), { data: "2016-01-04", horario: "00:05:00" });
  assert.deepEqual(lerAsOf("As of: Jan 4, 2016 12:05:00PM"), { data: "2016-01-04", horario: "12:05:00" });
  assert.equal(lerAsOf("As of: Foo 4, 2016 1:00:00PM"), null);
});

test("slugOrigem tira acento e pontuação", () => {
  assert.equal(slugOrigem("Côte d'Ivoire"), "COTE_D_IVOIRE");
  assert.equal(slugOrigem("El Salvador"), "EL_SALVADOR");
});
