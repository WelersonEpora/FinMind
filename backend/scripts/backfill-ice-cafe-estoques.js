"use strict";

// Backfill dos estoques certificados do café "C" da ICE (ADR 0032): um XLS por pregão desde 2016-01-04 (~2.700
// arquivos). Reaproveita o coletor real (collectors/ice/ice-cafe-estoques.collector.js), o runner e o log de execução;
// só troca a fase de download para pedir um intervalo.
//
// LENTO DE PROPÓSITO: um arquivo por vez, 20 s entre eles (~15 h sem nenhum 429), porque o Cloudflare da ICE limita a
// poucos downloads seguidos e os termos de uso da ICE excluem robôs (risco aceito pelo usuário, ADR 0032). Blocos de
// um mês, do mais recente para o mais antigo; cada bloco grava ao terminar. Se a ICE continuar respondendo 429, o
// bloco para (o que já baixou é gravado), o script espera PAUSA_BLOQUEIO_MS e segue; depois de MAX_BLOQUEIOS
// seguidos, desiste. Reexecutar é seguro e RETOMA: os dias já gravados não são pedidos de novo.
//
// Uso (no servidor, em segundo plano: nohup npm run backfill:ice-cafe-estoques > /tmp/ice.log 2>&1 &):
//   node scripts/backfill-ice-cafe-estoques.js                          (padrão: 2016-01-04 até ontem)
//   node scripts/backfill-ice-cafe-estoques.js --desde=2025-01-01 --ate=2025-03-31

const { sequelize } = require("../src/models");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const coletor = require("../src/collectors/ice/ice-cafe-estoques.collector");
const { paraIso, somarDias } = require("../src/shared/utils/date-utils");
const logger = require("../src/shared/logger");

const TIMEOUT_BLOCO_MS = 6 * 60 * 60 * 1000;
const PAUSA_BLOQUEIO_MS = 30 * 60 * 1000;
const MAX_BLOQUEIOS = 6;

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
  const dataFinal = ate || somarDias(hoje, -1);
  if (dataInicial > dataFinal) throw new Error(`Intervalo vazio: ${dataInicial} > ${dataFinal}.`);
  return { dataInicial, dataFinal };
}

// Blocos de um mês civil, do mais recente para o mais antigo.
function dividirPorMes({ dataInicial, dataFinal }) {
  const blocos = [];
  let ano = Number(dataFinal.slice(0, 4));
  let mes = Number(dataFinal.slice(5, 7));
  for (;;) {
    const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fimMes = somarDias(mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`, -1);
    if (fimMes < dataInicial) break;
    blocos.push({ dataInicial: inicioMes < dataInicial ? dataInicial : inicioMes, dataFinal: fimMes > dataFinal ? dataFinal : fimMes });
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  return blocos;
}

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main({ esperar = aguardar } = {}) {
  const intervalo = resolverIntervalo(parseArgs());
  const blocos = dividirPorMes(intervalo);
  const falhas = [];
  let bloqueiosSeguidos = 0;

  logger.info({ ...intervalo, blocos: blocos.length }, "Iniciando backfill dos estoques certificados do café da ICE");

  for (let i = 0; i < blocos.length; i += 1) {
    const bloco = blocos[i];
    let bruto = null;
    const execucao = await executarColetor(
      {
        ...coletor,
        timeoutMs: TIMEOUT_BLOCO_MS,
        tentativasRetry: 1,
        download: async ({ signal }) => {
          bruto = await coletor.downloadIntervalo({ ...bloco, signal });
          return bruto;
        }
      },
      { triggerType: "script" }
    );

    const naoBaixados = bruto?.naoBaixados?.length ?? 0;
    logger.info(
      {
        ...bloco,
        status: execucao.status,
        arquivos: bruto?.arquivos?.length ?? 0,
        semPregao: bruto?.semArquivo?.length ?? 0,
        naoBaixados,
        registrosCriados: execucao.records_created,
        registrosIgnorados: execucao.records_skipped,
        registrosFalha: execucao.records_failed,
        mensagemErro: execucao.error_message
      },
      `Backfill ${bloco.dataInicial} a ${bloco.dataFinal} finalizado com status "${execucao.status}"`
    );
    if (execucao.status === "failed") falhas.push(bloco);

    if (naoBaixados > 0) {
      bloqueiosSeguidos += 1;
      if (bloqueiosSeguidos >= MAX_BLOQUEIOS) {
        logger.error({ bloqueiosSeguidos }, "A ICE continua limitando (429): backfill interrompido. Rode o mesmo comando mais tarde (retoma de onde parou).");
        return false;
      }
      logger.warn({ esperaMin: PAUSA_BLOQUEIO_MS / 60_000 }, "A ICE limitou (429): pausa antes de repetir o bloco");
      await esperar(PAUSA_BLOQUEIO_MS);
      i -= 1; // repete o bloco: os dias já gravados são pulados
    } else {
      bloqueiosSeguidos = 0;
    }
  }

  if (falhas.length > 0) {
    logger.error({ falhas }, "Blocos com falha - repita só eles: npm run backfill:ice-cafe-estoques -- --desde=<data> --ate=<data>");
  }
  return falhas.length === 0;
}

if (require.main === module) {
  main()
    .then((sucesso) => {
      process.exitCode = sucesso ? 0 : 1;
    })
    .catch((err) => {
      logger.error({ err }, "Falha inesperada no backfill dos estoques certificados da ICE");
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}

module.exports = { resolverIntervalo, parseArgs, dividirPorMes };
