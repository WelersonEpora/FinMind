"use strict";

// Backfill das reservas internacionais brasileiras (BCB, SGS 13621 - total, diária; ADR 0023). Roda fora da rotina
// diária (scripts/run-coleta.js). Reaproveita o coletor real (collectors/bcb/bcb-reservas.collector.js), o runner e o
// log de execução; só troca a fase de download para pedir a série inteira em vez dos 10 últimos pontos.
//
// A série começa em 1998-09-01. O SGS aceita no máximo 10 anos por pedido: o coletor divide em janelas (3 pedidos,
// cada um com até 3 tentativas) e junta tudo numa execução só - a data de publicação de um ponto é a data do ponto
// seguinte, inclusive na virada de janela. Cada dia é uma observação própria, então a ordem de carga não afeta o
// point-in-time. Reexecutar é seguro (idempotente por valor, ADR 0008).
//
// Uso:
//   node scripts/backfill-bcb-reservas.js                          (desde 1998-09-01)
//   node scripts/backfill-bcb-reservas.js --desde=2020-01-01 --ate=2020-12-31

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/bcb/bcb-reservas.collector");
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
  logger.info(intervalo, "Iniciando backfill das reservas internacionais (BCB, SGS 13621)");

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
    `Backfill das reservas internacionais finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill das reservas internacionais");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs };
