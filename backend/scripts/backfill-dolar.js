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
//   node scripts/backfill-dolar.js --dataInicial=01/07/1994    (histórico completo)
//
// A API do BCB rejeita (HTTP 406) um pedido com intervalo maior que 10 anos
// (verificado em 2026-09-21). Por isso o intervalo é dividido em janelas de até
// 10 anos, uma execução (collection_execution) por janela. Início recomendado
// para o histórico completo: 01/07/1994 (Plano Real) - antes disso a série está
// em moedas antigas (a 1ª linha, 28/11/1984, vale 2828), e a unidade "BRL" só é
// verdadeira a partir do Real.

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

const ANOS_POR_JANELA = 10;

// Uma janela de 10 anos devolve ~2.500-3.600 pontos; a API do BCB às vezes
// demora mais que os 15 s da coleta diária (visto em 2026-09-21: duas janelas da
// Selic meta estouraram as 3 tentativas). O backfill roda uma vez e à mão,
// então pode esperar mais.
const TIMEOUT_BACKFILL_MS = 60_000;

function daDataBr(dataBr) {
  const [dia, mes, ano] = dataBr.split("/").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// Divide [dataInicial, dataFinal] (DD/MM/AAAA) em janelas consecutivas, sem
// sobreposição, cada uma com no máximo 10 anos (o limite do BCB é "mais de 10
// anos = 406"; a janela termina um dia antes do aniversário de 10 anos).
function dividirEmJanelas(dataInicial, dataFinal) {
  const fim = daDataBr(dataFinal);
  const janelas = [];
  let inicio = daDataBr(dataInicial);

  while (inicio <= fim) {
    const limite = new Date(Date.UTC(inicio.getUTCFullYear() + ANOS_POR_JANELA, inicio.getUTCMonth(), inicio.getUTCDate() - 1));
    const fimJanela = limite < fim ? limite : fim;
    janelas.push({ dataInicial: paraDataBr(inicio), dataFinal: paraDataBr(fimJanela) });
    inicio = new Date(Date.UTC(fimJanela.getUTCFullYear(), fimJanela.getUTCMonth(), fimJanela.getUTCDate() + 1));
  }

  return janelas;
}

async function main() {
  const { dataInicial, dataFinal } = resolverIntervalo(parseArgs());
  const janelas = dividirEmJanelas(dataInicial, dataFinal);
  let sucesso = true;

  logger.info({ dataInicial, dataFinal, janelas: janelas.length }, "Iniciando backfill da cotação do dólar");

  for (const janela of janelas) {
    const coletorBackfill = {
      ...bcbCollector,
      timeoutMs: TIMEOUT_BACKFILL_MS,
      download: ({ signal }) => bcbCollector.downloadIntervalo({ ...janela, signal })
    };

    const execucao = await executarColetor(coletorBackfill, { triggerType: "script" });

    logger.info(
      {
        ...janela,
        status: execucao.status,
        registrosLidos: execucao.records_read,
        registrosCriados: execucao.records_created,
        registrosAtualizados: execucao.records_updated,
        registrosIgnorados: execucao.records_skipped,
        registrosFalha: execucao.records_failed,
        mensagemErro: execucao.error_message
      },
      `Backfill ${janela.dataInicial} a ${janela.dataFinal} finalizado com status "${execucao.status}"`
    );

    if (execucao.status === "failed") sucesso = false;
  }

  return sucesso;
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

module.exports = { resolverIntervalo, paraDataBr, dividirEmJanelas, TIMEOUT_BACKFILL_MS };
