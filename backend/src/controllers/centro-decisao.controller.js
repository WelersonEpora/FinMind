"use strict";

const centroDecisaoService = require("../services/centro-decisao.service");
const analiseDiariaService = require("../services/analise-diaria.service");

async function obter(req, res, next) {
  try {
    return res.json(await centroDecisaoService.obterCentroDecisao(req.query));
  } catch (err) {
    return next(err);
  }
}

// O prompt enviado à IA e a resposta dela, da leitura de tendência de uma data (ADR 0052).
async function analiseEnviada(req, res, next) {
  try {
    return res.json(await analiseDiariaService.obterPromptEnviado(req.query));
  } catch (err) {
    return next(err);
  }
}

module.exports = { obter, analiseEnviada };
