"use strict";

const cepeaImportacaoService = require("../services/cepea-importacao.service");

// Importação da planilha do café exportada do site do Cepea (ADR 0146). Quem importou vem do token (req.user.sub).
async function importarCafe(req, res, next) {
  try {
    const arquivos = (req.files || []).map((f) => ({ nome: f.originalname, conteudo: f.buffer }));
    return res.status(201).json(await cepeaImportacaoService.importarPlanilhasCafe(arquivos, { usuarioId: req.user.sub }));
  } catch (err) {
    return next(err);
  }
}

module.exports = { importarCafe };
