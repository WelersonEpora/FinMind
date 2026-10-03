"use strict";

const { Router } = require("express");
const metodologiaAtivoController = require("../controllers/metodologia-ativo.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireRole = require("../shared/middlewares/require-role");

const router = Router();

router.get("/ativos/:ativo/metodologia", requireAuth, metodologiaAtivoController.detalhar);
router.get("/ativos/:ativo/metodologia/fatores/:fator/calculo", requireAuth, metodologiaAtivoController.calcularFator);
// Simulação numa data (ADR 0050): o que cada fator mostraria com o que se sabia até o fim dela, e o bloco completo.
router.get("/ativos/:ativo/metodologia/simulacao", requireAuth, metodologiaAtivoController.simular);
// Fator de evento (ADR 0050): os eventos da leitura diária marcados com ele, na janela do fator, e o bloco do prompt.
router.get("/ativos/:ativo/metodologia/fatores/:fator/eventos", requireAuth, metodologiaAtivoController.obterEventosFator);
// Os parâmetros da camada C em uso no sistema (ADR 0050): o histórico para todos; gravar uma versão nova, só admin.
router.get("/ativos/:ativo/metodologia/fatores/:fator/parametros", requireAuth, metodologiaAtivoController.listarParametros);
router.post(
  "/ativos/:ativo/metodologia/fatores/:fator/parametros",
  requireAuth,
  requireRole("admin"),
  metodologiaAtivoController.salvarParametros
);

module.exports = router;
