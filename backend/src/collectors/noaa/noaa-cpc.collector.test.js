"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { coletorCpc, lerDbf, lerPoligonos, poligonosContendo, pontoNoAnel, ESTADOS, ARQUIVOS, SOURCE_CODE } = require("./noaa-cpc.collector");

// ZIP mínimo sem compressão ("stored"), com conteúdo binário.
function montarZip(arquivos) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const { nome, conteudo } of arquivos) {
    const nomeBuf = Buffer.from(nome, "latin1");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(conteudo.length, 18);
    local.writeUInt32LE(conteudo.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    locais.push(local, nomeBuf, conteudo);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(conteudo.length, 20);
    central.writeUInt32LE(conteudo.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrais.push(central, nomeBuf);
    offset += local.length + nomeBuf.length + conteudo.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

// DBF no layout do CPC (os números em notação científica, como o arquivo real: "4.00000e+01").
function montarDbf(registros) {
  const campos = [
    { nome: "Fcst_Date", tipo: "D", tamanho: 8 },
    { nome: "Start_Date", tipo: "D", tamanho: 8 },
    { nome: "End_Date", tipo: "D", tamanho: 8 },
    { nome: "Prob", tipo: "F", tamanho: 13 },
    { nome: "Cat", tipo: "C", tamanho: 20 }
  ];
  const tamCab = 32 + campos.length * 32 + 1;
  const tamReg = 1 + campos.reduce((s, c) => s + c.tamanho, 0);
  const cab = Buffer.alloc(tamCab, 0);
  cab[0] = 0x03;
  cab.writeUInt32LE(registros.length, 4);
  cab.writeUInt16LE(tamCab, 8);
  cab.writeUInt16LE(tamReg, 10);
  campos.forEach((c, i) => {
    cab.write(c.nome, 32 + i * 32, "ascii");
    cab[32 + i * 32 + 11] = c.tipo.charCodeAt(0);
    cab[32 + i * 32 + 16] = c.tamanho;
  });
  cab[tamCab - 1] = 0x0d;
  const dados = Buffer.alloc(tamReg * registros.length, 0x20);
  registros.forEach((r, i) => {
    let off = i * tamReg + 1;
    for (const [c, v] of campos.map((c) => [c, r[c.nome]])) {
      dados.write(String(v).padEnd(c.tamanho).slice(0, c.tamanho), off, "ascii");
      off += c.tamanho;
    }
  });
  return Buffer.concat([cab, dados]);
}

// SHP com polígonos de anéis retangulares [minX, minY, maxX, maxY] (o 2º anel em diante é furo).
function montarShp(poligonos) {
  const registros = poligonos.map((aneis, i) => {
    const pontos = aneis.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]]);
    const tamanho = 44 + aneis.length * 4 + pontos.length * 16;
    const buf = Buffer.alloc(8 + tamanho);
    buf.writeInt32BE(i + 1, 0);
    buf.writeInt32BE(tamanho / 2, 4);
    buf.writeInt32LE(5, 8);
    const [x0, y0, x1, y1] = aneis[0];
    [x0, y0, x1, y1].forEach((v, k) => buf.writeDoubleLE(v, 12 + k * 8));
    buf.writeInt32LE(aneis.length, 44);
    buf.writeInt32LE(pontos.length, 48);
    aneis.forEach((_, a) => buf.writeInt32LE(a * 5, 52 + a * 4));
    const base = 52 + aneis.length * 4;
    pontos.forEach(([x, y], k) => {
      buf.writeDoubleLE(x, base + k * 16);
      buf.writeDoubleLE(y, base + k * 16 + 8);
    });
    return buf;
  });
  return Buffer.concat([Buffer.alloc(100), ...registros]);
}

const registro = (Cat, Prob) => ({ Fcst_Date: "20261005", Start_Date: "20261013", End_Date: "20261019", Prob: Prob.toExponential(5), Cat });

// Faixa "acima 40%" sobre Iowa, Illinois e Indiana; o fundo (chances iguais) é o país com um furo no lugar da faixa,
// como no arquivo real; uma faixa "abaixo 33%" longe do Corn Belt.
const FAIXA = [-96, 39, -85, 43];
const POLIGONOS = [[[-125, 24, -66, 50], FAIXA], [FAIXA], [[-84, 25, -80, 30]]];
const REGISTROS = [registro("Normal", 36), registro("Above", 40), registro("Below", 33)];

function zipCpc(nome, poligonos = POLIGONOS, registros = REGISTROS) {
  return montarZip([
    { nome: `${nome}_latest.dbf`, conteudo: montarDbf(registros) },
    { nome: `${nome}_latest.shp`, conteudo: montarShp(poligonos) }
  ]);
}

test("pontoNoAnel: dentro e fora de um retângulo", () => {
  const anel = [[-100, 40], [-80, 40], [-80, 50], [-100, 50], [-100, 40]];
  assert.equal(pontoNoAnel(anel, 45, -90), true);
  assert.equal(pontoNoAnel(anel, 45, -110), false);
  assert.equal(pontoNoAnel(anel, 55, -90), false);
});

test("poligonosContendo: o furo do fundo exclui o ponto que está na faixa", () => {
  const poligonos = lerPoligonos(montarShp(POLIGONOS));
  assert.deepEqual(poligonosContendo(poligonos, 42.0, -93.5), [1]); // Iowa: só a faixa
  assert.deepEqual(poligonosContendo(poligonos, 44.0, -94.5), [0]); // Minnesota: só o fundo
});

test("lerDbf: lê os campos do CPC", () => {
  const [r] = lerDbf(montarDbf([registro("Above", 40)]));
  assert.equal(r.Cat, "Above");
  assert.equal(Number(r.Prob), 40);
  assert.equal(r.Fcst_Date, "20261005");
});

test("parse + normalize: uma série por estado e arquivo, com o sinal da categoria e o fundo como chances iguais", () => {
  const raw = { arquivos: ARQUIVOS.map(({ campo, arquivo }) => ({ campo, arquivo, buf: zipCpc(arquivo) })) };
  const { validos, invalidos } = coletorCpc.normalize(coletorCpc.parse(raw));

  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, ESTADOS.length * ARQUIVOS.length);

  const ia = validos.find((v) => v.series_code === "NOAA_CPC.EUA_IA.TEMP_8_14");
  assert.equal(ia.value, 40);
  assert.equal(ia.observed_at, "2026-10-05");
  assert.equal(ia.source_code, SOURCE_CODE);
  assert.ok(ia.unit.length <= 20, "a coluna unit tem 20 caracteres");
  assert.equal(ia.published_at.toISOString(), "2026-10-05T23:59:59.000Z");
  assert.equal(ia.published_at_is_estimated, true);
  assert.deepEqual(
    { categoria: ia.metadata.categoria, chancesIguais: ia.metadata.chancesIguais, inicio: ia.metadata.periodoInicio, fim: ia.metadata.periodoFim },
    { categoria: "Above", chancesIguais: false, inicio: "2026-10-13", fim: "2026-10-19" }
  );

  const mn = validos.find((v) => v.series_code === "NOAA_CPC.EUA_MN.PRCP_6_10");
  assert.equal(mn.value, 0);
  assert.equal(mn.metadata.categoria, "Normal");
  assert.equal(mn.metadata.chancesIguais, true);
});

test("normalize: abaixo do normal vira valor negativo", () => {
  const estado = ESTADOS[0];
  const { validos } = coletorCpc.normalize([{ campo: "PRCP_8_14", estado, registro: registro("Below", 33) }]);
  assert.equal(validos[0].value, -33);
});

test("normalize: ponto fora de todos os polígonos ou categoria desconhecida é inválido, sem derrubar o resto", () => {
  const [ia, il] = ESTADOS;
  const { validos, invalidos } = coletorCpc.normalize([
    { campo: "TEMP_6_10", estado: ia, registro: null },
    { campo: "TEMP_6_10", estado: il, registro: registro("EC", 33) },
    { campo: "TEMP_6_10", estado: il, registro: registro("Above", 50) }
  ]);
  assert.equal(validos.length, 1);
  assert.equal(invalidos.length, 2);
  assert.match(invalidos[0].motivo, /Iowa/);
  assert.match(invalidos[1].motivo, /Cat "EC"/);
});

test("parse: polígonos e registros em número diferente é erro da fonte", () => {
  const raw = { arquivos: [{ campo: "TEMP_6_10", arquivo: "610temp", buf: zipCpc("610temp", POLIGONOS, REGISTROS.slice(0, 2)) }] };
  assert.throws(() => coletorCpc.parse(raw), /3 polígonos e 2 registros/);
});
