"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { listarDocumentos, obterDocumento, idDoCaminho, tituloDe } = require("./documentos-projeto.service");
const { NotFoundError, ValidationError } = require("../shared/errors");

// Sistema de arquivos em memória: { "<raiz>/<caminho>": conteúdo }; pastas são deduzidas dos caminhos.
function fsFalso(arquivos) {
  const norm = (p) => p.replace(/\\/g, "/");
  const enoent = () => Object.assign(new Error("não existe"), { code: "ENOENT" });
  const chaves = Object.keys(arquivos);
  return {
    async stat(p) {
      const alvo = norm(p);
      if (chaves.includes(alvo)) return { isDirectory: () => false };
      if (chaves.some((k) => k.startsWith(`${alvo}/`))) return { isDirectory: () => true };
      throw enoent();
    },
    async readdir(p) {
      const alvo = `${norm(p)}/`;
      const nomes = new Set(chaves.filter((k) => k.startsWith(alvo)).map((k) => k.slice(alvo.length).split("/")[0]));
      if (nomes.size === 0) throw enoent();
      return [...nomes];
    },
    async readFile(p) {
      const alvo = norm(p);
      if (!(alvo in arquivos)) throw enoent();
      return arquivos[alvo];
    }
  };
}

const RAIZ = "/repo";
const ARQUIVOS = {
  "/repo/CLAUDE.md": "# CLAUDE.md\n\nGuia",
  "/repo/docs/pendente-especialista-david.md": "# Pendências do David",
  "/repo/docs/adr/0027-usda-area-plantada-milho-esmis.md": "# 0027 — Área plantada\n\ntexto",
  "/repo/docs/adr/README-rascunho.md": "# fora do padrão de ADR",
  "/repo/docs/reconhecimento-fontes/README.md": "# Índice",
  "/repo/docs/reconhecimento-fontes/clima.md": "# Clima",
  "/repo/docs/Docs_David/segredo.md": "# confidencial",
  "/repo/docs/notas.txt": "não é markdown"
};
const deps = () => ({ ...fsFalso(ARQUIVOS), raizes: ["/nao-existe", RAIZ] });

test("idDoCaminho: ADR pelo número, reconhecimento com prefixo, docs/ pelo nome, CLAUDE.md; o resto não tem id", () => {
  assert.equal(idDoCaminho("docs/adr/0027-usda-area-plantada-milho-esmis.md"), "adr-0027");
  assert.equal(idDoCaminho("docs/reconhecimento-fontes/README.md"), "reconhecimento-readme");
  assert.equal(idDoCaminho("./docs/pendente-especialista-david.md"), "pendente-especialista-david");
  assert.equal(idDoCaminho("CLAUDE.md"), "claude");
  assert.equal(idDoCaminho("docs/Docs_David/segredo.md"), null);
  assert.equal(idDoCaminho("STATUS_DO_PROJETO.md"), null);
  assert.equal(idDoCaminho("docs/adr/sem-numero.md"), null);
});

test("tituloDe: a primeira linha '# ', ou o nome do arquivo", () => {
  assert.equal(tituloDe("texto\n# 0027 — Área plantada\n## seção", "docs/adr/0027-x.md"), "0027 — Área plantada");
  assert.equal(tituloDe("sem título", "docs/adr/0027-x.md"), "0027-x");
});

test("listarDocumentos: só as pastas permitidas (sem Docs_David, sem arquivo fora do padrão), com id, título e grupo", async () => {
  const { documentos } = await listarDocumentos(deps());
  assert.deepEqual(documentos, [
    { id: "claude", titulo: "CLAUDE.md", caminho: "CLAUDE.md", grupo: "projeto" },
    { id: "adr-0027", titulo: "0027 — Área plantada", caminho: "docs/adr/0027-usda-area-plantada-milho-esmis.md", grupo: "adr" },
    { id: "pendente-especialista-david", titulo: "Pendências do David", caminho: "docs/pendente-especialista-david.md", grupo: "projeto" },
    { id: "reconhecimento-clima", titulo: "Clima", caminho: "docs/reconhecimento-fontes/clima.md", grupo: "reconhecimento" },
    { id: "reconhecimento-readme", titulo: "Índice", caminho: "docs/reconhecimento-fontes/README.md", grupo: "reconhecimento" }
  ]);
});

test("obterDocumento: devolve o markdown como está, pelo id", async () => {
  const { documento } = await obterDocumento("adr-0027", deps());
  assert.equal(documento.markdown, "# 0027 — Área plantada\n\ntexto");
  assert.equal(documento.caminho, "docs/adr/0027-usda-area-plantada-milho-esmis.md");
});

test("obterDocumento: id fora da lista é 404; id com barra ou ponto (tentativa de caminho) é recusado antes de ler", async () => {
  await assert.rejects(obterDocumento("adr-9999", deps()), NotFoundError);
  await assert.rejects(obterDocumento("docs-david-segredo", deps()), NotFoundError);
  for (const id of ["../../.env", "docs/adr/0027", "..", "", "ADR-0027"]) {
    await assert.rejects(obterDocumento(id, deps()), ValidationError, `recusa "${id}"`);
  }
});

test("sem nenhuma raiz com docs/adr, a lista é 404 (não uma lista vazia silenciosa)", async () => {
  await assert.rejects(listarDocumentos({ ...fsFalso({}), raizes: ["/vazio"] }), NotFoundError);
});

// ---- Guarda de link quebrado: tudo o que o STATUS_DO_PROJETO.md cita tem de existir (repositório real)
test("STATUS_DO_PROJETO.md: todo ADR e todo documento citado existem entre os documentos que a tela abre", async () => {
  const raizRepo = path.resolve(__dirname, "../../..");
  const status = fs.readFileSync(path.join(raizRepo, "STATUS_DO_PROJETO.md"), "utf8");
  const { documentos } = await listarDocumentos({ raizes: [raizRepo] });
  const ids = new Set(documentos.map((d) => d.id));

  const citados = new Set();
  for (const m of status.matchAll(/\bADRs? (\d{4}(?:(?:, | e | a |–|-)\d{4})*)/g)) {
    for (const n of m[1].match(/\d{4}/g)) citados.add(`adr-${n}`);
  }
  for (const m of status.matchAll(/`([^`\s]+\.md)`/g)) {
    const id = idDoCaminho(m[1]);
    if (id) citados.add(id);
  }

  const faltando = [...citados].filter((id) => !ids.has(id));
  assert.deepEqual(faltando, [], `citados no status e sem documento: ${faltando.join(", ")}`);
  assert.ok(citados.size > 30, "o status cita dezenas de documentos (a extração funcionou)");
});

test("STATUS_DO_PROJETO.md e CLAUDE.md não voltam a mandar para o documento aposentado de pendências do David", () => {
  const raizRepo = path.resolve(__dirname, "../../..");
  const status = fs.readFileSync(path.join(raizRepo, "STATUS_DO_PROJETO.md"), "utf8");
  assert.equal(status.includes("pendente-especialista-david"), false, "o que falta decidir fica no próprio status (§4)");

  // O CLAUDE.md só cita o arquivo para registrar que foi aposentado.
  const claude = fs.readFileSync(path.join(raizRepo, "CLAUDE.md"), "utf8");
  const citacoes = claude.split("\n").filter((l) => l.includes("pendente-especialista-david"));
  assert.ok(citacoes.every((l) => /aposentado/.test(l)), `citação fora do registro da aposentadoria: ${citacoes.join(" | ")}`);
});
