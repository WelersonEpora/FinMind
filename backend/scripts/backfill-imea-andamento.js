"use strict";

// Backfill do andamento da semeadura e da colheita do milho de Mato Grosso (IMEA): todos os Informes de Semeadura e de
// Colheita do catálogo (um por safra: 14 + 12 em 2026-10-01), em vez só do mais recente de cada tipo, que é o que a
// coleta diária lê. Reaproveita o coletor real, o runner e o log de execução. ADR 0039.
//
// ~26 PDFs pequenos, com 1 s de pausa: menos de 1 minuto, UMA execução. Reexecutar é seguro (idempotente por valor,
// ADR 0008). A ordem com a coleta diária não importa: cada semana é uma observação própria.
//
// Uso: node scripts/backfill-imea-andamento.js   (npm run backfill:imea-andamento)

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/imea/imea-andamento-milho.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 10 * 60 * 1000;

async function main() {
  logger.info("Iniciando backfill do andamento da semeadura e da colheita do milho (IMEA)");
  const execucao = await executarColetor(
    { ...coletor, timeoutMs: TIMEOUT_BACKFILL_MS, tentativasRetry: 1, download: ({ signal }) => coletor.downloadTodos({ signal }) },
    { triggerType: "script" }
  );
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
    `Backfill do andamento do milho (IMEA) finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do andamento do milho (IMEA)");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}
