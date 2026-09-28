"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./usda-psd-cafe.collector");
const { UpstreamServiceError } = require("../../shared/errors");

const CABECALHO =
  "Commodity_Code,Commodity_Description,Country_Code,Country_Name,Market_Year,Calendar_Year,Month,Attribute_ID,Attribute_Description,Unit_ID,Unit_Description,Value";
const CSV = [
  CABECALHO,
  '0711100,"Coffee, Green",BR,"Brazil",2025,2026,07,028,"Production",02,"(1000 60 KG BAGS)",63000.0000',
  '0711100,"Coffee, Green",VM,"Vietnam",2024,2025,12,176,"Ending Stocks",02,"(1000 60 KG BAGS)",1200.0000',
  '0711100,"Coffee, Green",BR,"Brazil",1998,1998,00,028,"Production",02,"(1000 60 KG BAGS)",35600.0000'
].join("\r\n");

// ZIP mínimo sem compressão ("stored") com um CSV.
function montarZip(nome, conteudo) {
  const nomeBuf = Buffer.from(nome, "latin1");
  const dados = Buffer.from(conteudo, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(dados.length, 18);
  local.writeUInt32LE(dados.length, 22);
  local.writeUInt16LE(nomeBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(dados.length, 20);
  central.writeUInt32LE(dados.length, 24);
  central.writeUInt16LE(nomeBuf.length, 28);
  const diretorio = Buffer.concat([central, nomeBuf]);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(1, 8);
  fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(local.length + nomeBuf.length + dados.length, 16);
  return Buffer.concat([local, nomeBuf, dados, diretorio, fim]);
}

const resposta = (status, corpo, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  arrayBuffer: async () => corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength)
});

test("download lê o CSV de dentro do ZIP e guarda o Last-Modified", async () => {
  let urlPedida;
  const fetchFn = async (url) => {
    urlPedida = url;
    return resposta(200, montarZip("psd_coffee.csv", CSV), { "last-modified": "Wed, 22 Jul 2026 19:02:11 GMT" });
  };
  const bruto = await coletor.download({ fetchFn });
  assert.equal(urlPedida, coletor.URL_ARQUIVO);
  assert.equal(bruto.texto, CSV);
  assert.equal(bruto.ultimaModificacao, "Wed, 22 Jul 2026 19:02:11 GMT");
});

test("download: HTTP de erro, ZIP ilegível ou ZIP sem CSV viram UpstreamServiceError", async () => {
  await assert.rejects(coletor.download({ fetchFn: async () => resposta(503, Buffer.alloc(0)) }), UpstreamServiceError);
  await assert.rejects(coletor.download({ fetchFn: async () => resposta(200, Buffer.from("<html>")) }), UpstreamServiceError);
  await assert.rejects(coletor.download({ fetchFn: async () => resposta(200, montarZip("leia-me.txt", "x")) }), /não traz um CSV/);
});

test("normalize: fim do mês da revisão, estimado; sem mês de revisão, sem published_at (o serviço usa a coleta)", () => {
  const { validos, invalidos } = coletor.normalize(coletor.parse({ texto: CSV, ultimaModificacao: null }));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.published_at?.toISOString() ?? null]),
    [
      ["USDA.PSD.CAFE.VM.ESTOQUE_FINAL", "2024-01-01", 1200, "2025-12-31T23:59:59.000Z"],
      ["USDA.PSD.CAFE.BR.PRODUCAO", "2025-01-01", 63000, "2026-07-31T23:59:59.000Z"],
      ["USDA.PSD.CAFE.BR.PRODUCAO", "1998-01-01", 35600, null]
    ]
  );
  assert.ok(validos.every((v) => v.published_at_is_estimated && v.unit === "mil sacas" && v.source_code === "USDA_FAS_PSD"));
  assert.equal(validos[1].metadata.safra, "2025/26");
});

test("parse: cabeçalho trocado ou arquivo sem nenhum atributo coletado falham a coleta", () => {
  assert.throws(() => coletor.parse({ texto: "a,b,c\n1,2,3" }), UpstreamServiceError);
  assert.throws(() => coletor.parse({ texto: `${CABECALHO}\r\n` }), /nenhum dos atributos/);
});

test("fimDoMesUtc cobre fevereiro e dezembro", () => {
  assert.equal(coletor.fimDoMesUtc("2024-02").toISOString(), "2024-02-29T23:59:59.000Z");
  assert.equal(coletor.fimDoMesUtc("2025-12").toISOString(), "2025-12-31T23:59:59.000Z");
});
