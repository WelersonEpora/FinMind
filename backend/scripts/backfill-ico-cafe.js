"use strict";

// Backfill do Coffee Market Report da ICO (preços por grupo e estoques certificados, ADR 0061): os relatórios
// mensais de out/2012 (o 1º no site) até o mês passado (~165 PDFs, 2 s entre eles: ~8 min). Reaproveita o coletor
// real (collectors/ico/ico-cafe.collector.js), o runner e o log de execução; troca o download (todos os meses) e a
// persistência (sem a trava da coleta diária). Uma execução só.
//
// ORDEM DE CARGA: rode ANTES da coleta diária num banco novo. A coleta diária lê só os meses recentes e se recusa a
// gravar séries ainda sem carga histórica (os meses antigos não poderiam mais ser inseridos: append-only).
// Reexecutar é seguro: os relatórios já ingeridos são descartados.
//
// Uso:
//   node scripts/backfill-ico-cafe.js
//   node scripts/backfill-ico-cafe.js --desde=2020-01 --ate=2020-12

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/ico/ico-cafe.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 60 * 60 * 1000;
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

// Padrão: do 1º relatório (2012-10) ao mês anterior a `hoje`.
function resolverIntervalo({ desde, ate }, hoje = new Date()) {
  const anterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const mesInicial = desde || coletor.PRIMEIRO_MES;
  const mesFinal = ate || anterior;
  for (const mes of [mesInicial, mesFinal]) if (!RE_MES.test(mes)) throw new Error(`Mês inválido: "${mes}" (use AAAA-MM).`);
  if (mesInicial > mesFinal) throw new Error(`Intervalo vazio: ${mesInicial} > ${mesFinal}.`);
  return { mesInicial: mesInicial < coletor.PRIMEIRO_MES ? coletor.PRIMEIRO_MES : mesInicial, mesFinal };
}

async function main() {
  const intervalo = resolverIntervalo(parseArgs());
  logger.info(intervalo, "Iniciando backfill do Coffee Market Report da ICO");

  let bruto = null;
  const execucao = await executarColetor(
    {
      ...coletor,
      timeoutMs: TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      persist: coletor.persistirBackfill,
      download: async ({ signal }) => {
        bruto = await coletor.downloadIntervalo({ ...intervalo, signal });
        return bruto;
      }
    },
    { triggerType: "script" }
  );

  logger.info(
    {
      status: execucao.status,
      relatorios: bruto?.relatorios?.length ?? 0,
      naoPublicados: bruto?.naoPublicados ?? [],
      registrosCriados: execucao.records_created,
      registrosAtualizados: execucao.records_updated,
      registrosIgnorados: execucao.records_skipped,
      registrosFalha: execucao.records_failed,
      mensagemErro: execucao.error_message
    },
    `Backfill da ICO finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill da ICO");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs };
