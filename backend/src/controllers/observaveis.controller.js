"use strict";

const observaveisService = require("../services/observaveis.service");
const observaveisExportacaoService = require("../services/observaveis-exportacao.service");

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
    return res.json(await observaveisService.obterHistoricoObservavel(req.params.codigo, req.query));
  } catch (err) {
    return next(err);
  }
}

async function exportarHistorico(req, res, next) {
  try {
    const { nomeArquivo, conteudo } = await observaveisExportacaoService.exportarHistoricoCsv(req.params.codigo, req.query);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store"
    });
    return res.send(conteudo);
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, detalhar, historico, exportarHistorico };
