"use strict";

// Backfill do HISTÓRICO do futuro de milho da B3 (CCM) a partir do Boletim Diário de Informações (BDI)
// em PDF - ADR 0020. Complementa o `backfill-b3-ccm.js` (CSV do Up2Data, só ~15 meses): grava nas
// mesmas séries `B3.CCM.<TICKER>.<CAMPO>`, sem regravar o que já existe, e acrescenta OPEN e
// OPEN_INTEREST. Reaproveita o runner e o log de execução (collection_execution, coletor `b3-ccm-bdi`).
//
// Padrão: o período inteiro em que o BDI tem a tabela por vencimento (2022-03-01 a 2025-12-11; o 1º
// boletim com a tabela é 2022-03-21). ~940 PDFs de ~500 KB, 10-20 min. Reexecutar é seguro: o que já
// está no banco é ignorado (idempotente).
//
// Uso:
//   node scripts/backfill-b3-ccm-bdi.js
//   node scripts/backfill-b3-ccm-bdi.js --desde=2023-01-02 --ate=2023-01-31   (teste com poucos boletins)

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const bdiCollector = require("../src/collectors/b3/b3-ccm-bdi.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 3 * 60 * 60 * 1000;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

// Limita o pedido ao período em que o BDI tem a tabela (fora dele só haveria "sem tabela").
function resolverIntervalo({ desde, ate } = {}) {
  const dataInicial = desde && desde > bdiCollector.PRIMEIRA_DATA ? desde : bdiCollector.PRIMEIRA_DATA;
  const dataFinal = ate && ate < bdiCollector.ULTIMA_DATA_LAYOUT_ANTIGO ? ate : bdiCollector.ULTIMA_DATA_LAYOUT_ANTIGO;
  if (dataInicial > dataFinal) {
    throw new Error(`Intervalo vazio: o BDI só tem a tabela do CCM de ${bdiCollector.PRIMEIRA_DATA} a ${bdiCollector.ULTIMA_DATA_LAYOUT_ANTIGO}.`);
  }
  return { dataInicial, dataFinal };
}

async function main() {
  const { dataInicial, dataFinal } = resolverIntervalo(parseArgs());
  let resumo = null;

  const coletorBackfill = {
    ...bdiCollector,
    timeoutMs: TIMEOUT_BACKFILL_MS,
    tentativasRetry: 1,
    download: async ({ signal }) => {
      const dias = await bdiCollector.downloadIntervalo({ dataInicial, dataFinal, signal });
      resumo = bdiCollector.resumirDias(dias);
      return dias;
    }
  };

  logger.info({ dataInicial, dataFinal }, "Iniciando backfill do CCM (B3) via Boletim Diário (BDI)");
  const execucao = await executarColetor(coletorBackfill, { triggerType: "script" });

  if (resumo) {
    logger.info(
      {
        diasUteis: resumo.diasUteis,
        boletinsComTabela: resumo.comTabela,
        primeiroComTabela: resumo.primeiroComTabela,
        ultimoComTabela: resumo.ultimoComTabela,
        formatosNumericos: resumo.formatos,
        feriadosSemBoletim: resumo.semBoletim.length,
        boletinsSemTabela: resumo.semTabela,
        erros: resumo.erros
      },
      "Cobertura do BDI no intervalo"
    );
  }
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
      logger.error({ err }, "Falha inesperada no backfill do CCM via BDI");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs };
