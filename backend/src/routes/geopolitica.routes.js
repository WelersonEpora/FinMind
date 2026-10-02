"use strict";

const { Router } = require("express");
const geopoliticaController = require("../controllers/geopolitica.controller");
const requireAuth = require("../shared/middlewares/require-auth");

// Leitura diária de geopolítica (ADR 0047), para a tela Eventos. Dado de mercado (GLOBAL): basta estar autenticado.
const router = Router();

router.get("/geopolitica/leituras/ultima", requireAuth, geopoliticaController.obterUltimaLeitura);
router.get("/geopolitica/eventos", requireAuth, geopoliticaController.listarEventos);
router.get("/geopolitica/leituras/:leituraId/ia", requireAuth, geopoliticaController.obterDetalheIa);

module.exports = router;
