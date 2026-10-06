"use strict";

// Backfill do Short-Term Energy Outlook da EIA (produção da OPEP e da OPEP+ por país e capacidade ociosa da OPEP, ADR
// 0091): as edições mensais de jan/2008 até a do mês corrente (~225 planilhas, ~10 s cada no servidor da EIA, mais 2 s
// de pausa: ~45 min). Reaproveita o coletor real (collectors/eia/eia-steo.collector.js), o runner e o log de execução;
// troca o download (todas as edições) e a persistência (sem a trava da coleta diária). Uma execução só.
//
// ORDEM DE CARGA: rode ANTES da coleta diária num banco novo. A coleta diária lê só as edições recentes e se recusa a
// gravar séries ainda sem carga histórica (as edições antigas não poderiam mais ser inseridas: append-only).
// Reexecutar é seguro: as edições já ingeridas são descartadas.
//
// Uso:
//   node scripts/backfill-eia-steo.js
//   node scripts/backfill-eia-steo.js --desde=2020-01 --ate=2020-12

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/eia/eia-steo.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 2 * 60 * 60 * 1000;
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

// Padrão: da 1ª edição lida (2008-01) à do mês de `hoje`.
function resolverIntervalo({ desde, ate }, hoje = new Date()) {
  const edicaoInicial = desde || coletor.PRIMEIRA_EDICAO;
  const edicaoFinal = ate || hoje.toISOString().slice(0, 7);
  for (const mes of [edicaoInicial, edicaoFinal]) if (!RE_MES.test(mes)) throw new Error(`Mês inválido: "${mes}" (use AAAA-MM).`);
  if (edicaoInicial > edicaoFinal) throw new Error(`Intervalo vazio: ${edicaoInicial} > ${edicaoFinal}.`);
  return { edicaoInicial: edicaoInicial < coletor.PRIMEIRA_EDICAO ? coletor.PRIMEIRA_EDICAO : edicaoInicial, edicaoFinal };
}

async function main() {
  const intervalo = resolverIntervalo(parseArgs());
  logger.info(intervalo, "Iniciando backfill do STEO da EIA");

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
      edicoes: bruto?.edicoes?.length ?? 0,
      naoPublicadas: bruto?.naoPublicadas ?? [],
      registrosCriados: execucao.records_created,
      registrosAtualizados: execucao.records_updated,
      registrosIgnorados: execucao.records_skipped,
      registrosFalha: execucao.records_failed,
      mensagemErro: execucao.error_message
    },
    `Backfill do STEO finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do STEO");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs };
