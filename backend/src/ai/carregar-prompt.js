"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Prompts versionados em arquivo (ADR 0047), um .md por prompt em ai/prompts/, no formato do AgroMind:
//   **Versão:** N                         -> a versão gravada com cada resposta ("<arquivo>@N")
//   ## Instrução do sistema + ```bloco``` -> texto fixo, sem nenhum {{placeholder}}
//   ## Prompt + ```bloco```               -> o que varia por execução, com {{placeholders}}
// Revisar um prompt = editar o arquivo e subir a versão; o código nunca duplica o texto.

const PASTA_PROMPTS = path.join(__dirname, "prompts");

function extrairBloco(conteudo, titulo, arquivo) {
  const encontrado = conteudo.match(new RegExp(`##\\s+${titulo}\\s*\\n+\`\`\`\\n([\\s\\S]*?)\\n\`\`\``));
  if (!encontrado) {
    throw new Error(`carregar-prompt: "${arquivo}" não tem a seção "## ${titulo}" com um bloco de código.`);
  }
  return encontrado[1];
}

function renderizar(template, dados) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, chave) => {
    if (!(chave in dados)) throw new Error(`carregar-prompt: falta o valor de {{${chave}}}.`);
    return String(dados[chave]);
  });
}

// { versao, instrucaoDoSistema, prompt } prontos para a chamada.
function carregarPrompt(arquivo, dados, { pasta = PASTA_PROMPTS } = {}) {
  const conteudo = fs.readFileSync(path.join(pasta, arquivo), "utf8").replaceAll("\r\n", "\n");
  const versao = conteudo.match(/^\*\*Versão:\*\*\s*(\S+)/m);
  if (!versao) throw new Error(`carregar-prompt: "${arquivo}" não declara a "**Versão:**".`);
  return {
    versao: `${path.basename(arquivo, ".md")}@${versao[1]}`,
    instrucaoDoSistema: extrairBloco(conteudo, "Instrução do sistema", arquivo),
    prompt: renderizar(extrairBloco(conteudo, "Prompt", arquivo), dados)
  };
}

module.exports = { carregarPrompt, renderizar };
