"use strict";

const centroDecisaoService = require("../services/centro-decisao.service");

async function obter(req, res, next) {
  try {
    return res.json(await centroDecisaoService.obterCentroDecisao(req.query));
  } catch (err) {
    return next(err);
  }
}

module.exports = { obter };
