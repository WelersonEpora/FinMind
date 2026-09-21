"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { obterStatusProjeto, CAMINHOS_CANDIDATOS } = require("./status-projeto.service");
const { NotFoundError } = require("../shared/errors");

function erroEnoent() {
  return Object.assign(new Error("não existe"), { code: "ENOENT" });
}

test("obterStatusProjeto devolve o markdown do primeiro caminho que existe", async () => {
  const lidos = [];
  const readFile = async (caminho) => {
    lidos.push(caminho);
    if (caminho === "/nao-existe") throw erroEnoent();
    return "# Status";
  };

  const resultado = await obterStatusProjeto({ readFile, caminhos: ["/nao-existe", "/existe"] });

  assert.deepEqual(resultado, { markdown: "# Status" });
  assert.deepEqual(lidos, ["/nao-existe", "/existe"]);
});

test("obterStatusProjeto lança NotFoundError quando nenhum caminho existe", async () => {
  const readFile = async () => {
    throw erroEnoent();
  };

  await assert.rejects(() => obterStatusProjeto({ readFile, caminhos: ["/a", "/b"] }), NotFoundError);
});

test("obterStatusProjeto repassa erros que não são ENOENT (ex.: permissão)", async () => {
  const readFile = async () => {
    throw Object.assign(new Error("sem permissão"), { code: "EACCES" });
  };

  await assert.rejects(() => obterStatusProjeto({ readFile, caminhos: ["/a"] }), { code: "EACCES" });
});

test("em desenvolvimento, o arquivo real da raiz do repositório é encontrado", async () => {
  // Trava o caminho relativo: se o arquivo mudar de lugar, este teste avisa.
  assert.ok(CAMINHOS_CANDIDATOS.some((c) => fs.existsSync(c)));
  const { markdown } = await obterStatusProjeto();
  assert.match(markdown, /Status do projeto/);
});
