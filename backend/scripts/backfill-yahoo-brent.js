"use strict";

// Backfill do Brent futuro (NYMEX BZ) pelo Yahoo (ADR 0096). Roda fora da rotina diária (scripts/run-coleta.js).
// Reaproveita o coletor real (collectors/yahoo/yahoo-brent-futuro.collector.js), o runner e o log de execução; só
// troca a fase de download para pedir o histórico inteiro de cada símbolo em vez do último mês.
//
// O que vem: os vencimentos ainda em negociação (os 13 meses seguintes), cada um desde a listagem (2018 a 2020), e a
// série contínua do 1º vencimento (BZ=F) desde 2007-07-30. Os vencimentos que já saíram não existem mais no Yahoo:
// deles só fica a contínua. 14 pedidos, alguns segundos. Cada dia é uma observação própria, então a ordem de carga
// não afeta o point-in-time. Reexecutar é seguro (idempotente por valor, ADR 0008).
//
// Uso:
//   node scripts/backfill-yahoo-brent.js

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/yahoo/yahoo-brent-futuro.collector");
const logger = require("../src/shared/logger");

async function main() {
  logger.info("Iniciando backfill do Brent futuro (Yahoo, NYMEX BZ)");

  const execucao = await executarColetor(
    {
      ...coletor,
      timeoutMs: coletor.TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      download: ({ signal }) => coletor.downloadIntervalo({ signal })
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
    `Backfill do Brent futuro finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do Brent futuro");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}
