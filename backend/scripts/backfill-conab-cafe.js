"use strict";

// Backfill do café da Conab (Boletim da Safra de Café) - roda fora da rotina diária
// (scripts/run-coleta.js). Reaproveita o coletor real (collectors/conab/conab-cafe.collector.js), o
// runner e o log de execução; só troca a fase de download para baixar TODOS os levantamentos que ainda
// têm página na Conab (15 em 2026-09: jan/2023 a set/2026), em vez de só os das duas últimas safras. ADR 0029.
//
// Cada levantamento é uma página + uma planilha de ~500 KB, com 1 s de pausa entre eles: cerca de meio
// minuto no total. Uma execução só (collection_execution). Reexecutar é seguro (idempotente por valor,
// ADR 0008): o serviço só grava o que mudou, e os levantamentos já ingeridos são descartados.
//
// ORDEM DE CARGA: rode este script ANTES da coleta diária em qualquer banco novo. A coleta diária lê só
// o levantamento mais recente e se recusa a gravar séries ainda sem carga histórica (senão os
// levantamentos antigos não poderiam mais ser inseridos, o modelo é append-only).
//
// O histórico anterior a 2023 NÃO tem página de levantamento (404); a série histórica da Conab (safras
// de 2001 em diante) é outro produto, sem vintage, e não é carregada aqui (ADR 0029).
//
// Uso:
//   node scripts/backfill-conab-cafe.js

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const conabCollector = require("../src/collectors/conab/conab-cafe.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 30 * 60 * 1000;

async function main() {
  logger.info({}, "Iniciando backfill do café da Conab (levantamentos desde 2023)");

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
    `Backfill do café da Conab finalizado com status "${execucao.status}"`
  );

  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do café da Conab");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { main };
