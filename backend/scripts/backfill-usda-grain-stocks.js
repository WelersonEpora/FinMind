"use strict";

// Backfill do Grain Stocks: estoques trimestrais de milho ou de soja (`--cultura`, padrão milho; a soja é a fase 1,
// ADR 0113) dos EUA (USDA NASS, pelo ESMIS) - roda
// fora da rotina diária (scripts/run-coleta.js). Reaproveita o coletor real
// (collectors/usda/usda-grain-stocks.collector.js), o runner e o log de execução; só troca a fase de
// download para baixar TODAS as edições com CSV em vez da mais recente. ADR 0035.
//
// Em banco novo, rode ANTES da coleta diária: a diária se recusa a gravar enquanto a série estiver vazia
// (senão o vintage começaria na edição mais recente e as antigas não entrariam mais).
//
// São ~103 edições (desde 2001-06-29), um ZIP pequeno cada, com 1 s de pausa (a política de uso do ESMIS não
// foi confirmada): ~3 minutos, UMA execução. Reexecutar é seguro
// (idempotente por valor, ADR 0008): o serviço só grava o que mudou.
//
// Uso (pelo npm: `backfill:usda-grain-stocks` e `backfill:usda-grain-stocks-soja`):
//   node scripts/backfill-usda-grain-stocks.js                      (milho, desde 2001-06, o início do CSV)
//   node scripts/backfill-usda-grain-stocks.js --cultura=soja
//   node scripts/backfill-usda-grain-stocks.js --dataInicial=2015-01-01

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const grainStocks = require("../src/collectors/usda/usda-grain-stocks.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 20 * 60 * 1000;

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function resolverDataInicial({ dataInicial }) {
  const data = dataInicial || grainStocks.DATA_INICIAL;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`Data inicial inválida: ${data} (use AAAA-MM-DD).`);
  if (data < grainStocks.DATA_INICIAL) {
    throw new Error(`Antes de ${grainStocks.DATA_INICIAL} o ESMIS só tem TXT/PDF, sem leitor implementado (ADR 0035).`);
  }
  return data;
}

async function main() {
  const args = parseArgs();
  const dataInicial = resolverDataInicial(args);
  const cultura = args.cultura || "milho";
  const coletor = grainStocks.criarColetorGrainStocks(cultura);
  logger.info({ cultura, dataInicial }, `Iniciando backfill do Grain Stocks (USDA/ESMIS, ${cultura})`);

  const execucao = await executarColetor(
    {
      ...coletor,
      // Dezenas de downloads com pausa: não cabe no timeout da coleta diária.
      timeoutMs: TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      // A carga histórica NÃO pode ter a trava da coleta diária (que exige a série já carregada).
      persist: coletor.persistirBackfill,
      download: ({ signal }) => coletor.downloadIntervalo({ dataInicial, signal })
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
    `Backfill do Grain Stocks finalizado com status "${execucao.status}"`
  );
  return execucao.status === "success";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do Grain Stocks (USDA)");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverDataInicial };
