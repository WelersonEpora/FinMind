"use strict";

// Backfill do histórico da cotação do dólar (BCB SGS série 1) - roda fora
// da rotina diária (scripts/run-coleta.js), só quando é preciso preencher
// de uma vez um intervalo de datas (ex.: primeira carga do banco). Reaproveita
// parse/normalize/persist do coletor real (bcb-usd-brl.collector.js) e o
// mesmo runner (collector-runner.js) - só troca a fase de download pra
// pedir um intervalo de datas em vez dos "últimos N" pontos. A execução
// gerada fica registrada em collection_execution como qualquer outra
// coleta (ver docs/adr/0002-arquitetura-coletores.md).
//
// Uso:
//   node scripts/backfill-dolar.js               (últimos 60 dias, padrão)
//   node scripts/backfill-dolar.js --dias=90
//   node scripts/backfill-dolar.js --dataInicial=01/06/2026 --dataFinal=31/07/2026
//
// A API do BCB rejeita (HTTP 406) intervalos maiores que ~10 anos - sem
// necessidade real de dividir em blocos pra um backfill de poucos meses.

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const bcbCollector = require("../src/collectors/bcb/bcb-usd-brl.collector");
const logger = require("../src/shared/logger");

const DIAS_PADRAO = 60;

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function paraDataBr(data) {
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getUTCFullYear()}`;
}

function resolverIntervalo({ dias, dataInicial, dataFinal }) {
  if (dataInicial) {
    return { dataInicial, dataFinal: dataFinal || paraDataBr(new Date()) };
  }

  const inicio = new Date();
  inicio.setUTCDate(inicio.getUTCDate() - Number(dias || DIAS_PADRAO));
  return { dataInicial: paraDataBr(inicio), dataFinal: paraDataBr(new Date()) };
}

async function main() {
  const { dataInicial, dataFinal } = resolverIntervalo(parseArgs());

  const coletorBackfill = {
    ...bcbCollector,
    download: ({ signal }) => bcbCollector.downloadIntervalo({ dataInicial, dataFinal, signal })
  };

  logger.info({ dataInicial, dataFinal }, "Iniciando backfill da cotação do dólar");
  const execucao = await executarColetor(coletorBackfill, { triggerType: "script" });

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
      logger.error({ err }, "Falha inesperada no backfill");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, paraDataBr };
