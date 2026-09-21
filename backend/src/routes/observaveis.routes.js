"use strict";

const { Router } = require("express");
const observaveisController = require("../controllers/observaveis.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const { criarLimitadorDeRequisicoes } = require("../shared/middlewares/rate-limit");

const router = Router();

// Exportar uma série longa varre o histórico inteiro no banco: limite por
// usuário (folgado - quem confere vários observáveis exporta vários em sequência).
const limitarExportacao = criarLimitadorDeRequisicoes({
  janelaMs: 10 * 60_000,
  maxRequisicoes: 30,
  mensagem: "Muitas exportações em pouco tempo. Aguarde alguns minutos e tente novamente.",
  chave: (req) => req.user.sub
});

router.get("/observaveis", requireAuth, observaveisController.listar);
router.get("/observaveis/:codigo", requireAuth, observaveisController.detalhar);
router.get("/observaveis/:codigo/historico", requireAuth, observaveisController.historico);
router.get("/observaveis/:codigo/exportacao.csv", requireAuth, limitarExportacao, observaveisController.exportarHistorico);

module.exports = router;
