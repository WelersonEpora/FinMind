"use strict";

const { Router } = require("express");
const centroDecisaoController = require("../controllers/centro-decisao.controller");
const requireAuth = require("../shared/middlewares/require-auth");

// Centro de Decisão (ADR 0048), a tela inicial. Dado de mercado (GLOBAL): basta estar autenticado.
const router = Router();

router.get("/centro-decisao", requireAuth, centroDecisaoController.obter);
// O prompt e a resposta da leitura de tendência de uma data (~30 mil caracteres): só ao abrir o modal (ADR 0052).
router.get("/centro-decisao/analise", requireAuth, centroDecisaoController.analiseEnviada);

module.exports = router;
