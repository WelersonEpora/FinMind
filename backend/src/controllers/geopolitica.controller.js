"use strict";

const geopoliticaService = require("../services/geopolitica.service");

async function listarEventos(req, res, next) {
  try {
    return res.json(await geopoliticaService.listarEventos(req.query));
  } catch (err) {
    return next(err);
  }
}

async function obterUltimaLeitura(_req, res, next) {
  try {
    return res.json(await geopoliticaService.obterUltimaLeitura());
  } catch (err) {
    return next(err);
  }
}

async function obterDetalheIa(req, res, next) {
  try {
    return res.json(await geopoliticaService.obterDetalheIa(req.params.leituraId));
  } catch (err) {
    return next(err);
  }
}

module.exports = { listarEventos, obterUltimaLeitura, obterDetalheIa };
