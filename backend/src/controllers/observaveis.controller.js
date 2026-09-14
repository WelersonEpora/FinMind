"use strict";

const observaveisService = require("../services/observaveis.service");
const marketDataService = require("../services/market-data.service");

async function listar(_req, res, next) {
  try {
    return res.json(await observaveisService.listarObservaveis());
  } catch (err) {
    return next(err);
  }
}

async function detalhar(req, res, next) {
  try {
    return res.json(await observaveisService.obterDetalheObservavel(req.params.codigo));
  } catch (err) {
    return next(err);
  }
}

async function historico(req, res, next) {
  try {
    return res.json(await marketDataService.obterHistorico(req.params.codigo, req.query));
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, detalhar, historico };
