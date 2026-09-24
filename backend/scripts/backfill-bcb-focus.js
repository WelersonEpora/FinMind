"use strict";

// Backfill das expectativas do Focus (BCB) - IPCA, Selic e câmbio por ano-calendário (ADR 0022). Roda fora da
// rotina diária (scripts/run-coleta.js). Reaproveita o coletor real (collectors/bcb/bcb-focus.collector.js), o runner
// e o log de execução; só troca a fase de download para pedir a série inteira em vez das últimas 5 semanas.
//
// A série inteira de cada indicador vem numa requisição só (~3 s): uma execução basta. Início padrão: 2000-01-03, a
// 1ª pesquisa na API. Cada boletim é uma observação própria (observed_at = data da pesquisa), então a ordem de carga
// não afeta o point-in-time: rodar antes ou depois da coleta diária dá o mesmo resultado. Reexecutar é seguro
// (idempotente por valor, ADR 0008).
//
// Uso:
//   node scripts/backfill-bcb-focus.js                          (desde 2000-01-03)
//   node scripts/backfill-bcb-focus.js --desde=2020-01-01 --ate=2020-12-31

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/bcb/bcb-focus.collector");
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
  return { dataInicial, dataFinal: ate || undefined };
}

async function main() {
  const intervalo = resolverIntervalo(parseArgs());
  logger.info(intervalo, "Iniciando backfill das expectativas do Focus (BCB)");

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
    `Backfill do Focus finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do Focus");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs };
