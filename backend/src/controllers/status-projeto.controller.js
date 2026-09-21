"use strict";

const statusProjetoService = require("../services/status-projeto.service");

async function obter(_req, res, next) {
  try {
    const statusProjeto = await statusProjetoService.obterStatusProjeto();
    return res.json({ statusProjeto });
  } catch (err) {
    return next(err);
  }
}

module.exports = { obter };
