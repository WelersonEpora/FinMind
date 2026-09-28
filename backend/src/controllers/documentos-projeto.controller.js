"use strict";

const documentosProjetoService = require("../services/documentos-projeto.service");

async function listar(_req, res, next) {
  try {
    const { documentos } = await documentosProjetoService.listarDocumentos();
    return res.json({ documentos });
  } catch (err) {
    return next(err);
  }
}

async function obter(req, res, next) {
  try {
    const { documento } = await documentosProjetoService.obterDocumento(req.params.id);
    return res.json({ documento });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, obter };
