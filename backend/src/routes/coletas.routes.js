"use strict";

const { Router } = require("express");
const coletasController = require("../controllers/coletas.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireRole = require("../shared/middlewares/require-role");
const { criarLimitadorDeRequisicoes } = require("../shared/middlewares/rate-limit");

const router = Router();

const limitarColetaManual = criarLimitadorDeRequisicoes({
  janelaMs: 10 * 60_000,
  maxRequisicoes: 3,
  mensagem: "Muitas coletas manuais em pouco tempo. Aguarde alguns minutos e tente novamente."
});

router.get("/coletas", requireAuth, coletasController.listar);
router.get("/coletas/:id", requireAuth, coletasController.detalhar);
router.post("/coletas", requireAuth, requireRole("admin"), limitarColetaManual, coletasController.executar);

module.exports = router;
