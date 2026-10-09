"use strict";

// Backfill do fluxo cambial contratado (BCB, SGS 13961 a 13970, diário; fase 1 do dólar, ADR 0125). Roda fora da rotina
// diária (scripts/run-coleta.js). Reaproveita o coletor real (collectors/bcb/bcb-fluxo-cambial.collector.js), o runner
// e o log de execução; só troca a fase de download para pedir a série inteira em vez dos últimos 75 dias.
//
// As séries começam em 2008-09-01. O SGS aceita no máximo 10 anos por pedido: o coletor divide em janelas (2 pedidos
// por série, 20 no total, cada um com até 3 tentativas). Reexecutar é seguro (idempotente por valor, ADR 0008).
//
// Uso:
//   node scripts/backfill-bcb-fluxo-cambial.js                          (desde 2008-09-01)
//   node scripts/backfill-bcb-fluxo-cambial.js --desde=2020-01-01 --ate=2020-12-31

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/bcb/bcb-fluxo-cambial.collector");
const logger = require("../src/shared/logger");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function resolverIntervalo({ desde, ate }) {
  const dataInicial = !desde || desde < coletor.PRIMEIRA_DATA ? coletor.PRIMEIRA_DATA : desde;
  if (ate && dataInicial > ate) throw new Error(`Intervalo vazio: ${dataInicial} > ${ate}.`);
  return ate ? { dataInicial, dataFinal: ate } : { dataInicial };
}

async function main() {
  const intervalo = resolverIntervalo(parseArgs());
  logger.info(intervalo, "Iniciando backfill do fluxo cambial contratado (BCB, SGS 13961 a 13970)");

  const execucao = await executarColetor(
    {
      ...coletor,
      timeoutMs: coletor.TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      download: ({ signal }) => coletor.downloadIntervalo({ ...intervalo, signal })
    },
    { triggerType: "script" }
  );

  logger.info(
    {
      ...intervalo,
      status: execucao.status,
      registrosLidos: execucao.records_read,
      registrosCriados: execucao.records_created,
      registrosAtualizados: execucao.records_updated,
      registrosIgnorados: execucao.records_skipped,
      registrosFalha: execucao.records_failed,
      mensagemErro: execucao.error_message
    },
    `Backfill do fluxo cambial contratado finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do fluxo cambial contratado");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs };
