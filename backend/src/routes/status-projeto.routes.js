"use strict";

const { Router } = require("express");
const statusProjetoController = require("../controllers/status-projeto.controller");
const requireAuth = require("../shared/middlewares/require-auth");

const router = Router();

// Qualquer usuário autenticado (decisão de 2026-09-21, fase de desenvolvimento;
// a tela é temporária). Diferente de GET /status, que é a saúde do sistema.
router.get("/status-projeto", requireAuth, statusProjetoController.obter);

module.exports = router;
