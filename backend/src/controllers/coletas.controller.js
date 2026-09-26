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

// 202: a coleta foi iniciada e roda em segundo plano (leva minutos); o progresso aparece em GET /coletas.
function executar(req, res, next) {
  try {
    const { coleta } = coletasService.iniciarColetaManual(req.user.sub);
    return res.status(202).json({ coleta });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, detalhar, executar };
