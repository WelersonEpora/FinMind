"use strict";

const zlib = require("node:zlib");

// Leitor mínimo de ZIP (só leitura, sem dependência): devolve as entradas `{ nome, conteudo }` de um
// Buffer. Existe para os arquivos da "Pesquisa por pregão" da B3 (ADR 0021), que vêm como um zip com
// outro zip dentro. Suporta só o que esses arquivos usam - entradas "stored" (0) e "deflate" (8), sem
// criptografia nem ZIP64 -; qualquer outra coisa é erro explícito, nunca um conteúdo errado.
//
// Lê pelo DIRETÓRIO CENTRAL (fim do arquivo), não pelos cabeçalhos locais: com o bit 3 ligado (o caso
// da B3) o cabeçalho local traz tamanho 0 e o tamanho real só existe no diretório central.

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

function localizarFimDoDiretorio(buf) {
  // O registro de fim tem 22 bytes + comentário de até 65.535 bytes.
  const limite = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= limite; i -= 1) {
    if (buf.readUInt32LE(i) === ASSINATURA_FIM) return i;
  }
  throw new Error("Arquivo não é um ZIP (registro de fim do diretório central não encontrado).");
}

function lerZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("Arquivo não é um ZIP (curto demais).");
  const fim = localizarFimDoDiretorio(buf);
  const total = buf.readUInt16LE(fim + 10);
  let pos = buf.readUInt32LE(fim + 16);

  const entradas = [];
  for (let n = 0; n < total; n += 1) {
    if (buf.readUInt32LE(pos) !== ASSINATURA_CENTRAL) throw new Error("Diretório central do ZIP corrompido.");
    const flags = buf.readUInt16LE(pos + 8);
    const metodo = buf.readUInt16LE(pos + 10);
    const tamanhoComprimido = buf.readUInt32LE(pos + 20);
    const tamanho = buf.readUInt32LE(pos + 24);
    const tamNome = buf.readUInt16LE(pos + 28);
    const tamExtra = buf.readUInt16LE(pos + 30);
    const tamComentario = buf.readUInt16LE(pos + 32);
    const inicioLocal = buf.readUInt32LE(pos + 42);
    const nome = buf.toString("latin1", pos + 46, pos + 46 + tamNome);
    pos += 46 + tamNome + tamExtra + tamComentario;

    if (flags & 0x1) throw new Error(`Entrada criptografada no ZIP: ${nome}.`);
    if (nome.endsWith("/")) continue; // diretório

    if (buf.readUInt32LE(inicioLocal) !== ASSINATURA_LOCAL) throw new Error(`Cabeçalho local do ZIP corrompido: ${nome}.`);
    const inicioDados = inicioLocal + 30 + buf.readUInt16LE(inicioLocal + 26) + buf.readUInt16LE(inicioLocal + 28);
    const dados = buf.subarray(inicioDados, inicioDados + tamanhoComprimido);

    let conteudo;
    if (metodo === 0) conteudo = Buffer.from(dados);
    else if (metodo === 8) conteudo = zlib.inflateRawSync(dados);
    else throw new Error(`Método de compressão ${metodo} não suportado no ZIP: ${nome}.`);
    if (conteudo.length !== tamanho) throw new Error(`Tamanho descompactado inesperado no ZIP: ${nome}.`);

    entradas.push({ nome, conteudo });
  }
  return entradas;
}

module.exports = { lerZip };
