"use strict";

// Backfill dos estoques de café nos portos europeus da ECF (ADR 0061): todas as edições linkadas na página da ECF
// com a tabela por tipo (arquivos de 2020 em diante; ~8 PDFs, menos de 1 min). Reaproveita o coletor real
// (collectors/ecf/ecf-cafe-estoques.collector.js), o runner e o log de execução; troca o download (todos os anos) e a
// persistência (sem a trava da coleta diária). Uma execução só.
//
// ORDEM DE CARGA: rode ANTES da coleta diária num banco novo (a coleta diária só lê o ano corrente e o anterior e se
// recusa a gravar séries ainda sem carga histórica). Reexecutar é seguro: as edições já ingeridas são descartadas.
//
// Uso:
//   node scripts/backfill-ecf-cafe.js

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/ecf/ecf-cafe-estoques.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 30 * 60 * 1000;

async function main() {
  logger.info({ anoInicial: coletor.ANO_INICIAL }, "Iniciando backfill dos estoques de café nos portos europeus (ECF)");

  const execucao = await executarColetor(
    {
      ...coletor,
      timeoutMs: TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      persist: coletor.persistirBackfill,
      download: ({ signal }) => coletor.downloadTodos({ signal })
    },
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
    `Backfill da ECF finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill da ECF");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { main };
