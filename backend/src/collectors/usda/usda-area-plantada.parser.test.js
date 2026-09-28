"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerLinhaCsv, extrairAreaPlantada } = require("./usda-area-plantada.parser");

// Trechos no layout REAL dos CSV do ESMIS (cortados: poucos estados), um de cada época.

// Prospective Plantings de 2002: título "Corn:  Area Planted by State...", total "US", unidade sem parênteses.
const PP_2002 = [
  '8,"t","Prospective Plantings: Released March 28, 2002, by the National Agricultural Statistics Service (NASS), Agricultural Statistics Board, U.S. Department of Agriculture."',
  '8,"t","Corn:  Area Planted by State and United States, 2000-2002"',
  '8,"h","","","","",""',
  '8,"h","","Area Planted","Area Planted","Area Planted","Area Planted"',
  '8,"h","State","","","",""',
  '8,"h","","2000","2001","2002 1/","2002/2001"',
  '8,"u","","1,000 Acres","1,000 Acres","1,000 Acres","Percent"',
  '8,"d","AL",230,180,195,108',
  '8,"d","",,,,',
  '8,"d","US",79551,75752,79047,104',
  '9,"t","Sorghum:  Area Planted by State and United States, 2000-2002"',
  '9,"d","US",9195,10251,9500,93'
].join("\r\n");

// Prospective Plantings de 2014: título novo, total "United States", unidade entre parênteses.
const PP_2014 = [
  '90,"t","Prospective Plantings: Released March 31, 2014, by the National Agricultural Statistics Service (NASS), Agricultural Statistics Board, United States Department of Agriculture (USDA)."',
  '90,"t","Principal Crops Area Planted - States and United States: 2012-2014"',
  '90,"d","United States",326300,318700,318000,100',
  '91,"t","Prospective Plantings: Released March 31, 2014, by the National Agricultural Statistics Service (NASS), Agricultural Statistics Board, United States Department of Agriculture (USDA)."',
  '91,"t","Corn Area Planted - States and United States: 2012-2014"',
  '91,"h","","","","",""',
  '91,"h","","Area planted","Area planted","Area planted","Area planted"',
  '91,"h","State","","","",""',
  '91,"h","","2012","2013","2014 1/","Percent of"',
  '91,"h","","","","","previous year"',
  '91,"u","","(1,000 acres)","(1,000 acres)","(1,000 acres)","(percent)"',
  '91,"d","Alabama",310,320,290,91',
  '91,"d","United States",97155,95365,91691,96'
].join("\n");

// Acreage de 2005: título em DUAS linhas e colunas de área colhida, que ficam de fora.
const ACREAGE_2005 = [
  '11,"t","Acreage: Released June 30, 2005, by the National Agricultural Statistics Service (NASS), Agricultural Statistics Board, U.S. Department of Agriculture."',
  '11,"t","Corn:  Area Planted for All Purposes and Harvested for Grain"',
  '11,"t","by State and United States, 2004-2005"',
  '11,"h","","Area Planted","Area Planted","Area Harvested for Grain","Area Harvested for Grain"',
  '11,"h","State","","","",""',
  '11,"h","","2004","2005","2004","2005 1/"',
  '11,"u","","1,000 Acres","1,000 Acres","1,000 Acres","1,000 Acres"',
  '11,"d","US",80930,81592,73632,74200',
  '58,"t","Corn: Biotechnology Varieties by State and"',
  '58,"t","United States, Percent of All Corn Planted, 2004-2005"',
  '58,"h","","Insect Resistant (Bt)","Insect Resistant (Bt)","Herbicide Resistant","Herbicide Resistant"',
  '58,"h","","2004","2005","2004","2005"',
  '58,"d","US",27,35,14,17'
].join("\n");

test("lerLinhaCsv: texto entre aspas (com vírgula e aspas escapadas), números e células vazias", () => {
  assert.deepEqual(lerLinhaCsv('8,"t","Corn, ""all"" purposes",79551,,'), ["8", "t", 'Corn, "all" purposes', "79551", "", ""]);
});

test("Prospective Plantings de 2002: total 'US', os três anos da tabela, data do release", () => {
  const r = extrairAreaPlantada(PP_2002);
  assert.equal(r.dataLiberacao, "2002-03-28");
  assert.equal(r.titulo, "Corn: Area Planted by State and United States, 2000-2002");
  assert.deepEqual(r.valores, [
    { ano: 2000, valor: 79551 },
    { ano: 2001, valor: 75752 },
    { ano: 2002, valor: 79047 }
  ]);
});

test("Prospective Plantings de 2014: tabela achada pelo título (não pelo número), a de outras culturas fica de fora", () => {
  const r = extrairAreaPlantada(PP_2014);
  assert.equal(r.dataLiberacao, "2014-03-31");
  assert.deepEqual(r.valores, [
    { ano: 2012, valor: 97155 },
    { ano: 2013, valor: 95365 },
    { ano: 2014, valor: 91691 }
  ]);
});

test("Acreage de 2005: título em duas linhas; só a área PLANTADA (a colhida e a de biotecnologia ficam de fora)", () => {
  const r = extrairAreaPlantada(ACREAGE_2005);
  assert.equal(r.dataLiberacao, "2005-06-30");
  assert.deepEqual(r.valores, [
    { ano: 2004, valor: 80930 },
    { ano: 2005, valor: 81592 }
  ]);
});

test("recusa a edição (erro, nunca um valor errado) quando falta a tabela, o total, a unidade ou o número", () => {
  assert.throws(() => extrairAreaPlantada('9,"t","Sorghum:  Area Planted by State and United States, 2000-2002"'), /achei 0/);
  assert.throws(() => extrairAreaPlantada(PP_2002 + "\n" + PP_2002.replace(/^8,/gm, "80,")), /achei 2/);
  assert.throws(() => extrairAreaPlantada(PP_2002.replace('"US",79551', '"XX",79551')), /linha do total dos EUA, achei 0/);
  assert.throws(() => extrairAreaPlantada(PP_2014.replace(/\(1,000 acres\)/g, "(1,000 hectares)")), /unidade inesperada/);
  assert.throws(() => extrairAreaPlantada(PP_2014.replace("97155,95365,91691", '97155,"(D)",91691')), /2013 não é um número/);
});
