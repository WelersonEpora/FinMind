"use strict";

const pino = require("pino");
const env = require("../../config/env");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: env.nodeEnv === "development" ? { target: "pino-pretty" } : undefined
});

module.exports = logger;
