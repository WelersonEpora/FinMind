"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const collector = require("./jodi-demanda-petroleo.collector");
const producao = require("./jodi-producao-petroleo.collector");

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

// Linhas reais do arquivo "secondary" de 2026-09-22 (mais as de outros derivados e unidades, que o filtro ignora).
const CSV = [
  "REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE",
  "BR,2022-02,GASOLINE,TOTDEMO,KBD,641.4286,2",
  "BR,2022-02,TOTPRODS,TOTDEMO,KBD,2471.0000,1",
  "BR,2022-02,TOTPRODS,TOTDEMO,KTONS,8796.0000,1",
  "CN,2022-02,TOTPRODS,TOTDEMO,KBD,15923.4507,3",
  "CN,2026-07,GASOLINE,TOTDEMO,KBD,2972.2581,3",
  "RU,2026-07,TOTPRODS,TOTDEMO,KBD,-,3",
  "CN,2022-02,CRUDEOIL,INDPROD,KBD,4000.0000,3"
].join("\r\n");

const LAST_MODIFIED = "Tue, 22 Sep 2026 07:16:07 GMT";

test("parse + normalize: só a demanda total de derivados em mil barris/dia; '-' é ausente (aviso)", () => {
  const itens = collector.parse({ buffer: zip("NewProcedure_Secondary_CSV.csv", CSV), ultimaModificacao: LAST_MODIFIED });
  assert.equal(itens.length, 3);
  const { validos, invalidos, avisos } = collector.normalize(itens);
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.unit, v.metadata.codigoAvaliacao]),
    [
      ["JODI.PETROLEO_DEMANDA.BR.DEMANDA", "2022-02-01", 2471, "mil barris/dia", "1"],
      ["JODI.PETROLEO_DEMANDA.CN.DEMANDA", "2022-02-01", 15923.4507, "mil barris/dia", "3"]
    ]
  );
  assert.equal(validos[0].published_at.toISOString(), "2026-09-22T07:16:07.000Z");
  assert.equal(validos[0].source_code, "JODI");
  assert.match(validos[0].metadata.fonte, /secondary/);
  assert.equal(avisos.length, 1);
});

test("a demanda e a produção leem arquivos diferentes e não se misturam", async () => {
  assert.equal(collector.codigo, "jodi-demanda-petroleo");
  assert.notEqual(collector.PREFIXO_SERIE, producao.PREFIXO_SERIE);
  // A produção não acha nada no arquivo de derivados, salvo a linha de petróleo bruto.
  assert.equal(producao.parse({ buffer: zip("x.csv", CSV), ultimaModificacao: LAST_MODIFIED }).length, 1);

  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    return { ok: true, headers: new Map([["last-modified", LAST_MODIFIED]]), arrayBuffer: async () => new ArrayBuffer(4) };
  };
  await collector.download({ fetchFn });
  await producao.download({ fetchFn });
  assert.match(urls[0], /world_secondary_csv\.zip$/);
  assert.match(urls[1], /world_primary_csv\.zip$/);
});
