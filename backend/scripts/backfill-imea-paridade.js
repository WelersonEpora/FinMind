"use strict";

// Backfill da paridade de exportação do milho do IMEA (tabela diária do Boletim Semanal - Milho, PDF) - roda
// fora da rotina diária (scripts/run-coleta.js). Reaproveita o coletor real
// (collectors/imea/imea-paridade-milho.collector.js), o runner e o log de execução; só troca a fase de download
// para baixar as edições de um intervalo de datas em vez das 2 últimas. ADR 0057.
//
// Início padrão: 2021-06-07 (a 1ª edição com a tabela diária). ~260 edições, um PDF cada (~300 KB) com 1 s de
// pausa: ~6 min. UMA execução só, sem blocos: o defeito da semana repetida (ADR 0057) é detectado comparando cada
// edição com a anterior, e um corte de bloco esconderia a anterior. Uma falha de rede perde a execução inteira:
// repita com --dataInicial a partir da edição que faltou.
//
// Rode uma vez por ambiente novo, ANTES da coleta diária (que exige a carga histórica feita).
//
// Uso:
//   node scripts/backfill-imea-paridade.js
//   node scripts/backfill-imea-paridade.js --dataInicial=2024-01-01 --dataFinal=2024-12-31

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const imeaParidadeCollector = require("../src/collectors/imea/imea-paridade-milho.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 30 * 60 * 1000;

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function resolverIntervalo({ dataInicial, dataFinal }) {
  const inicio = dataInicial || imeaParidadeCollector.DATA_INICIAL;
  for (const data of [inicio, dataFinal].filter(Boolean)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`Data inválida: ${data} (use AAAA-MM-DD).`);
  }
  if (dataFinal && dataFinal < inicio) throw new Error(`Intervalo inválido: ${inicio} a ${dataFinal}.`);
  if (inicio < imeaParidadeCollector.DATA_INICIAL) {
    throw new Error(`Antes de ${imeaParidadeCollector.DATA_INICIAL} o Boletim Semanal não tem a tabela diária com a paridade (ADR 0057).`);
  }
  return { dataInicial: inicio, dataFinal: dataFinal || null };
}

async function main() {
  const { dataInicial, dataFinal } = resolverIntervalo(parseArgs());
  logger.info({ dataInicial, dataFinal }, "Iniciando backfill da paridade de exportação do milho (IMEA)");

  const coletorBackfill = {
    ...imeaParidadeCollector,
    timeoutMs: TIMEOUT_BACKFILL_MS,
    tentativasRetry: 1,
    // A carga histórica NÃO pode ter a trava da coleta diária (que exige a fonte já carregada).
    persist: imeaParidadeCollector.persistirBackfill,
    download: ({ signal }) => imeaParidadeCollector.downloadIntervalo({ dataInicial, dataFinal: dataFinal ?? undefined, signal })
  };

  const execucao = await executarColetor(coletorBackfill, { triggerType: "script" });
  logger.info(
    {
      status: execucao.status,
      registrosLidos: execucao.records_read,
      registrosCriados: execucao.records_created,
      registrosIgnorados: execucao.records_skipped,
      registrosFalha: execucao.records_failed,
      mensagemErro: execucao.error_message
    },
    `Backfill da paridade finalizado com status "${execucao.status}"`
  );
  return execucao.status !== "failed";
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do IMEA (paridade)");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo };
