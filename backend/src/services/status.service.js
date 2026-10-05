"use strict";

const sequelize = require("../config/database");
const env = require("../config/env");
const { listCollectors } = require("../collectors/base/collector.interface");
const { ATIVOS_COM_ANALISE_DIARIA } = require("../shared/analise-diaria");

const startedAt = Date.now();

async function getStatus() {
  let dbStatus = "ok";
  try {
    await sequelize.authenticate();
  } catch (_err) {
    dbStatus = "error";
  }

  const geminiConfigurado = Boolean(env.gemini.apiKeyFree || env.gemini.apiKey);

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
      // O motor de hoje: os fatores de cada ativo (camadas A, B e C) e o prompt diário (ADRs 0052, 0054, 0058 e 0062),
      // em factors/ e nos serviços de metodologia e de prompt (analytics-engine/README.md). A agregação dos fatores em
      // código ainda é do David.
      analyticsEngine: {
        status: "ok",
        ativos: ATIVOS_COM_ANALISE_DIARIA.length,
        message: "Fatores e prompt diário por ativo; a agregação dos fatores em código aguarda o especialista de mercado."
      },
      ai: {
        status: geminiConfigurado ? "ok" : "not_configured",
        message: geminiConfigurado
          ? "Gemini: leitura diária de eventos e de tendência."
          : "GEMINI_API_KEY_FREE e GEMINI_API_KEY não definidas."
      }
    }
  };
}

module.exports = { getStatus };
