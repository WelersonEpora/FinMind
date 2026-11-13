"use strict";

const configuracaoIaService = require("../services/configuracao-ia.service");

async function obter(_req, res, next) {
  try {
    return res.json({ configuracaoIa: await configuracaoIaService.obterSituacao() });
  } catch (err) {
    return next(err);
  }
}

async function salvarChave(req, res, next) {
  try {
    const configuracaoIa = await configuracaoIaService.salvarChave(req.params.tipo, req.body?.apiKey, req.user.sub);
    return res.json({ configuracaoIa });
  } catch (err) {
    return next(err);
  }
}

async function removerChave(req, res, next) {
  try {
    return res.json({ configuracaoIa: await configuracaoIaService.removerChave(req.params.tipo) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { obter, salvarChave, removerChave };
