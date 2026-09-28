"use strict";

const { Router } = require("express");
const documentosProjetoController = require("../controllers/documentos-projeto.controller");
const requireAuth = require("../shared/middlewares/require-auth");

const router = Router();

// Documentos que o STATUS_DO_PROJETO.md cita (ADRs, reconhecimentos de fonte, docs/ e CLAUDE.md), abertos num modal
// da tela "Status do projeto". Mesmo acesso do status: qualquer usuário autenticado.
router.get("/documentos", requireAuth, documentosProjetoController.listar);
router.get("/documentos/:id", requireAuth, documentosProjetoController.obter);

module.exports = router;
