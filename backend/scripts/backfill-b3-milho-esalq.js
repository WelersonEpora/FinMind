"use strict";

// Backfill do Indicador do Milho CEPEA/ESALQ pelo arquivo `Indic` da B3 (ADR 0021) - roda fora da
// rotina diária (scripts/run-coleta.js). Reaproveita o coletor real
// (collectors/b3/b3-milho-esalq.collector.js), o runner e o log de execução; só troca a fase de
// download para pedir um intervalo longo de pregões (~100 KB e ~20-30 s cada; ~2 h no total, em blocos de um ano).
//
// O milho só aparece no arquivo a partir de 2018-06-08: é o início padrão (e o limite inferior).
// Reexecutar é seguro (idempotente por valor, ADR 0008).
//
// Uso:
//   node scripts/backfill-b3-milho-esalq.js                          (padrão: 2018-06-08 até hoje)
//   node scripts/backfill-b3-milho-esalq.js --desde=2024-01-01
//   node scripts/backfill-b3-milho-esalq.js --desde=2024-01-01 --ate=2024-12-31

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/b3/b3-milho-esalq.collector");
const { paraIso } = require("../src/shared/utils/date-utils");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 60 * 60 * 1000; // por bloco de um ano
// A B3 leva ~20-30 s por arquivo, fixo (ver o coletor): com 10 simultâneos, ~10-15 min por ano.
const CONCORRENCIA_BACKFILL = 10;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function resolverIntervalo({ desde, ate }, hoje = paraIso(new Date())) {
  const dataInicial = !desde || desde < coletor.PRIMEIRA_DATA ? coletor.PRIMEIRA_DATA : desde;
  const dataFinal = ate || hoje;
  if (dataInicial > dataFinal) throw new Error(`Intervalo vazio: ${dataInicial} > ${dataFinal}.`);
  return { dataInicial, dataFinal };
}

// Divide o intervalo em blocos de um ano civil, do MAIS RECENTE para o mais antigo: cada bloco é uma
// execução (collection_execution) e grava ao terminar (~10 min cada) - o dado aparece na tela aos
// poucos, começando pelo período que o gráfico abre, e uma falha só perde o bloco (repetível com
// --desde/--ate). A série não revisa (ADR 0021), então a ordem de carga não afeta o point-in-time.
function dividirPorAno({ dataInicial, dataFinal }) {
  const blocos = [];
  for (let ano = Number(dataFinal.slice(0, 4)); ano >= Number(dataInicial.slice(0, 4)); ano -= 1) {
    blocos.push({
      dataInicial: `${ano}-01-01` < dataInicial ? dataInicial : `${ano}-01-01`,
      dataFinal: `${ano}-12-31` > dataFinal ? dataFinal : `${ano}-12-31`
    });
  }
  return blocos;
}

async function main() {
  const intervalo = resolverIntervalo(parseArgs());
  const blocos = dividirPorAno(intervalo);
  const falhas = [];

  logger.info({ ...intervalo, blocos: blocos.length }, "Iniciando backfill do Indicador do Milho CEPEA/ESALQ (B3)");

  for (const bloco of blocos) {
    const coletorBackfill = {
      ...coletor,
      // ~260 pregões por bloco não cabem no timeout da coleta diária, e refazê-lo inteiro a cada tentativa seria pior.
      timeoutMs: TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      download: ({ signal }) => coletor.downloadIntervalo({ ...bloco, signal, concorrencia: CONCORRENCIA_BACKFILL })
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
      `Backfill ${bloco.dataInicial} a ${bloco.dataFinal} finalizado com status "${execucao.status}"`
    );

    if (execucao.status === "failed") falhas.push(bloco);
  }

  if (falhas.length > 0) {
    logger.error({ falhas }, "Blocos com falha - repita só eles: npm run backfill:b3-milho-esalq -- --desde=<data> --ate=<data>");
  }
  return falhas.length === 0;
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill do Indicador do Milho CEPEA/ESALQ");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs, dividirPorAno };
