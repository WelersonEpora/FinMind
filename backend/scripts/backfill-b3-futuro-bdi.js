"use strict";

// Backfill do HISTÓRICO de um futuro agrícola da B3 - milho (CCM, ADR 0020) ou café arábica (ICF,
// ADR 0028) - a partir do Boletim Diário de Informações (BDI) em PDF. Complementa o
// `backfill-b3-futuro.js` (CSV do Up2Data, só ~15 meses): grava nas mesmas séries
// `<prefixo>.<TICKER>.<CAMPO>`, sem regravar o que já existe, e acrescenta OPEN e OPEN_INTEREST.
// Reaproveita o runner e o log de execução (collection_execution, coletor `b3-ccm-bdi`/`b3-icf-bdi`).
//
// Padrão: o período inteiro em que o BDI tem a tabela por vencimento (2022-03-01 a 2025-12-11; o 1º
// boletim com a tabela é 2022-03-21). ~940 PDFs de ~500 KB, 10-20 min. Reexecutar é seguro: o que já
// está no banco é ignorado (idempotente).
//
// Uso (`--produto` obrigatório: ccm, icf ou sjc; npm run backfill:b3-ccm-bdi / backfill:b3-icf-bdi / backfill:b3-sjc-bdi):
//   node scripts/backfill-b3-futuro-bdi.js --produto=icf
//   node scripts/backfill-b3-futuro-bdi.js --produto=icf --desde=2023-01-02 --ate=2023-01-31   (teste com poucos boletins)

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const bdi = require("../src/collectors/b3/b3-futuro-bdi.collector");
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
  const dataInicial = desde && desde > bdi.PRIMEIRA_DATA ? desde : bdi.PRIMEIRA_DATA;
  const dataFinal = ate && ate < bdi.ULTIMA_DATA_LAYOUT_ANTIGO ? ate : bdi.ULTIMA_DATA_LAYOUT_ANTIGO;
  if (dataInicial > dataFinal) {
    throw new Error(`Intervalo vazio: o BDI só tem a tabela por vencimento de ${bdi.PRIMEIRA_DATA} a ${bdi.ULTIMA_DATA_LAYOUT_ANTIGO}.`);
  }
  return { dataInicial, dataFinal };
}

async function main() {
  const args = parseArgs();
  const bdiCollector = bdi.criarColetorFuturoBdi(args.produto);
  const { dataInicial, dataFinal } = resolverIntervalo(args);
  let resumo = null;

  const coletorBackfill = {
    ...bdiCollector,
    timeoutMs: TIMEOUT_BACKFILL_MS,
    tentativasRetry: 1,
    download: async ({ signal }) => {
      const dias = await bdiCollector.downloadIntervalo({ dataInicial, dataFinal, signal });
      resumo = bdi.resumirDias(dias);
      return dias;
    }
  };

  logger.info({ produto: args.produto, dataInicial, dataFinal }, `Iniciando backfill do futuro da B3 via Boletim Diário (${bdiCollector.codigo})`);
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
      logger.error({ err }, "Falha inesperada no backfill do futuro da B3 via BDI");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs };
