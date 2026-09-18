"use strict";

// Backfill do histórico da taxa Selic - meta (BCB SGS série 432) e
// realizada (BCB SGS série 1178) - roda fora da rotina diária
// (scripts/run-coleta.js), só quando é preciso preencher de uma vez um
// intervalo de datas (ex.: primeira carga do banco). Mesmo padrão de
// scripts/backfill-dolar.js: reaproveita parse/normalize/persist dos
// coletores reais e o mesmo runner (collector-runner.js), só trocando a
// fase de download pra pedir um intervalo de datas em vez dos "últimos N"
// pontos. Cada série gera sua própria execução em collection_execution,
// igual à coleta diária (ver docs/adr/0002-arquitetura-coletores.md e
// docs/adr/0006-fonte-taxa-selic-bcb-sgs.md).
//
// Uso:
//   node scripts/backfill-selic.js               (últimos 60 dias, padrão)
//   node scripts/backfill-selic.js --dias=365
//   node scripts/backfill-selic.js --dataInicial=01/01/2026 --dataFinal=31/12/2026
//
// A API do BCB rejeita (HTTP 406) intervalos maiores que ~10 anos - sem
// necessidade real de dividir em blocos pra um backfill de poucos meses.

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const bcbSelicMetaCollector = require("../src/collectors/bcb/bcb-selic-meta.collector");
const bcbSelicRealizadaCollector = require("../src/collectors/bcb/bcb-selic-realizada.collector");
const { resolverIntervalo } = require("./backfill-dolar");
const logger = require("../src/shared/logger");

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function backfillColetor(collector, dataInicial, dataFinal) {
  const coletorBackfill = {
    ...collector,
    download: ({ signal }) => collector.downloadIntervalo({ dataInicial, dataFinal, signal })
  };
  return executarColetor(coletorBackfill, { triggerType: "script" });
}

function logResultado(execucao) {
  logger.info(
    {
      coletor: execucao.collector_code,
      status: execucao.status,
      registrosLidos: execucao.records_read,
      registrosCriados: execucao.records_created,
      registrosAtualizados: execucao.records_updated,
      registrosIgnorados: execucao.records_skipped,
      registrosFalha: execucao.records_failed,
      mensagemErro: execucao.error_message
    },
    `Backfill "${execucao.collector_code}" finalizado com status "${execucao.status}"`
  );
}

async function main() {
  const { dataInicial, dataFinal } = resolverIntervalo(parseArgs());

  logger.info({ dataInicial, dataFinal }, "Iniciando backfill da taxa Selic (meta e realizada)");

  const execucaoMeta = await backfillColetor(bcbSelicMetaCollector, dataInicial, dataFinal);
  logResultado(execucaoMeta);

  const execucaoRealizada = await backfillColetor(bcbSelicRealizadaCollector, dataInicial, dataFinal);
  logResultado(execucaoRealizada);

  return execucaoMeta.status !== "failed" && execucaoRealizada.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { backfillColetor };
