"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const parser = require("./wasde-milho.parser");

// Fixtures compactas que reproduzem o layout REAL das planilhas (jan/2011, jan/2015, mai/2025),
// inclusive os desvios que já apareceram: colunas deslocadas, "NA", linha "filler", asterisco de
// nota de rodapé no número e preço em faixa ("4.80 - 5.60").

const EUA_2011 = [
  [null, null, "January 2011"],
  [],
  [null, null, "WASDE - 490 - 12"],
  [],
  [null, null, "U.S. Feed Grain and Corn Supply and Use  1/"],
  [null, null, "FEED GRAINS", "2008/09", "2009/10 Est.", "2010/11 Proj.", "2010/11 Proj."],
  [null, null, "Production", 1, 2, 3, 4],
  [null, null, "CORN", "2008/09", "2009/10 Est.", "2010/11 Proj.", "2010/11 Proj."],
  [null, null, null, null, null, "December", "January"],
  [null, null, "Area Planted", 86.0, 86.4, 88.2, 88.2],
  [null, null, "Yield per Harvested Acre", 153.9, 164.7, 154.3, 152.8],
  [null, null, "Beginning Stocks", 1624, 1673, 1708, 1708],
  [null, null, "Production", 12092, 13092, 12540, 12447],
  [null, null, "Food, Seed & Industrial", 5025, 5939, 6180, 6280],
  [null, null, "Ethanol for Fuel  2/", 3709, 4568, 4800, 4900],
  [null, null, "Ending Stocks", 1673, 1708, 832, 745],
  [null, null, "Avg. Farm Price ($/bu)  3/", 4.06, 3.55, "4.80 - 5.60", "4.90 - 5.70"],
  [null, null, "Note: Totals may not add due to rounding."]
];

const EUA_2025 = [
  ["May 2025"],
  [],
  ["WASDE - 660 - 12"],
  ["U.S. Feed Grain and Corn Supply and Use  1/"],
  ["CORN", "2023/24", "2024/25 Est.", "2025/26 Proj.", "2025/26 Proj."],
  [null, null, null, "April", "May"],
  ["Area Planted", 94.6, 90.6, "NA", "95.3 *"],
  ["Production", 15341, 14867, "NA", 15820],
  ["Ending Stocks", 1763, 1415, "NA", 1800]
];

const MUNDO_2015_P22 = [
  [null, null, "January 2015"],
  [],
  [null, null, null, null, "WASDE - 537 - 22"],
  [null, null, null, null, "World Corn Supply and Use  1/"],
  [null, null, "2012/13", null, null, "Beginning Stocks", "Production", "Imports", "Domestic Feed 2/", "Domestic Total 2/", "Exports", "Ending Stocks"],
  [null, null, "World  3/", null, null, 134.43, 868.0, 99.42, 517.67, 864.49, 95.16, 137.94],
  [null, null, "Brazil", null, null, 9.21, 81.5, 0.89, 44.5, 52.5, 24.95, 14.15],
  // Título de seção com um "0" solto no estoque final (artefato real das edições de 2011 em diante).
  [null, null, "Selected Other", null, null, null, null, null, null, null, null, 0],
  [null, null, "European Union  6/", null, null, 6.0, 65.0, 7.0, 55.0, 70.0, 2.0, 6.0],
  [null, null, "2013/14 Est.", null, null, "Beginning Stocks", "Production", "Imports", "Domestic Feed 2/", "Domestic Total 2/", "Exports", "Ending Stocks"],
  [null, null, "World  3/", null, null, 137.94, 987.69, 122.15, 573.24, 953.4, 130.64, 172.23],
  [null, null, "1/ Aggregate of local marketing years. 2/ Total foreign and world use adjusted"]
];

// Safra em projeção: cada região tem duas linhas (mês anterior "Dec", atual "Jan", esta sem rótulo)
// e há uma linha "filler" de preenchimento entre regiões.
const MUNDO_2015_P23 = [
  [null, null, "January 2015"],
  [null, null, null, null, "World Corn Supply and Use  1/  (Cont'd.)"],
  [null, null, null, "2014/15 Proj.", null, null, null, "Beginning Stocks", "Production", "Imports", "Domestic Feed", "Domestic Total 2/", "Exports", "Ending Stocks"],
  [null, null, null, "World  3/", null, null, "Dec", 172.84, 991.58, 109.8, 597.12, 972.21, 112.34, 192.2],
  [null, null, null, null, null, null, "Jan", 172.23, 988.08, 110.1, 594.23, 971.16, 112.34, 189.15],
  [null, null, null, null, null, "filler", "filler", "filler", "filler", "filler", "filler", "filler", "filler"],
  [null, null, null, "Brazil", null, null, "Dec", 17.75, 75.0, 0.8, 47.5, 56.5, 19.5, 17.55],
  [null, null, null, null, null, null, "Jan", 17.75, 77.0, 0.8, 48.0, 57.0, 20.0, 18.55],
  [null, null, null, "1/ Aggregate of local marketing years."]
];

// 1ª projeção de uma safra (maio): a linha do mês anterior ("Apr") é toda "NA" e é descartada.
const MUNDO_2025_P23 = [
  ["May 2025"],
  ["World Corn Supply and Use  1/  (Cont'd.)"],
  ["2025/26 Proj.", null, "Beginning Stocks", "Production", "Imports", "Domestic Feed", "Domestic Total 2/", "Exports", "Ending Stocks"],
  ["World  3/", "Apr", "NA", "NA", "NA", "NA", "NA", "NA", "NA"],
  [null, "May", 287.29, 1264.98, 187.48, 801.55, 1274.43, 195.81, 277.84]
];

const achar = (obs, codigo, safra) => obs.find((o) => o.seriesCode === codigo && o.safra === safra);

test("EUA (layout de 2011, colunas deslocadas): uma linha por safra, vale a última coluna da projeção", () => {
  const { observacoes, invalidos } = parser.extrairEua(EUA_2011);

  assert.equal(invalidos.length, 0);
  // Só o bloco "CORN": o "Production" de FEED GRAINS (1, 2, 3, 4) não entra.
  const producao = observacoes.filter((o) => o.seriesCode === "WASDE.MILHO.EUA.PRODUCTION");
  assert.deepEqual(
    producao.map((o) => [o.safra, o.situacao, o.valor, o.observedAt]),
    [
      ["2008/09", "final", 12092, "2008-09-01"],
      ["2009/10", "est", 13092, "2009-09-01"],
      ["2010/11", "proj", 12447, "2010-09-01"] // jan, não dez (12540)
    ]
  );
  assert.equal(achar(observacoes, "WASDE.MILHO.EUA.ENDING_STOCKS", "2010/11").valor, 745);
  assert.equal(achar(observacoes, "WASDE.MILHO.EUA.ENDING_STOCKS", "2010/11").unidade, "M bu");
  assert.equal(achar(observacoes, "WASDE.MILHO.EUA.YIELD", "2010/11").unidade, "bu/acre");
  assert.equal(achar(observacoes, "WASDE.MILHO.EUA.AREA_PLANTED", "2010/11").unidade, "M acres");
});

test("EUA: rótulos com pontuação/rodapé casam ('Food, Seed & Industrial'); etanol e preço NÃO são extraídos", () => {
  const { observacoes, invalidos } = parser.extrairEua(EUA_2011);
  const codigos = new Set(observacoes.map((o) => o.atributo));

  assert.ok(codigos.has("FSI"));
  assert.equal(codigos.has("ETHANOL"), false);
  assert.equal([...codigos].some((c) => /PRICE|ETHANOL/.test(c)), false);
  // Preço em faixa não gera inválido: simplesmente não é um atributo coletado.
  assert.equal(invalidos.length, 0);
});

test('EUA (layout de 2025): "NA" é ausência (não inválido) e "95.3 *" é 95.3', () => {
  const { observacoes, invalidos } = parser.extrairEua(EUA_2025);

  assert.equal(invalidos.length, 0);
  assert.equal(achar(observacoes, "WASDE.MILHO.EUA.PRODUCTION", "2025/26").valor, 15820);
  assert.equal(achar(observacoes, "WASDE.MILHO.EUA.AREA_PLANTED", "2025/26").valor, 95.3);
  // A coluna "April" é NA: não vira observação, e a de maio é a única da safra 2025/26.
  assert.equal(observacoes.filter((o) => o.seriesCode === "WASDE.MILHO.EUA.PRODUCTION" && o.safra === "2025/26").length, 1);
});

test("EUA: valor que não é número nem NA vira inválido, sem derrubar o resto", () => {
  const linhas = EUA_2025.map((l) => l.slice());
  linhas[7][2] = "abc";
  const { observacoes, invalidos } = parser.extrairEua(linhas);

  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /Production \(2024\/25\)/);
  assert.ok(achar(observacoes, "WASDE.MILHO.EUA.PRODUCTION", "2023/24"));
});

test("Mundo (página 22): uma linha por região; cabeçalho de outro ano abre outro bloco; título sem dado é ignorado", () => {
  const { observacoes, invalidos } = parser.extrairMundo(MUNDO_2015_P22);

  assert.equal(invalidos.length, 0);
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.WORLD.ENDING_STOCKS", "2012/13").valor, 137.94);
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.WORLD.ENDING_STOCKS", "2013/14").valor, 172.23);
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.BRAZIL.PRODUCTION", "2012/13").valor, 81.5);
  // "European Union  6/" perde a nota de rodapé; "Domestic Feed 2/" (cabeçalho) também.
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.EUROPEAN_UNION.DOMESTIC_FEED", "2012/13").valor, 55);
  assert.ok(!observacoes.some((o) => o.regiao === "SELECTED_OTHER"));
  assert.ok(observacoes.every((o) => o.unidade === "Mt" && o.escopo === "MUNDO"));
});

test('Mundo (página 23): vale a linha do mês atual ("Jan", com rótulo em branco) e "filler" é ignorado', () => {
  const { observacoes, invalidos } = parser.extrairMundo(MUNDO_2015_P23);

  assert.equal(invalidos.length, 0);
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.WORLD.ENDING_STOCKS", "2014/15").valor, 189.15); // dez: 192.2
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.BRAZIL.PRODUCTION", "2014/15").valor, 77);
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.BRAZIL.PRODUCTION", "2014/15").situacao, "proj");
  // O "filler" não vira uma região nem contamina a anterior (World continua com o valor de janeiro).
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.WORLD.PRODUCTION", "2014/15").valor, 988.08);
});

test("Mundo: na 1ª projeção da safra, a linha do mês anterior é toda NA e fica de fora", () => {
  const { observacoes, invalidos } = parser.extrairMundo(MUNDO_2025_P23);

  assert.equal(invalidos.length, 0);
  assert.equal(observacoes.length, 7);
  assert.equal(achar(observacoes, "WASDE.MILHO.MUNDO.WORLD.ENDING_STOCKS", "2025/26").valor, 277.84);
});

test("extrairEdicao junta EUA e mundo, lê edição e mês, e reporta tabela ausente", () => {
  const edicao = parser.extrairEdicao([
    { nome: "Page 12", linhas: EUA_2011 },
    { nome: "Page 22", linhas: MUNDO_2015_P22 },
    { nome: "Page 23", linhas: MUNDO_2015_P23 },
    { nome: "Page 30", linhas: [["Outra tabela qualquer"]] }
  ]);

  assert.equal(edicao.edicao, "490");
  assert.deepEqual(edicao.mes, { nome: "January", ano: 2011 });
  assert.equal(edicao.invalidos.length, 0);
  assert.ok(edicao.observacoes.some((o) => o.escopo === "EUA"));
  assert.ok(edicao.observacoes.some((o) => o.escopo === "MUNDO"));

  const semMundo = parser.extrairEdicao([{ nome: "Page 12", linhas: EUA_2011 }]);
  assert.equal(semMundo.invalidos.length, 1);
  assert.match(semMundo.invalidos[0].motivo, /World Corn Supply and Use/);

  const vazia = parser.extrairEdicao([{ nome: "x", linhas: [["nada"]] }]);
  assert.equal(vazia.observacoes.length, 0);
  assert.equal(vazia.invalidos.length, 2);
});

test("lerPlanilha lê um XLS de verdade (BIFF8) e o resultado alimenta extrairEdicao", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(EUA_2025), "Page 12");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(MUNDO_2025_P23), "Page 23");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "biff8" });

  const abas = parser.lerPlanilha(buffer);
  assert.deepEqual(abas.map((a) => a.nome), ["Page 12", "Page 23"]);

  const edicao = parser.extrairEdicao(abas);
  assert.equal(achar(edicao.observacoes, "WASDE.MILHO.EUA.PRODUCTION", "2025/26").valor, 15820);
  assert.equal(achar(edicao.observacoes, "WASDE.MILHO.MUNDO.WORLD.ENDING_STOCKS", "2025/26").valor, 277.84);
});

test("slugRegiao e numero: casos de borda", () => {
  assert.equal(parser.slugRegiao("        Southeast Asia  7/"), "SOUTHEAST_ASIA");
  assert.equal(parser.slugRegiao("World Less China"), "WORLD_LESS_CHINA");
  assert.equal(parser.slugRegiao("EU-27  6/"), "EU_27");
  assert.equal(parser.numero("1,234.5"), 1234.5);
  assert.equal(parser.numero("NA"), null);
  assert.equal(parser.numero("filler"), null);
  assert.equal(parser.numero(""), null);
  assert.equal(parser.numero("4.80 - 5.60"), Number.NaN);
});

// ---- Contra as planilhas REAIS. Só roda se a pasta local existir (não é versionada: ADR 0015).
const PASTA_REAL = path.resolve(__dirname, "../../../../docs/Docs_Base/ESMIS_WASDE");
const arquivoReal = (nome) => path.join(PASTA_REAL, nome);
const temReal = (nome) => fs.existsSync(arquivoReal(nome));
const lerReal = (nome) => parser.extrairEdicao(parser.lerPlanilha(fs.readFileSync(arquivoReal(nome))));

test("planilha REAL de set/2026: valores dos EUA e do mundo conferem com a PSD", { skip: !temReal("wasde0926.xls") && "planilha real ausente" }, () => {
  const e = lerReal("wasde0926.xls");
  assert.equal(e.invalidos.length, 0);
  assert.equal(e.edicao, "675");
  assert.equal(achar(e.observacoes, "WASDE.MILHO.EUA.PRODUCTION", "2024/25").valor, 14892);
  assert.equal(achar(e.observacoes, "WASDE.MILHO.EUA.ENDING_STOCKS", "2024/25").valor, 1551);
  assert.equal(achar(e.observacoes, "WASDE.MILHO.MUNDO.WORLD.PRODUCTION", "2024/25").valor, 1235.03);
  assert.equal(achar(e.observacoes, "WASDE.MILHO.MUNDO.BRAZIL.PRODUCTION", "2024/25").valor, 136);
});

test("planilha REAL de mai/2025: 'NA' de abril fora e a revisão da safra 2024/25 visível", { skip: !temReal("wasde0525v2.xls") && "planilha real ausente" }, () => {
  const e = lerReal("wasde0525v2.xls");
  assert.equal(e.invalidos.length, 0);
  assert.equal(achar(e.observacoes, "WASDE.MILHO.EUA.ENDING_STOCKS", "2024/25").valor, 1415); // set/2026: 1551
  assert.equal(achar(e.observacoes, "WASDE.MILHO.EUA.PRODUCTION", "2025/26").valor, 15820);
  assert.equal(achar(e.observacoes, "WASDE.MILHO.MUNDO.WORLD.ENDING_STOCKS", "2025/26").valor, 277.84);
});
