"use strict";

const { Router } = require("express");
const capturaEventosController = require("../controllers/captura-eventos.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireRole = require("../shared/middlewares/require-role");

// O teste de captura dos eventos dos agrícolas (ADR 0144). Dado GLOBAL: ler basta estar autenticado; gerar os candidatos
// e avaliar, só admin de plataforma.
const router = Router();

router.get("/captura-eventos", requireAuth, capturaEventosController.listar);
router.post("/captura-eventos/candidatos", requireAuth, requireRole("admin"), capturaEventosController.gerarCandidatos);
router.post("/captura-eventos", requireAuth, requireRole("admin"), capturaEventosController.criarManual);
router.patch("/captura-eventos/:id", requireAuth, requireRole("admin"), capturaEventosController.avaliar);
router.delete("/captura-eventos/:id", requireAuth, requireRole("admin"), capturaEventosController.remover);

module.exports = router;
