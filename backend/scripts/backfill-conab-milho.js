"use strict";

// Backfill do milho da Conab (Boletim da Safra de Grãos) - roda fora da rotina diária
// (scripts/run-coleta.js). Reaproveita o coletor real (collectors/conab/conab-milho.collector.js), o
// runner e o log de execução; só troca a fase de download para baixar TODOS os levantamentos que o
// índice da Conab ainda mantém (15 em 2026-09: fev/2025 a set/2026), em vez de só o mais recente. ADR 0017.
//
// Cada levantamento é uma página + uma planilha de ~1 MB, com 1 s de pausa entre eles: cerca de 1
// minuto no total. Uma execução só (collection_execution). Reexecutar é seguro (idempotente por valor,
// ADR 0008): o serviço só grava o que mudou, e os levantamentos já ingeridos são descartados.
//
// ORDEM DE CARGA: rode este script ANTES da coleta diária em qualquer banco novo. A coleta diária lê só
// o levantamento mais recente e se recusa a gravar séries ainda sem carga histórica (senão os
// levantamentos antigos não poderiam mais ser inseridos, o modelo é append-only).
//
// O histórico anterior a fev/2025 NÃO está nos levantamentos mensais (as séries históricas da Conab, de
// 1976/77 em diante, são outro produto, sem vintage - ADR 0016) e não é carregado aqui.
//
// Uso:
//   node scripts/backfill-conab-milho.js

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const conabCollector = require("../src/collectors/conab/conab-milho.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 30 * 60 * 1000;

async function main() {
  logger.info({}, "Iniciando backfill do milho da Conab (levantamentos do índice)");

  const coletorBackfill = {
    ...conabCollector,
    timeoutMs: TIMEOUT_BACKFILL_MS,
    tentativasRetry: 1,
    // A carga histórica NÃO pode ter a trava da coleta diária (que exige a fonte já carregada).
    persist: conabCollector.persistirBackfill,
    download: ({ signal }) => conabCollector.downloadTodos({ signal })
  };

  const execucao = await executarColetor(coletorBackfill, { triggerType: "script" });

  logger.info(
    {
      status: execucao.status,
      registrosLidos: execucao.records_read,
      registrosCriados: execucao.records_created,
      registrosAtualizados: execucao.records_updated,
      registrosIgnorados: execucao.records_skipped,
      registrosFalha: execucao.records_failed,
      mensagemErro: execucao.error_message
    },
    `Backfill da Conab finalizado com status "${execucao.status}"`
  );

  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill da Conab");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { main };
