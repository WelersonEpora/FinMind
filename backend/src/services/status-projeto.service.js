"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { NotFoundError } = require("../shared/errors");

const NOME_ARQUIVO = "STATUS_DO_PROJETO.md";

// Em desenvolvimento o arquivo está na raiz do repositório. Na imagem do
// backend (contexto de build = ./backend) a raiz do repositório não existe: o
// deploy.yml copia o arquivo para backend/ antes do build, então ele fica em
// /app. A primeira ordem cobre dev; a segunda, produção.
const CAMINHOS_CANDIDATOS = [
  path.resolve(__dirname, "../../..", NOME_ARQUIVO),
  path.resolve(__dirname, "../..", NOME_ARQUIVO)
];

// Devolve o markdown de STATUS_DO_PROJETO.md como está: o arquivo é a única
// fonte do estado do projeto (CLAUDE.md, "Status do projeto") e a tela só o
// renderiza, sem reescrever seu conteúdo.
async function obterStatusProjeto(deps = {}) {
  const readFile = deps.readFile || fs.readFile;
  const caminhos = deps.caminhos || CAMINHOS_CANDIDATOS;

  for (const caminho of caminhos) {
    try {
      const markdown = await readFile(caminho, "utf8");
      return { markdown };
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  throw new NotFoundError(`${NOME_ARQUIVO} não encontrado no servidor.`);
}

module.exports = { obterStatusProjeto, CAMINHOS_CANDIDATOS };
