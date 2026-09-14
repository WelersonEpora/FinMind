"use strict";

const { Router } = require("express");
const observaveisController = require("../controllers/observaveis.controller");
const requireAuth = require("../shared/middlewares/require-auth");

const router = Router();

router.get("/observaveis", requireAuth, observaveisController.listar);
router.get("/observaveis/:codigo", requireAuth, observaveisController.detalhar);
router.get("/observaveis/:codigo/historico", requireAuth, observaveisController.historico);

module.exports = router;
