"use strict";

// Backfill do balanço de oferta e demanda do milho do IMEA (PDF mensal, catálogo de arquivos do
// site) - roda fora da rotina diária (scripts/run-coleta.js). Reaproveita o coletor real
// (collectors/imea/imea-oferta-demanda-milho.collector.js), o runner e o log de execução; só troca
// a fase de download para baixar as edições de um intervalo de datas em vez das 2 últimas. ADR 0019.
//
// Início padrão: 2014-04-14 (a mais antiga do catálogo). Cada edição é um download de PDF (~250-750
// KB) com 1 s de pausa entre elas (política de uso da fonte não confirmada): ~77 edições, ~2 min no
// total. O intervalo é dividido em BLOCOS de 5 anos, uma execução por bloco (collection_execution),
// como no backfill do WASDE: uma falha de rede só perde o bloco, e ele pode ser repetido
// isoladamente.
//
// REPETIR O BACKFILL INTEIRO (não a coleta diária) depois que ele já terminou em "success" pode
// logar falhas espúrias, sem corromper dado (achado real, ADR 0019, seção "reexecução"): edições
// onde uma série repetiu o mesmo valor da anterior não geram linha própria (comportamento correto do
// serviço point-in-time) e por isso não são reconhecidas como "já processadas" numa 2ª rodada; se a
// série já avançou desde então, o reenvio esbarra na trava de ordem (que recusa a escrita, não grava
// errado). Rode este script uma vez por ambiente novo, antes da coleta diária; não é preciso repetir.
//
// Uso:
//   node scripts/backfill-imea-oferta-demanda.js                            (2014 até hoje)
//   node scripts/backfill-imea-oferta-demanda.js --anoInicial=2020
//   node scripts/backfill-imea-oferta-demanda.js --anoInicial=2020 --anoFinal=2022

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const imeaOfertaDemandaCollector = require("../src/collectors/imea/imea-oferta-demanda-milho.collector");
const logger = require("../src/shared/logger");

const TIMEOUT_BACKFILL_MS = 30 * 60 * 1000;
const ANOS_POR_BLOCO = 5;
const ANO_MINIMO = Number(imeaOfertaDemandaCollector.DATA_INICIAL.slice(0, 4));

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
    throw new Error(`Antes de ${ANO_MINIMO} o catálogo do IMEA não tem "Oferta e Demanda - Milho" (ADR 0019).`);
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

  logger.info({ anoInicial, anoFinal, blocos: blocos.length }, "Iniciando backfill do balanço de oferta e demanda do milho (IMEA)");

  for (const bloco of blocos) {
    const coletorBackfill = {
      ...imeaOfertaDemandaCollector,
      // Dezenas de downloads com pausa: não cabe no timeout da coleta diária.
      timeoutMs: TIMEOUT_BACKFILL_MS,
      tentativasRetry: 1,
      // A carga histórica NÃO pode ter a trava da coleta diária (que exige a fonte já carregada).
      persist: imeaOfertaDemandaCollector.persistirBackfill,
      download: ({ signal }) =>
        imeaOfertaDemandaCollector.downloadIntervalo({ dataInicial: `${bloco.anoInicial}-01-01`, dataFinal: `${bloco.anoFinal}-12-31`, signal })
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
      "Blocos com falha - repita só eles: npm run backfill:imea-oferta-demanda -- --anoInicial=<ano> --anoFinal=<ano>"
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
      logger.error({ err }, "Falha inesperada no backfill do IMEA (oferta e demanda)");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverAnos, dividirEmBlocos };
