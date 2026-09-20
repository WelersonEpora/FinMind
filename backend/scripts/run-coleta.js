"use strict";

// Script de coleta manual/cron externo - roda todos os coletores
// registrados e sai com código de erro se alguma execução falhar (pra um
// cron externo conseguir alertar). Sem node-cron/fila nesta etapa: um cron
// do host (ou systemd timer) chama este script periodicamente - ver
// docs/adr/0004-agendamento-coleta.md.
//
// Uso: node scripts/run-coleta.js  (ou `npm run collect`)
//      npm run collect -- --coletor=fred     (só os coletores cujo código contém "fred")
//
// Os coletores da camada point-in-time (fred-*, lbma-*, cftc-*, usda-*) baixam
// a série INTEIRA e só gravam o que é novo ou mudou (ADR 0008) - então este
// mesmo comando serve de rotina diária e de backfill.

const { bootstrapCollectors } = require("../src/collectors");
const { listCollectors } = require("../src/collectors/base/collector.interface");
const { executarColetor } = require("../src/collectors/base/collector-runner");
const { sequelize } = require("../src/models");
const logger = require("../src/shared/logger");

function filtroDeColetor() {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--coletor="));
  return arg ? arg.slice("--coletor=".length) : null;
}

async function main() {
  bootstrapCollectors();
  const filtro = filtroDeColetor();
  const coletores = listCollectors().filter((c) => !filtro || c.codigo.includes(filtro));

  if (coletores.length === 0) {
    logger.warn("Nenhum coletor registrado - nada a fazer.");
    return true;
  }

  let houveFalha = false;

  for (const coletor of coletores) {
    const execucao = await executarColetor(coletor, { triggerType: "script" });
    logger.info(
      {
        coletor: coletor.codigo,
        status: execucao.status,
        registrosLidos: execucao.records_read,
        registrosCriados: execucao.records_created,
        registrosAtualizados: execucao.records_updated,
        registrosIgnorados: execucao.records_skipped,
        registrosFalha: execucao.records_failed
      },
      `Coleta "${coletor.codigo}" finalizada com status "${execucao.status}"`
    );

    if (execucao.status === "failed") {
      houveFalha = true;
    }
  }

  return !houveFalha;
}

main()
  .then((sucesso) => {
    process.exitCode = sucesso ? 0 : 1;
  })
  .catch((err) => {
    logger.error({ err }, "Falha inesperada ao rodar a coleta");
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
