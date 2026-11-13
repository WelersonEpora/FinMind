"use strict";

const crypto = require("node:crypto");

// Cifra simétrica para um segredo guardado no banco (hoje, as chaves do Gemini cadastradas na tela, ADR 0156):
// AES-256-GCM, com a chave derivada (SHA-256) do segredo mestre CONFIG_ENCRYPTION_KEY, que fica só no .env. O texto
// cifrado é "v1:<iv>:<tag>:<dados>" em base64; o GCM recusa (lança) um texto adulterado ou cifrado com outro mestre.

const VERSAO = "v1";

function chaveDe(segredoMestre) {
  if (!segredoMestre) throw new Error("CONFIG_ENCRYPTION_KEY não definida.");
  return crypto.createHash("sha256").update(String(segredoMestre)).digest();
}

function cifrar(texto, segredoMestre) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv("aes-256-gcm", chaveDe(segredoMestre), iv);
  const dados = Buffer.concat([cifra.update(String(texto), "utf8"), cifra.final()]);
  return [VERSAO, iv.toString("base64"), cifra.getAuthTag().toString("base64"), dados.toString("base64")].join(":");
}

function decifrar(textoCifrado, segredoMestre) {
  const [versao, iv, tag, dados] = String(textoCifrado).split(":");
  if (versao !== VERSAO || !iv || !tag || dados === undefined) throw new Error("Texto cifrado em formato desconhecido.");
  const decifra = crypto.createDecipheriv("aes-256-gcm", chaveDe(segredoMestre), Buffer.from(iv, "base64"));
  decifra.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decifra.update(Buffer.from(dados, "base64")), decifra.final()]).toString("utf8");
}

module.exports = { cifrar, decifrar };
