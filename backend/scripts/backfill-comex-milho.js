"use strict";

// Backfill da exportação de milho do Comex Stat (MDIC) - roda fora da rotina
// diária (scripts/run-coleta.js). Reaproveita o coletor real
// (collectors/comex/comex-milho-exportacao.collector.js), o runner e o log de
// execução; só troca a fase de download para pedir um intervalo de anos.
//
// Início padrão: 2005, o primeiro ano com dado validado para o NCM 10059010
// (ADR 0013). Antes disso o código NCM muda e exige mapeamento por período - não
// está feito. Uma chamada por ano com pausa de 13 s (rate limit da fonte):
// 2005 até hoje leva ~5 minutos. O intervalo é dividido em BLOCOS de 5 anos, um
// por execução (collection_execution): o rate limit da fonte derrubou uma
// tentativa única em 2021 e perdeu os 16 anos já baixados, porque o download é
// atômico. Com blocos, uma falha só perde o bloco. Reexecutar é seguro
// (idempotente por valor, ADR 0008).
//
// Uso:
//   node scripts/backfill-comex-milho.js                              (2005 até o ano corrente)
//   node scripts/backfill-comex-milho.js --anoInicial=2020
//   node scripts/backfill-comex-milho.js --anoInicial=2020 --anoFinal=2022

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const comexCollector = require("../src/collectors/comex/comex-milho-exportacao.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 60 * 60 * 1000;
const ANOS_POR_BLOCO = 5;

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function resolverAnos({ anoInicial, anoFinal }, anoAtual = new Date().getUTCFullYear()) {
  const inicio = Number(anoInicial || comexCollector.ANO_INICIAL);
  const fim = Number(anoFinal || anoAtual);
  if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio > fim) {
    throw new Error(`Intervalo de anos inválido: ${anoInicial} a ${anoFinal}.`);
  }
  if (inicio < comexCollector.ANO_INICIAL) {
    throw new Error(`Antes de ${comexCollector.ANO_INICIAL} o NCM do milho não está validado (ADR 0013).`);
  }
  return { anoInicial: inicio, anoFinal: fim };
}

// Divide [anoInicial, anoFinal] em blocos consecutivos de até 5 anos.
function dividirEmBlocos(anoInicial, anoFinal) {
  const blocos = [];
  for (let inicio = anoInicial; inicio <= anoFinal; inicio += ANOS_POR_BLOCO) {
    blocos.push({ anoInicial: inicio, anoFinal: Math.min(inicio + ANOS_POR_BLOCO - 1, anoFinal) });
  }
  return blocos;
}

async function main() {
  const { anoInicial, anoFinal } = resolverAnos(parseArgs());
  const blocos = dividirEmBlocos(anoInicial, anoFinal);
  const falhas = [];

  logger.info({ anoInicial, anoFinal, blocos: blocos.length }, "Iniciando backfill da exportação de milho (Comex Stat)");

  for (const bloco of blocos) {
    const coletorBackfill = {
      ...comexCollector,
      // Um ano por chamada, 13 s de pausa. Não cabe no timeout da coleta diária.
      timeoutMs: TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      download: ({ signal }) => comexCollector.downloadIntervalo({ ...bloco, signal })
    };

    const execucao = await executarColetor(coletorBackfill, { triggerType: "script" });

    logger.info(
      {
        ...bloco,
        status: execucao.status,
        registrosLidos: execucao.records_read,
        registrosCriados: execucao.records_created,
        registrosAtualizados: execucao.records_updated,
        registrosIgnorados: execucao.records_skipped,
        registrosFalha: execucao.records_failed,
        mensagemErro: execucao.error_message
      },
      `Backfill ${bloco.anoInicial}-${bloco.anoFinal} finalizado com status "${execucao.status}"`
    );

    if (execucao.status === "failed") falhas.push(bloco);
  }

  if (falhas.length > 0) {
    logger.error(
      { falhas },
      "Blocos com falha - repita só eles: npm run backfill:comex-milho -- --anoInicial=<ano> --anoFinal=<ano>"
    );
  }
  return falhas.length === 0;
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do Comex Stat");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverAnos, dividirEmBlocos };
