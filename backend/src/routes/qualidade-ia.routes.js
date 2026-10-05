"use strict";

const { Router } = require("express");
const qualidadeIaController = require("../controllers/qualidade-ia.controller");
const requireAuth = require("../shared/middlewares/require-auth");

// Qualidade da IA (ADR 0064). Dado de mercado (GLOBAL): basta estar autenticado.
const router = Router();

router.get("/qualidade-ia", requireAuth, qualidadeIaController.obter);

module.exports = router;
