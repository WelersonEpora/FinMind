"use strict";

// Backfill de um futuro pelo Yahoo - o Brent da NYMEX (BZ, ADR 0096) ou o café arábica da ICE (KC, ADR 0129) - que roda
// fora da rotina diária (scripts/run-coleta.js). Reaproveita o coletor real (collectors/yahoo/yahoo-futuro.collector.js),
// o runner e o log de execução; só troca a fase de download para pedir o histórico inteiro de cada símbolo em vez do
// último mês.
//
// O que vem: os vencimentos ainda em negociação, cada um desde a listagem, e a série contínua do 1º vencimento (BZ=F
// desde 2007-07-30; KC=F desde 2000-01-03). Os vencimentos que já saíram não existem mais no Yahoo: deles só fica a
// contínua. Brent: 14 pedidos; KC: 9. Alguns segundos. Cada dia é uma observação própria, então a ordem de carga não
// afeta o point-in-time. Reexecutar é seguro (idempotente por valor, ADR 0008).
//
// Uso (`--produto` obrigatório: brent ou kc; npm run backfill:yahoo-brent / backfill:yahoo-kc):
//   node scripts/backfill-yahoo-futuro.js --produto=kc

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const { criarColetorFuturoYahoo, PRODUTOS } = require("../src/collectors/yahoo/yahoo-futuro.collector");
const logger = require("../src/shared/logger");

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const { produto } = parseArgs();
  if (!PRODUTOS[produto]) {
    throw new Error(`Informe --produto=<${Object.keys(PRODUTOS).join("|")}>.`);
  }
  const coletor = criarColetorFuturoYahoo(produto);
  logger.info({ produto }, `Iniciando backfill do futuro ${PRODUTOS[produto].nome} (Yahoo)`);

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
    `Backfill do futuro ${PRODUTOS[produto].nome} (Yahoo) finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill de futuro do Yahoo");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}
