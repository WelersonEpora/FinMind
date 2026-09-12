"use strict";

const sequelize = require("../config/database");
const { listCollectors } = require("../collectors/base/collector.interface");
const nullAiProvider = require("../ai/null-provider");

const startedAt = Date.now();

async function getStatus() {
  let dbStatus = "ok";
  try {
    await sequelize.authenticate();
  } catch (_err) {
    dbStatus = "error";
  }

  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    gitCommit: process.env.GIT_COMMIT || "local",
    gitCommitDate: process.env.GIT_COMMIT_DATE || "unknown",
    database: dbStatus,
    modules: {
      auth: "ok",
      collectors: {
        status: listCollectors().length > 0 ? "ok" : "not_configured",
        registered: listCollectors().length
      },
      analyticsEngine: {
        status: "not_configured",
        message: "Aguardando regras e cálculos do especialista de mercado."
      },
      ai: {
        status: nullAiProvider.nome === "none" ? "not_configured" : "ok",
        message: "Aguardando definição de provedor e critérios de avaliação da IA."
      }
    }
  };
}

module.exports = { getStatus };
