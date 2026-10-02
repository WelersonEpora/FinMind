"use strict";

const collectionExecutionRepository = require("../repositories/collection-execution.repository");
const { listCollectors } = require("../collectors/base/collector.interface");
const { executarColetor } = require("../collectors/base/collector-runner");
const { NotFoundError, ConflictError } = require("../shared/errors");
const logger = require("../shared/logger");
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

  // Só no detalhe: os avisos da fonte (defeitos conhecidos, tratados pelo coletor; não contam como falha).
  const avisos = (execucao.metadata?.avisos || []).map((a) => ({ item: a.item ?? null, motivo: a.motivo }));
  // Também só no detalhe: o que o próprio coletor registrou (ex.: chave, modelo e tokens de uma chamada de IA), ou null.
  const detalhes = execucao.metadata?.detalhes ?? null;
  return { execucao: { ...paraExecucaoResposta(execucao), avisos, detalhes } };
}

// Coleta manual em andamento neste processo: um segundo pedido enquanto ela roda é recusado (409), em vez de
// disparar duas coletas em paralelo contra as mesmas fontes.
let coletaManualEmAndamento = false;

// Inicia a coleta manual de todos os coletores registrados, em sequência e em SEGUNDO PLANO (sem fila/worker -
// ver docs/adr/0004-agendamento-coleta.md): a coleta leva minutos e a requisição não fica esperando. Devolve na
// hora o que foi iniciado; cada coletor vira uma execução em `collection_execution`, acompanhada pela lista.
// `concluida` resolve quando a última execução termina (usada pelos testes; a API não espera por ela).
function iniciarColetaManual(userId, deps = {}) {
  if (coletaManualEmAndamento) {
    throw new ConflictError("Já há uma coleta manual em andamento. Acompanhe as execuções na lista.");
  }
  const coletores = listCollectors();
  const log = deps.logger || logger;
  coletaManualEmAndamento = true;

  const concluida = (async () => {
    try {
      for (const coletor of coletores) {
        await executarColetor(coletor, { triggerType: "manual", triggeredBy: userId }, deps);
      }
    } catch (err) {
      // executarColetor já registra a falha de cada coletor; aqui só chega erro inesperado fora dele.
      log.error({ err }, "Coleta manual interrompida por erro inesperado");
    } finally {
      coletaManualEmAndamento = false;
    }
  })();

  return { coleta: { status: "iniciada", coletores: coletores.map((c) => c.codigo) }, concluida };
}

module.exports = { listarExecucoes, obterExecucao, iniciarColetaManual };
