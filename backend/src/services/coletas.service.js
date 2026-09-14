"use strict";

const collectionExecutionRepository = require("../repositories/collection-execution.repository");
const { listCollectors } = require("../collectors/base/collector.interface");
const { executarColetor } = require("../collectors/base/collector-runner");
const { NotFoundError } = require("../shared/errors");
const { validarPaginacao } = require("../shared/utils/pagination");
const { validarOrdenacao } = require("../shared/utils/ordenacao");

const CAMPOS_ORDENACAO_EXECUCOES = ["iniciadoEm", "duracaoMs", "status"];

function paraExecucaoResposta(execucao) {
  return {
    id: execucao.id,
    coletor: execucao.collector_code,
    tipoDisparo: execucao.trigger_type,
    status: execucao.status,
    iniciadoEm: execucao.started_at,
    finalizadoEm: execucao.finished_at,
    duracaoMs: execucao.duration_ms,
    registros: {
      lidos: execucao.records_read,
      criados: execucao.records_created,
      atualizados: execucao.records_updated,
      ignorados: execucao.records_skipped,
      falhos: execucao.records_failed
    },
    mensagemErro: execucao.error_message
  };
}

async function listarExecucoes(filtros, deps = {}) {
  const repo = deps.collectionExecutionRepository || collectionExecutionRepository;
  const { pagina, tamanhoPagina } = validarPaginacao(filtros, { tamanhoPadrao: 20, tamanhoMaximo: 100 });
  const { ordenarPor, ordem } = validarOrdenacao(filtros, {
    camposPermitidos: CAMPOS_ORDENACAO_EXECUCOES,
    padrao: "iniciadoEm"
  });

  const { registros, total } = await repo.listar({
    coletor: filtros.coletor,
    status: filtros.status,
    dataInicio: filtros.dataInicio,
    dataFim: filtros.dataFim,
    pagina,
    tamanhoPagina,
    ordenarPor,
    ordem
  });

  return {
    execucoes: registros.map(paraExecucaoResposta),
    paginacao: { pagina, tamanhoPagina, total, totalPaginas: Math.max(1, Math.ceil(total / tamanhoPagina)) }
  };
}

async function obterExecucao(id, deps = {}) {
  const repo = deps.collectionExecutionRepository || collectionExecutionRepository;
  const execucao = await repo.buscarPorId(id);

  if (!execucao) {
    throw new NotFoundError("Execução de coleta não encontrada.");
  }

  return { execucao: paraExecucaoResposta(execucao) };
}

// Roda todos os coletores registrados, sequencialmente (nesta etapa não há
// fila/worker - ver docs/adr/0004-agendamento-coleta.md). Hoje é só o
// coletor do dólar, mas o endpoint já cobre o caso de múltiplos coletores.
async function executarColetaManual(userId, deps = {}) {
  const coletores = listCollectors();
  const execucoes = [];

  for (const coletor of coletores) {
    const execucao = await executarColetor(coletor, { triggerType: "manual", triggeredBy: userId }, deps);
    execucoes.push(paraExecucaoResposta(execucao));
  }

  return { execucoes };
}

module.exports = { listarExecucoes, obterExecucao, executarColetaManual };
