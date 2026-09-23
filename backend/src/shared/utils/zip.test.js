"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { lerZip } = require("./zip");

// Monta um ZIP em memória. `descritor` imita a B3: bit 3 ligado e tamanhos ZERADOS no cabeçalho local
// (o tamanho real só existe no diretório central).
function montarZip(arquivos, { descritor = false } = {}) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const { nome, conteudo, metodo = 8 } of arquivos) {
    const nomeBuf = Buffer.from(nome, "latin1");
    const dados = metodo === 8 ? zlib.deflateRawSync(conteudo) : conteudo;
    const flags = descritor ? 0x8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(descritor ? 0 : dados.length, 18);
    local.writeUInt32LE(descritor ? 0 : conteudo.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    locais.push(local, nomeBuf, dados);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(conteudo.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrais.push(central, nomeBuf);

    offset += local.length + nomeBuf.length + dados.length;
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

test("lerZip: lê entradas deflate e stored", () => {
  const zip = montarZip([
    { nome: "a.txt", conteudo: Buffer.from("linha 1\r\nlinha 2\r\n".repeat(50)) },
    { nome: "b.txt", conteudo: Buffer.from("sem compressão"), metodo: 0 }
  ]);
  const entradas = lerZip(zip);
  assert.deepEqual(entradas.map((e) => e.nome), ["a.txt", "b.txt"]);
  assert.equal(entradas[0].conteudo.toString(), "linha 1\r\nlinha 2\r\n".repeat(50));
  assert.equal(entradas[1].conteudo.toString(), "sem compressão");
});

test("lerZip: tamanho vem do diretório central quando o cabeçalho local está zerado (bit 3, caso da B3)", () => {
  const interno = montarZip([{ nome: "Indic.txt", conteudo: Buffer.from("conteúdo", "latin1") }], { descritor: true });
  const externo = montarZip([{ nome: "ID260922.ex_", conteudo: interno }], { descritor: true });
  const [ex] = lerZip(externo);
  assert.equal(ex.nome, "ID260922.ex_");
  const [txt] = lerZip(ex.conteudo);
  assert.equal(txt.nome, "Indic.txt");
  assert.equal(txt.conteudo.toString("latin1"), "conteúdo");
});

test("lerZip: ZIP vazio (o que a B3 devolve em dia sem pregão) não tem entradas", () => {
  assert.deepEqual(lerZip(montarZip([])), []);
});

test("lerZip: o que não é ZIP é erro explícito", () => {
  assert.throws(() => lerZip(Buffer.from("<html>erro</html>".repeat(3))), /não é um ZIP/);
  assert.throws(() => lerZip(Buffer.alloc(5)), /não é um ZIP/);
});

test("lerZip: método de compressão desconhecido é erro, não conteúdo errado", () => {
  const zip = montarZip([{ nome: "x.txt", conteudo: Buffer.from("abc"), metodo: 0 }]);
  const pos = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt16LE(12, pos + 10); // bzip2
  assert.throws(() => lerZip(zip), /Método de compressão 12/);
});
