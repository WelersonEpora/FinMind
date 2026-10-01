"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extrairEstoquesMilho, ehOutroRelatorio, mesDaData } = require("./usda-grain-stocks.parser");

// Trechos reais da tabela 1 de três edições (grst_all_tables.csv do ESMIS), nos três layouts. Nenhum teste chama o ESMIS.
const CSV_2026 = `1,"t","Grain Stocks: Released September 30, 2026, by the National Agricultural Statistics Service (NASS), Agricultural Statistics Board, United States Department of Agriculture (USDA)."
1,"t","Grain Stocks by Position and Month in Domestic Units  United States: 2025 and 2026"
1,"t","[Blank data cells indicate estimation period has not yet begun]"
1,"h","","","","","","",""
1,"h","","2025","2025","2025","2026","2026","2026"
1,"h","","","","","","",""
1,"h","Date","On","Off","Total all","On","Off","Total all"
1,"h","","farms","farms 1/","positions","farms","farms 1/","positions"
1,"u","","(1,000 bushels)","(1,000 bushels)","(1,000 bushels)","(1,000 bushels)","(1,000 bushels)","(1,000 bushels)"
1,"d","Corn",,,,,,
1,"d","March 1",4500000,3647437,8147437,5432000,3598190,9030190
1,"d","June 1",2556000,2086894,4642894,2959100,2332184,5291284
1,"d","September 1",643200,908086,1551286,787300,1307757,2095057
1,"d","December 1",8699000,4606825,13305825
1,"d","",,,,,,
1,"d","Sorghum",,,,,,
1,"d","March 1",14900,135325,150225,23500,148197,171697
2,"t","Grain Stocks: Released September 30, 2026, by the National Agricultural Statistics Service (NASS), Agricultural Statistics Board, United States Department of Agriculture (USDA)."
2,"t","Grain Stocks by Position and Month in Metric Units  United States: 2025 and 2026"
2,"h","","2025","2025","2025","2026","2026","2026"
2,"h","Date","On","Off","Total all","On","Off","Total all"
2,"u","","(metric tons)","(metric tons)","(metric tons)","(metric tons)","(metric tons)","(metric tons)"
2,"d","Corn",,,,,,
2,"d","March 1",1,1,1,1,1,1
`;

// Até 2012 o grão é uma linha de cabeçalho e a data é "Mar 1"; em 2010 os revisados vinham com "*".
const CSV_2010 = `1,"t","Grain Stocks: Released March 31, 2010, by the National Agricultural Statistics Service (NASS), Agricultural Statistics Board, U.S. Department of Agriculture."
1,"t","Grain Stocks:  By Position, Month, United States, 2009-2010"
1,"t","(Domestic Units)"
1,"h","","2009","2009","2009","2010","2010","2010"
1,"h","Date","On","Off","Total All","On","Off","Total All"
1,"h","","Farms","Farms 1/","Positions","Farms","Farms 1/","Positions"
1,"u","","1,000 Bushels","1,000 Bushels","1,000 Bushels","1,000 Bushels","1,000 Bushels","1,000 Bushels"
1,"h","","Corn","Corn","Corn","Corn","Corn","Corn"
1,"d","  Mar 1 ",3820000,3039215,6859215,4407000,3286434,7693434
1,"d","  December 1 ",7425000,"*3497460","*10922460"
1,"h","","Sorghum","Sorghum","Sorghum","Sorghum","Sorghum","Sorghum"
1,"d","  Mar 1 ",21000,137652,158652,33400,170122,203522
`;

// 2013-01-11: sem aspas (exportado do Excel), datas "1-Mar".
const CSV_2013 = `1,t,"Grain Stocks: Released January 11, 2013, by the National Agricultural Statistics Service (NASS), Agricultural Statistics Board, United States Department of Agriculture (USDA)."
1,t,Grain Stocks by Position and Month in Domestic Units  United States: 2011 and 2012,,,,,,
1,h,,2011,2011,2011,2012,2012,2012
1,h,Date,On,Off,Total all,On,Off,Total all
1,h,,farms,farms 1/,positions,farms,farms 1/,positions
1,u,,"(1,000 bushels)","(1,000 bushels)","(1,000 bushels)","(1,000 bushels)","(1,000 bushels)","(1,000 bushels)"
1,d,Corn,,,,,,
1,d,1-Mar,3384000,3139228,6523228,3192000,2831356,6023356
1,d,1-Dec,6175000,3471823,9646823,4586000,3444474,8030474
1,d,Sorghum,,,,,,
1,d,1-Mar,1,1,2,1,1,2
`;

const achar = (valores, data, posicao) => valores.find((v) => v.observedAt === data && v.posicao === posicao)?.valor;

test("layout atual: o milho por posição e trimestre, dos dois anos; o trimestre vazio não vira valor; outros grãos e a tabela métrica ficam de fora", () => {
  const r = extrairEstoquesMilho(CSV_2026);
  assert.equal(r.dataLiberacao, "2026-09-30");
  assert.equal(achar(r.valores, "2026-09-01", "TOTAL"), 2095057);
  assert.equal(achar(r.valores, "2025-09-01", "TOTAL"), 1551286);
  assert.equal(achar(r.valores, "2025-12-01", "ON_FARM"), 8699000);
  assert.equal(achar(r.valores, "2026-12-01", "TOTAL"), undefined);
  // 4 trimestres de 2025 + 3 de 2026, 3 posições cada; nada do sorgo nem da tabela em toneladas.
  assert.equal(r.valores.length, 21);
  assert.ok(r.valores.every((v) => v.valor > 1000));
});

test('layout até 2012 (grão no cabeçalho, "Mar 1") e o "*" de revisado', () => {
  const r = extrairEstoquesMilho(CSV_2010);
  assert.equal(r.dataLiberacao, "2010-03-31");
  assert.equal(achar(r.valores, "2010-03-01", "TOTAL"), 7693434);
  const dez = r.valores.find((v) => v.observedAt === "2009-12-01" && v.posicao === "TOTAL");
  assert.deepEqual(dez, { observedAt: "2009-12-01", posicao: "TOTAL", valor: 10922460, revisado: true });
  assert.equal(r.valores.filter((v) => v.observedAt.endsWith("-03-01")).length, 6, "só o milho");
});

test('layout de 2013-01-11 (sem aspas, "1-Mar")', () => {
  const r = extrairEstoquesMilho(CSV_2013);
  assert.equal(r.dataLiberacao, "2013-01-11");
  assert.equal(achar(r.valores, "2012-12-01", "OFF_FARM"), 3444474);
  assert.equal(r.valores.length, 12);
});

test("datas aceitas: March 1, Mar 1, Sept 1, 1-Mar; outras não", () => {
  assert.equal(mesDaData("March 1"), 3);
  assert.equal(mesDaData("Sept 1"), 9);
  assert.equal(mesDaData("1-Dec"), 12);
  assert.equal(mesDaData("Corn"), null);
  assert.equal(mesDaData("March 15"), null);
});

test("recusa a edição em vez de gravar errado: sem milho, ou unidade diferente de mil bushels", () => {
  assert.throws(() => extrairEstoquesMilho(CSV_2026.replace(/"Corn"/g, '"Rice"')), /sem o bloco do milho/);
  assert.throws(() => extrairEstoquesMilho(CSV_2026.replace(/\(1,000 bushels\)/g, "(bushels)")), /unidade inesperada/);
});

test("o arquivo de outro relatório listado como Grain Stocks é reconhecido (2003-02-27)", () => {
  const outro =
    '1,"t","Corn, Soybeans, and Wheat Sold Through Marketing Contracts: Released February 27, 2003, by the National Agricultural Statistics Service (NASS)"\n';
  assert.equal(ehOutroRelatorio(outro), true);
  assert.equal(ehOutroRelatorio(CSV_2026), false);
});

test('defeito real de 2010-03-31: a linha "Sorghum" veio com valores; mesmo assim ela abre o bloco do sorgo', () => {
  const csv = CSV_2010.replace(
    '1,"h","","Sorghum","Sorghum","Sorghum","Sorghum","Sorghum","Sorghum"',
    '1,"d","Sorghum ",32200,173650,205850,23680,151581,175261'
  );
  const r = extrairEstoquesMilho(csv);
  assert.equal(achar(r.valores, "2010-03-01", "TOTAL"), 7693434);
  assert.ok(!r.valores.some((v) => v.valor === 175261 || v.valor === 158652), "nada do sorgo");
});

test("trava: uma data repetida no bloco do milho recusa a edição", () => {
  const csv = CSV_2026.replace('1,"d","June 1"', '1,"d","March 1"');
  assert.throws(() => extrairEstoquesMilho(csv), /duas vezes no bloco do milho/);
});
