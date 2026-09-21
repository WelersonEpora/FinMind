"use strict";

// Backfill do balanço do milho do WASDE (USDA/ESMIS) - roda fora da rotina diária
// (scripts/run-coleta.js). Reaproveita o coletor real (collectors/wasde/wasde-milho.collector.js),
// o runner e o log de execução; só troca a fase de download para baixar as edições de um
// intervalo de datas em vez das 3 últimas. ADR 0015.
//
// Início padrão: 2011-01-01. É onde o layout do XLS foi validado (2011 a 2026, todas as edições
// lidas sem erro); antes disso o ESMIS só tem PDF/TXT, que exigem outro leitor (não feito).
// Cada edição é um download de ~340 KB com 1 s de pausa (a política de uso do ESMIS não foi
// confirmada): 2011 até hoje são ~190 edições, ~5 minutos. O intervalo é dividido em BLOCOS de
// 5 anos, uma execução por bloco (collection_execution), como no backfill do Comex: uma falha
// de rede só perde o bloco, e ele pode ser repetido isoladamente. Reexecutar é seguro
// (idempotente por valor, ADR 0008): o serviço só grava o que mudou.
//
// Uso:
//   node scripts/backfill-wasde-milho.js                                   (2011 até hoje)
//   node scripts/backfill-wasde-milho.js --anoInicial=2020
//   node scripts/backfill-wasde-milho.js --anoInicial=2020 --anoFinal=2022

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const wasdeCollector = require("../src/collectors/wasde/wasde-milho.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 60 * 60 * 1000;
const ANOS_POR_BLOCO = 5;
const ANO_MINIMO = Number(wasdeCollector.DATA_INICIAL.slice(0, 4));

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function resolverAnos({ anoInicial, anoFinal }, anoAtual = new Date().getUTCFullYear()) {
  const inicio = Number(anoInicial || ANO_MINIMO);
  const fim = Number(anoFinal || anoAtual);
  if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio > fim) {
    throw new Error(`Intervalo de anos inválido: ${anoInicial} a ${anoFinal}.`);
  }
  if (inicio < ANO_MINIMO) {
    throw new Error(`Antes de ${ANO_MINIMO} o ESMIS só tem PDF/TXT, sem leitor implementado (ADR 0015).`);
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

  logger.info({ anoInicial, anoFinal, blocos: blocos.length }, "Iniciando backfill do balanço do milho (WASDE/ESMIS)");

  for (const bloco of blocos) {
    const coletorBackfill = {
      ...wasdeCollector,
      // Dezenas de downloads com pausa: não cabe no timeout da coleta diária.
      timeoutMs: TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      // A carga histórica NÃO pode ter a trava da coleta diária (que exige a fonte já carregada).
      persist: wasdeCollector.persistirBackfill,
      download: ({ signal }) =>
        wasdeCollector.downloadIntervalo({ dataInicial: `${bloco.anoInicial}-01-01`, dataFinal: `${bloco.anoFinal}-12-31`, signal })
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
      "Blocos com falha - repita só eles: npm run backfill:wasde-milho -- --anoInicial=<ano> --anoFinal=<ano>"
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
      logger.error({ err }, "Falha inesperada no backfill do WASDE");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverAnos, dividirEmBlocos };
