"use strict";

// Brent FUTURO (NYMEX BZ) pelo Yahoo Finance: fonte NÃO oficial e provisória, autorizada pelo usuário em 2026-10-07
// (ADR 0096). O coletor é o molde comum dos futuros do Yahoo (yahoo-futuro.collector.js), com o produto "brent".

const { criarColetorFuturoYahoo } = require("./yahoo-futuro.collector");

module.exports = criarColetorFuturoYahoo("brent");
