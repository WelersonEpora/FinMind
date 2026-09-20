"use strict";

// Backfill do preço diário dos futuros de milho da B3 (CCM) - roda fora da
// rotina diária (scripts/run-coleta.js). Reaproveita o coletor real
// (collectors/b3/b3-ccm.collector.js), o runner e o log de execução; só troca a
// fase de download para pedir um intervalo longo de pregões.
//
// A B3 só oferece uma janela rolante de ~15 meses (ver docs/adr/0009): o
// padrão é pedir uma folga a mais para trás e deixar as datas fora da janela
// virarem "sem arquivo". Reexecutar é seguro (idempotente por valor, ADR 0008).
//
// Uso:
//   node scripts/backfill-b3-ccm.js                          (padrão: 500 dias para trás)
//   node scripts/backfill-b3-ccm.js --desde=2025-06-01
//   node scripts/backfill-b3-ccm.js --desde=2025-06-01 --ate=2025-12-31

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const b3Collector = require("../src/collectors/b3/b3-ccm.collector");
const { somarDias, paraIso } = require("../src/shared/utils/date-utils");
const logger = require("../src/shared/logger");

const DIAS_PADRAO = 500;
const TIMEOUT_BACKFILL_MS = 60 * 60 * 1000;

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function resolverIntervalo({ desde, ate }, hoje = paraIso(new Date())) {
  return { dataInicial: desde || somarDias(hoje, -DIAS_PADRAO), dataFinal: ate || hoje };
}

async function main() {
  const { dataInicial, dataFinal } = resolverIntervalo(parseArgs());

  const coletorBackfill = {
    ...b3Collector,
    // Um backfill de centenas de pregões (~6 MB cada) não cabe no timeout
    // da coleta diária, e refazê-lo inteiro a cada tentativa seria pior.
    timeoutMs: TIMEOUT_BACKFILL_MS,
    tentativasRetry: 1,
    download: ({ signal }) => b3Collector.downloadIntervalo({ dataInicial, dataFinal, signal })
  };

  logger.info({ dataInicial, dataFinal }, "Iniciando backfill do CCM (B3)");
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
    `Backfill finalizado com status "${execucao.status}"`
  );

  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do CCM");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo };
