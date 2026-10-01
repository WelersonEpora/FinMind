"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const collector = require("./jodi-producao-petroleo.collector");

// ZIP mínimo com uma entrada "deflate" (o formato do arquivo real do JODI).
function zip(nome, texto) {
  const conteudo = Buffer.from(texto, "utf8");
  const dados = zlib.deflateRawSync(conteudo);
  const nomeBuf = Buffer.from(nome, "latin1");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(dados.length, 18);
  local.writeUInt32LE(conteudo.length, 22);
  local.writeUInt16LE(nomeBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(dados.length, 20);
  central.writeUInt32LE(conteudo.length, 24);
  central.writeUInt16LE(nomeBuf.length, 28);
  const inicioCentral = 30 + nomeBuf.length + dados.length;
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(1, 8);
  fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(46 + nomeBuf.length, 12);
  fim.writeUInt32LE(inicioCentral, 16);
  return Buffer.concat([local, nomeBuf, dados, central, nomeBuf, fim]);
}

// Linhas reais do arquivo de 2026-09-22 (mais as de outros produtos, fluxos e unidades, que o filtro ignora).
const CSV = [
  "REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE",
  "SA,2026-07,CRUDEOIL,INDPROD,KBD,8135.0968,3",
  "SA,2026-07,CRUDEOIL,INDPROD,KBBL,252188.0000,3",
  "SA,2026-07,CRUDEOIL,CLOSTLV,KBD,100.0000,3",
  "SA,2026-07,NGL,INDPROD,KBD,1.0000,3",
  "BR,2022-12,CRUDEOIL,INDPROD,KBD,3077.2903,1",
  "BR,2025-12,CRUDEOIL,INDPROD,KBD,-,3",
  "GY,2010-01,CRUDEOIL,INDPROD,KBD,0.0000,3",
  "US,2026-07,CRUDEOIL,INDPROD,KBD,13817.3871,1"
].join("\r\n");

const LAST_MODIFIED = "Tue, 22 Sep 2026 07:15:25 GMT";

test("parse + normalize: só a produção de petróleo em mil barris/dia; '-' é ausente (aviso), zero é valor", () => {
  const itens = collector.parse({ buffer: zip("NewProcedure_Primary_CSV.csv", CSV), ultimaModificacao: LAST_MODIFIED });
  assert.equal(itens.length, 5);
  const { validos, invalidos, avisos } = collector.normalize(itens);
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.unit]),
    [
      ["JODI.PETROLEO_PRODUCAO.SA.PRODUCAO", "2026-07-01", 8135.0968, "mil barris/dia"],
      ["JODI.PETROLEO_PRODUCAO.BR.PRODUCAO", "2022-12-01", 3077.2903, "mil barris/dia"],
      ["JODI.PETROLEO_PRODUCAO.GY.PRODUCAO", "2010-01-01", 0, "mil barris/dia"],
      ["JODI.PETROLEO_PRODUCAO.US.PRODUCAO", "2026-07-01", 13817.3871, "mil barris/dia"]
    ]
  );
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].motivo, /^1 meses/);
});

test("published_at: o Last-Modified do ZIP, real; o código de avaliação vai nos metadados", () => {
  const { validos } = collector.normalize(collector.parse({ buffer: zip("x.csv", CSV), ultimaModificacao: LAST_MODIFIED }));
  assert.equal(validos[0].published_at.toISOString(), "2026-09-22T07:15:25.000Z");
  assert.equal(validos[0].published_at_is_estimated, false);
  assert.equal(validos[0].metadata.codigoAvaliacao, "3");
  assert.equal(validos[1].metadata.codigoAvaliacao, "1");
});

test("país, mês ou valor fora do formato viram inválidos", () => {
  const csv = [
    "REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE",
    "XYZ,2026-07,CRUDEOIL,INDPROD,KBD,1,3",
    "SA,2026-13,CRUDEOIL,INDPROD,KBD,1,3",
    "SA,2026-07,CRUDEOIL,INDPROD,KBD,abc,3",
    "SA,2026-06,CRUDEOIL,INDPROD,KBD,-5,3"
  ].join("\n");
  const { validos, invalidos } = collector.normalize(collector.parse({ buffer: zip("x.csv", csv), ultimaModificacao: LAST_MODIFIED }));
  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 4);
});

test("ZIP ilegível, sem CSV, colunas novas ou Last-Modified inválido derrubam a coleta", () => {
  assert.throws(() => collector.parse({ buffer: Buffer.from("não é zip") }), /ilegível/);
  assert.throws(() => collector.parse({ buffer: zip("leiame.txt", "x") }), /sem o CSV/);
  assert.throws(() => collector.parse({ buffer: zip("x.csv", "A,B\n1,2") }), /colunas inesperadas/);
  assert.throws(() => collector.parse({ buffer: zip("x.csv", CSV), ultimaModificacao: "ontem" }), /Last-Modified inválido/);
  assert.throws(() => collector.parse({}), /formato inesperado/);
});

test("download: guarda o Last-Modified; HTTP de erro é falha da fonte", async () => {
  const raw = await collector.download({
    fetchFn: async () => ({ ok: true, headers: new Map([["last-modified", LAST_MODIFIED]]), arrayBuffer: async () => new ArrayBuffer(4) })
  });
  assert.equal(raw.ultimaModificacao, LAST_MODIFIED);
  await assert.rejects(collector.download({ fetchFn: async () => ({ ok: false, status: 503 }) }), /status 503/);
});
