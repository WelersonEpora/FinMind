"use strict";

const pinoHttp = require("pino-http");
const logger = require("../logger");

module.exports = pinoHttp({ logger });
