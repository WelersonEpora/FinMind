"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { NotFoundError, ValidationError } = require("../shared/errors");

// Documentos do projeto que a tela "Status do projeto" abre num modal: os ADRs, os reconhecimentos de fonte, os
// documentos de `docs/` e o CLAUDE.md - os que o STATUS_DO_PROJETO.md cita. Devolve o markdown como está (o arquivo
// é a fonte; a tela só renderiza), como o status-projeto.service.
//
// SÓ ESTES ARQUIVOS: a lista é montada lendo as pastas permitidas, e um documento é pedido pelo seu `id` (nunca por
// caminho), então não há como ler outro arquivo do servidor. `docs/Docs_David` (material confidencial do
// especialista) e `docs/Docs_Base` (arquivos de fonte baixados) ficam de fora.
//
// Em desenvolvimento os arquivos estão na raiz do repositório. Na imagem do backend (contexto de build = ./backend)
// a raiz não existe: o deploy.yml copia CLAUDE.md e docs/ para backend/projeto/ antes do build, então ficam em
// /app/projeto. A primeira raiz cobre dev; a segunda, produção.
const RAIZES_CANDIDATAS = [path.resolve(__dirname, "../../.."), path.resolve(__dirname, "../../projeto")];

// Pastas lidas (relativas à raiz) e o grupo de cada uma na lista.
const PASTAS = [
  { pasta: "docs/adr", grupo: "adr" },
  { pasta: "docs/reconhecimento-fontes", grupo: "reconhecimento" },
  { pasta: "docs", grupo: "projeto" }
];
const ARQUIVOS_AVULSOS = [{ caminho: "CLAUDE.md", grupo: "projeto" }];

const RE_ID = /^[a-z0-9-]{1,120}$/;

// Caminho relativo à raiz -> id estável e sem barra (vai na URL da tela: `?doc=adr-0027`). A MESMA regra está em
// frontend/src/utils/documentos.js, que monta os links a partir das menções do markdown.
function idDoCaminho(caminho) {
  const c = String(caminho || "").replace(/\\/g, "/").replace(/^\.\//, "");
  let m = /^docs\/adr\/(\d{4})-[^/]+\.md$/.exec(c);
  if (m) return `adr-${m[1]}`;
  m = /^docs\/reconhecimento-fontes\/([^/]+)\.md$/.exec(c);
  if (m) return `reconhecimento-${m[1].toLowerCase()}`;
  m = /^docs\/([^/]+)\.md$/.exec(c);
  if (m) return m[1].toLowerCase();
  if (c === "CLAUDE.md") return "claude";
  return null;
}

// Primeira linha "# Título" do markdown; sem ela, o nome do arquivo.
function tituloDe(markdown, caminho) {
  const linha = String(markdown).split(/\r?\n/).find((l) => /^#\s+\S/.test(l));
  return linha ? linha.replace(/^#\s+/, "").trim() : path.posix.basename(caminho, ".md");
}

async function acharRaiz({ raizes, stat }) {
  for (const raiz of raizes) {
    try {
      if ((await stat(path.join(raiz, "docs", "adr"))).isDirectory()) return raiz;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  throw new NotFoundError("Os documentos do projeto não foram encontrados no servidor.");
}

// [{ id, caminho, grupo }] dos arquivos permitidos que existem, em ordem de caminho.
async function listarArquivos(deps = {}) {
  const readdir = deps.readdir || fs.readdir;
  const stat = deps.stat || fs.stat;
  const raiz = await acharRaiz({ raizes: deps.raizes || RAIZES_CANDIDATAS, stat });

  const arquivos = [];
  for (const { pasta, grupo } of PASTAS) {
    let nomes = [];
    try {
      nomes = await readdir(path.join(raiz, pasta));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    for (const nome of nomes.filter((n) => n.endsWith(".md"))) {
      const caminho = `${pasta}/${nome}`;
      const id = idDoCaminho(caminho);
      if (id) arquivos.push({ id, caminho, grupo });
    }
  }
  for (const avulso of ARQUIVOS_AVULSOS) {
    try {
      await stat(path.join(raiz, avulso.caminho));
      arquivos.push({ id: idDoCaminho(avulso.caminho), ...avulso });
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  // Ordem pelo código dos caracteres, não por `localeCompare`: a ordem do idioma muda com a máquina (no runner Linux
  // do CI, com LANG=C, maiúscula vem antes de minúscula) e a lista sairia diferente em cada ambiente.
  return { raiz, arquivos: arquivos.sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0)) };
}

async function listarDocumentos(deps = {}) {
  const readFile = deps.readFile || fs.readFile;
  const { raiz, arquivos } = await listarArquivos(deps);
  const documentos = [];
  for (const a of arquivos) {
    const markdown = await readFile(path.join(raiz, a.caminho), "utf8");
    documentos.push({ id: a.id, titulo: tituloDe(markdown, a.caminho), caminho: a.caminho, grupo: a.grupo });
  }
  return { documentos };
}

async function obterDocumento(id, deps = {}) {
  if (!RE_ID.test(String(id || ""))) throw new ValidationError("Identificador de documento inválido.");
  const readFile = deps.readFile || fs.readFile;
  const { raiz, arquivos } = await listarArquivos(deps);
  const arquivo = arquivos.find((a) => a.id === id);
  if (!arquivo) throw new NotFoundError("Documento não encontrado.");

  const markdown = await readFile(path.join(raiz, arquivo.caminho), "utf8");
  return {
    documento: { id: arquivo.id, titulo: tituloDe(markdown, arquivo.caminho), caminho: arquivo.caminho, grupo: arquivo.grupo, markdown }
  };
}

module.exports = { listarDocumentos, obterDocumento, idDoCaminho, tituloDe, RAIZES_CANDIDATAS };
