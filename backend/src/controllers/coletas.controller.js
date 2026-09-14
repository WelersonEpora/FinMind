"use strict";

const coletasService = require("../services/coletas.service");

async function listar(req, res, next) {
  try {
    return res.json(await coletasService.listarExecucoes(req.query));
  } catch (err) {
    return next(err);
  }
}

async function detalhar(req, res, next) {
  try {
    return res.json(await coletasService.obterExecucao(req.params.id));
  } catch (err) {
    return next(err);
  }
}

async function executar(req, res, next) {
  try {
    return res.status(201).json(await coletasService.executarColetaManual(req.user.sub));
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, detalhar, executar };
