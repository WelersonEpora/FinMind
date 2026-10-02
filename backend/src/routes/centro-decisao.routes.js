"use strict";

const { Router } = require("express");
const centroDecisaoController = require("../controllers/centro-decisao.controller");
const requireAuth = require("../shared/middlewares/require-auth");

// Centro de Decisão (ADR 0048), a tela inicial. Dado de mercado (GLOBAL): basta estar autenticado.
const router = Router();

router.get("/centro-decisao", requireAuth, centroDecisaoController.obter);

module.exports = router;
