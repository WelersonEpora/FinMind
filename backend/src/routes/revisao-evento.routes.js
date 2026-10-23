"use strict";

const { Router } = require("express");
const revisaoEventoController = require("../controllers/revisao-evento.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireRole = require("../shared/middlewares/require-role");

// A revisão dos eventos de magnitude 3 (ADR 0149). Dado GLOBAL: ler basta estar autenticado; revisar, só admin.
// A chave do evento vai no corpo (tem "|" e o título).
const router = Router();

router.get("/revisoes-evento", requireAuth, revisaoEventoController.listar);
router.post("/revisoes-evento", requireAuth, requireRole("admin"), revisaoEventoController.revisar);
router.post("/revisoes-evento/desfazer", requireAuth, requireRole("admin"), revisaoEventoController.desfazer);

module.exports = router;
