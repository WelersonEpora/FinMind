"use strict";

const collectionExecutionRepository = require("../../repositories/collection-execution.repository");
const logger = require("../../shared/logger");
const { AppError, UpstreamServiceError } = require("../../shared/errors");
const { withRetry } = require("./retry");

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_TENTATIVAS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

function paraErroDeComunicacao(err) {
  if (err instanceof AppError) return err;
  if (err.name === "AbortError") {
    return new UpstreamServiceError("Tempo limite excedido ao consultar a fonte de dados.");
  }
  return new UpstreamServiceError(`Falha ao consultar a fonte de dados: ${err.message}`);
}

async function baixarComTimeout(collector) {
  const timeoutMs = collector.timeoutMs || DEFAULT_TIMEOUT_MS;

  // Um AbortController+timeout novo por TENTATIVA - reaproveitar o mesmo
  // entre tentativas do retry é um bug: uma vez abortado, o signal fica
  // abortado pra sempre, então qualquer tentativa seguinte já nasceria
  // abortada instantaneamente em vez de tentar de novo de verdade.
  async function umaTentativa() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await collector.download({ signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  try {
    return await withRetry(umaTentativa, {
      tentativas: collector.tentativasRetry || DEFAULT_RETRY_TENTATIVAS,
      delayMs: DEFAULT_RETRY_DELAY_MS
    });
  } catch (err) {
    throw paraErroDeComunicacao(err);
  }
}

function calcularStatus({ registrosPersistidos, registrosFalha }) {
  if (registrosFalha === 0) return "success";
  return registrosPersistidos > 0 ? "partial_success" : "failed";
}

// Orquestra um coletor: download (com timeout+retry) -> parse -> normalize
// -> persist, registrando uma execução (collection_execution) do início ao
// fim. Uma falha de comunicação (download/parse) marca a execução inteira
// como "failed"; um item individual inválido (normalize) ou que falhe ao
// persistir não aborta o restante do lote - vira "partial_success" com o
// motivo registrado em metadata.
async function executarColetor(collector, { triggerType = "manual", triggeredBy = null } = {}, deps = {}) {
  const repo = deps.collectionExecutionRepository || collectionExecutionRepository;
  const log = (deps.logger || logger).child({ coletor: collector.codigo });

  const iniciadoEm = new Date();
  const execucao = await repo.criar({
    collector_code: collector.codigo,
    trigger_type: triggerType,
    status: "running",
    started_at: iniciadoEm,
    triggered_by: triggeredBy
  });

  const inicioMs = Date.now();
  log.info({ execucaoId: execucao.id }, "Iniciando coleta");

  try {
    const rawData = await baixarComTimeout(collector);
    const rawItems = collector.parse(rawData);
    const { validos, invalidos } = collector.normalize(rawItems);
    const persistResult = await collector.persist(validos, { execucaoId: execucao.id }, deps);
    const falhasPersistencia = persistResult.falhas || [];

    const registrosPersistidos = persistResult.criados + persistResult.atualizados + persistResult.ignorados;
    const registrosFalha = invalidos.length + falhasPersistencia.length;

    const atualizada = await repo.atualizar(execucao, {
      status: calcularStatus({ registrosPersistidos, registrosFalha }),
      finished_at: new Date(),
      duration_ms: Date.now() - inicioMs,
      records_read: rawItems.length,
      records_created: persistResult.criados,
      records_updated: persistResult.atualizados,
      records_skipped: persistResult.ignorados,
      records_failed: registrosFalha,
      metadata: {
        invalidos: invalidos.slice(0, 50),
        falhasPersistencia: falhasPersistencia.slice(0, 50)
      }
    });

    log.info({ execucaoId: execucao.id, status: atualizada.status }, "Coleta finalizada");
    return atualizada;
  } catch (err) {
    log.error({ execucaoId: execucao.id, err }, "Coleta falhou");
    return repo.atualizar(execucao, {
      status: "failed",
      finished_at: new Date(),
      duration_ms: Date.now() - inicioMs,
      error_message: err.message
    });
  }
}

module.exports = { executarColetor };
