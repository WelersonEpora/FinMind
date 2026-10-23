"use strict";

const { executarColetor } = require("../collectors/base/collector-runner");
const { criarColetorCepeaCafePlanilha, lerPlanilha } = require("../collectors/cepea/cepea-cafe-planilha.collector");
const { ValidationError } = require("../shared/errors");

// Importação da planilha do Indicador do Café Arábica CEPEA/ESALQ exportada à mão no site do Cepea (ADR 0146). O mesmo
// caminho na tela (upload, admin) e no script de dev: o arquivo é lido na memória, nunca gravado em disco, e a
// importação vira uma execução do coletor `cepea-cafe-planilha` (tela Execuções), com o upsert append-only da
// `observation` (dia repetido é ignorado; valor diferente vira revisão). O desenho do upload veio do AgroMind.

// `arquivos` = [{ nome, conteudo: Buffer }]. Confere TODOS antes de gravar: um arquivo errado (outro indicador, layout
// diferente) recusa a importação inteira, com o motivo.
async function importarPlanilhasCafe(arquivos, { usuarioId = null } = {}, deps = {}) {
  if (!Array.isArray(arquivos) || arquivos.length === 0) {
    throw new ValidationError("Nenhum arquivo enviado. Envie a planilha .xls exportada do site do Cepea.");
  }
  let dias = [];
  for (const { nome, conteudo } of arquivos) {
    dias = dias.concat(lerPlanilha(conteudo, nome).linhas.map((l) => String(l[0]).trim()));
  }
  if (dias.length === 0) throw new ValidationError("A planilha não tem nenhum dia de dado.");

  const executar = deps.executarColetor || executarColetor;
  const execucao = await executar(criarColetorCepeaCafePlanilha({ arquivos }), { triggerType: "manual", triggeredBy: usuarioId }, deps);
  const isoDe = (d) => d.split("/").reverse().join("-");
  const datas = dias.map(isoDe).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

  return {
    importacao: {
      execucaoId: execucao.id,
      status: execucao.status,
      arquivos: arquivos.length,
      periodo: { de: datas[0] ?? null, ate: datas.at(-1) ?? null },
      // Dois valores por dia (R$ e US$): os contadores são de valores, não de dias.
      valores: {
        lidos: execucao.records_read,
        criados: execucao.records_created,
        atualizados: execucao.records_updated,
        ignorados: execucao.records_skipped,
        falhas: execucao.records_failed
      },
      erro: execucao.error_message ?? null
    }
  };
}

module.exports = { importarPlanilhasCafe };
