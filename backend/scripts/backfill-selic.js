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
//   node scripts/backfill-selic.js --dataInicial=01/07/1994    (histórico completo)
//
// A API do BCB rejeita (HTTP 406) um pedido com mais de 10 anos: o intervalo é
// dividido em janelas de até 10 anos (dividirEmJanelas, em backfill-dolar.js),
// uma execução por série e por janela. A meta (432) só existe desde 05/03/1999;
// a partir de 01/07/1994 a primeira janela já contém dado das duas séries.

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const bcbSelicMetaCollector = require("../src/collectors/bcb/bcb-selic-meta.collector");
const bcbSelicRealizadaCollector = require("../src/collectors/bcb/bcb-selic-realizada.collector");
const { resolverIntervalo, dividirEmJanelas, TIMEOUT_BACKFILL_MS } = require("./backfill-dolar");
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
    timeoutMs: TIMEOUT_BACKFILL_MS,
    download: ({ signal }) => collector.downloadIntervalo({ dataInicial, dataFinal, signal })
  };
  return executarColetor(coletorBackfill, { triggerType: "script" });
}

function logResultado(execucao, janela) {
  logger.info(
    {
      ...janela,
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
  const janelas = dividirEmJanelas(dataInicial, dataFinal);
  let sucesso = true;

  logger.info({ dataInicial, dataFinal, janelas: janelas.length }, "Iniciando backfill da taxa Selic (meta e realizada)");

  for (const janela of janelas) {
    for (const collector of [bcbSelicMetaCollector, bcbSelicRealizadaCollector]) {
      const execucao = await backfillColetor(collector, janela.dataInicial, janela.dataFinal);
      logResultado(execucao, janela);
      if (execucao.status === "failed") sucesso = false;
    }
  }

  return sucesso;
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
