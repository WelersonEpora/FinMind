"use strict";

const { Router } = require("express");
const multer = require("multer");
const cepeaController = require("../controllers/cepea.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireRole = require("../shared/middlewares/require-role");
const { criarLimitadorDeRequisicoes } = require("../shared/middlewares/rate-limit");
const { ValidationError } = require("../shared/errors");

const router = Router();

// A planilha do café exportada à mão do site do Cepea (ADR 0146; o desenho veio do upload do AgroMind). Na memória: o
// arquivo é lido e descartado, nunca gravado em disco. O arquivo real tem ~700 KB (30 anos de pregões).
const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;
const MAXIMO_ARQUIVOS = 20;

const limitarImportacao = criarLimitadorDeRequisicoes({
  janelaMs: 10 * 60_000,
  maxRequisicoes: 10,
  mensagem: "Muitas importações de planilhas do Cepea em pouco tempo. Aguarde alguns minutos e tente novamente."
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_BYTES, files: MAXIMO_ARQUIVOS },
  fileFilter(_req, file, cb) {
    if (!file.originalname.toLowerCase().endsWith(".xls")) {
      return cb(new ValidationError(`"${file.originalname}" não é .xls: só a planilha exportada do site do Cepea é aceita.`));
    }
    return cb(null, true);
  }
});

function tratarErroUpload(err, _req, _res, next) {
  if (err instanceof multer.MulterError) return next(new ValidationError(`Falha no envio do arquivo: ${err.message}`));
  return next(err);
}

router.post(
  "/cepea/cafe/importacao",
  requireAuth,
  requireRole("admin"),
  limitarImportacao,
  upload.array("arquivos", MAXIMO_ARQUIVOS),
  tratarErroUpload,
  cepeaController.importarCafe
);

module.exports = router;
