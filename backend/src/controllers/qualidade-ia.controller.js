"use strict";

const qualidadeIaService = require("../services/qualidade-ia.service");

// Qualidade da IA (ADR 0064): as leituras de tendência de um ativo contra o realizado, com as medidas e os benchmarks.
async function obter(req, res, next) {
  try {
    return res.json(await qualidadeIaService.obterQualidadeIa(req.query));
  } catch (err) {
    return next(err);
  }
}

module.exports = { obter };
