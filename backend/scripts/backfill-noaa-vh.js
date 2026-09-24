"use strict";

// Backfill da saúde da vegetação por cultura da NOAA STAR (ADR 0025). Roda fora da rotina diária
// (scripts/run-coleta.js), que só relê o ano corrente e o anterior. Reaproveita o coletor real
// (collectors/noaa/noaa-vh.collector.js), o runner e o log de execução; só troca a fase de download para pedir a série
// desde 1981 (o dado começa em 1982): uma requisição por região (~100 KB, ~3 s cada).
//
// Cada semana é uma observação própria, então a ordem de carga não afeta o point-in-time. Reexecutar é seguro
// (idempotente por valor, ADR 0008).
//
// Uso:
//   node scripts/backfill-noaa-vh.js                       (milho, desde 1981)
//   node scripts/backfill-noaa-vh.js --cultura=milho --desde=2010

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const { criarColetorVh, PRIMEIRO_ANO } = require("../src/collectors/noaa/noaa-vh.collector");
const logger = require("../src/shared/logger");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function resolverOpcoes({ cultura = "milho", desde } = {}) {
  const anoInicial = desde ? Number(desde) : PRIMEIRO_ANO;
  const anoFinal = new Date().getUTCFullYear();
  if (!Number.isInteger(anoInicial) || anoInicial < PRIMEIRO_ANO || anoInicial > anoFinal) {
    throw new Error(`--desde deve ser um ano entre ${PRIMEIRO_ANO} e ${anoFinal}.`);
  }
  return { cultura, anoInicial, anoFinal };
}

async function main() {
  const opcoes = resolverOpcoes(parseArgs());
  const coletor = criarColetorVh(opcoes.cultura);
  logger.info(opcoes, "Iniciando backfill da saúde da vegetação por cultura (NOAA STAR)");

  const execucao = await executarColetor(
    {
      ...coletor,
      timeoutMs: coletor.TIMEOUT_BACKFILL_MS,
      tentativasRetry: 2,
      download: ({ signal }) => coletor.downloadIntervalo({ anoInicial: opcoes.anoInicial, anoFinal: opcoes.anoFinal, signal })
    },
    { triggerType: "script" }
  );

  logger.info(
    {
      ...opcoes,
      status: execucao.status,
      registrosLidos: execucao.records_read,
      registrosCriados: execucao.records_created,
      registrosAtualizados: execucao.records_updated,
      registrosIgnorados: execucao.records_skipped,
      registrosFalha: execucao.records_failed,
      mensagemErro: execucao.error_message
    },
    `Backfill da NOAA VH finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill da NOAA VH");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverOpcoes, parseArgs };
