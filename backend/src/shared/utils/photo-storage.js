"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const env = require("../../config/env");

// Disco local em diretório dedicado (volume Docker em produção - ver
// docker/compose.prod.yml), nunca servido como estático público - só lido
// atrás de autenticação (ver user.controller.js). Mesmo padrão do
// Personal-Assistant (services/storage-foto.service.js).
const BASE_DIR = path.resolve(__dirname, "..", "..", "..", env.photoStorageDir);

const EXTENSION_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const MIME_BY_EXTENSION = Object.fromEntries(Object.entries(EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime]));

function isMimeSupported(mimeType) {
  return Boolean(EXTENSION_BY_MIME[mimeType]);
}

// Nome do arquivo vem de uma chave montada pelo chamador ("user-<id>"),
// nunca do nome enviado pelo cliente - elimina risco de path traversal. Um
// novo upload substitui a foto anterior (mesmo nome por chave).
async function save({ key, buffer, mimeType }) {
  await fs.mkdir(BASE_DIR, { recursive: true });
  const fileName = `${key}${EXTENSION_BY_MIME[mimeType]}`;
  await fs.writeFile(path.join(BASE_DIR, fileName), buffer);
  return fileName;
}

async function read(fileName) {
  const buffer = await fs.readFile(path.join(BASE_DIR, fileName));
  const mimeType = MIME_BY_EXTENSION[path.extname(fileName)] || "application/octet-stream";
  return { buffer, mimeType };
}

// Idempotente: não ter o arquivo em disco não é erro.
async function remove(fileName) {
  try {
    await fs.unlink(path.join(BASE_DIR, fileName));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { save, read, remove, isMimeSupported };
