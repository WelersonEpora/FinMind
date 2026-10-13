"use strict";

// A rotina diária das carteiras virtuais (ADR 0127, §3), separada da coleta: liquida as rodadas pendentes (o ajuste de
// ontem) e decide a de hoje, em cada carteira ativa, com a falha isolada por carteira. No servidor, um cron do usuário
// `deploy` a chama às 06h30 de Brasília, depois da última tentativa das leituras do dia (05h). Rodar de novo no mesmo
// dia não refaz nada: uma rodada decidida é definitiva.
//
// Uso: node scripts/run-carteiras.js  (ou `npm run carteiras`)
//
// Sai com código 1 se alguma carteira falhar (o cron consegue alertar). Uma liquidação à espera do dado do dia não é
// falha: tenta de novo na próxima execução.

const { executarRotina } = require("../src/services/rodada-carteira.service");
const { sequelize } = require("../src/models");
const logger = require("../src/shared/logger");

async function main() {
  const { hoje, resumos } = await executarRotina();
  if (resumos.length === 0) logger.info({ hoje }, "Carteiras: nenhuma carteira ativa.");
  for (const r of resumos) {
    logger.info({ hoje, ...r }, `Carteira "${r.nome ?? r.carteiraId}": ${r.erro ? "falhou" : "ok"}`);
  }
  return resumos.every((r) => !r.erro);
}

main()
  .then((sucesso) => {
    process.exitCode = sucesso ? 0 : 1;
  })
  .catch((err) => {
    logger.error({ err }, "Falha inesperada na rotina das carteiras");
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
