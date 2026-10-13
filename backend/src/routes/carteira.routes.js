"use strict";

const { Router } = require("express");
const carteiraController = require("../controllers/carteira.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireWorkspaceMember = require("../shared/middlewares/require-workspace-member");

const router = Router();

// Carteiras virtuais (ADR 0127, §8): qualquer membro do espaço lê; só o dono DO espaço cria uma carteira e muda os
// parâmetros (papel de plataforma não conta - ADR 0007, §5).
const base = "/workspaces/:workspaceId/carteiras";
const membro = [requireAuth, requireWorkspaceMember()];
const dono = [requireAuth, requireWorkspaceMember("owner")];

router.get(`${base}/opcoes`, ...membro, carteiraController.opcoes);
router.get(base, ...membro, carteiraController.listar);
router.post(base, ...dono, carteiraController.criar);
router.get(`${base}/:carteiraId`, ...membro, carteiraController.obter);
router.post(`${base}/:carteiraId/versoes`, ...dono, carteiraController.registrarVersao);
router.get(`${base}/:carteiraId/painel`, ...membro, carteiraController.painel);
router.get(`${base}/:carteiraId/rodadas`, ...membro, carteiraController.rodadas);
router.get(`${base}/:carteiraId/posicoes`, ...membro, carteiraController.posicoes);
router.get(`${base}/:carteiraId/operacoes`, ...membro, carteiraController.operacoes);
router.get(`${base}/:carteiraId/recomendacoes`, ...membro, carteiraController.recomendacoes);
router.get(`${base}/:carteiraId/recomendacoes/:recomendacaoId`, ...membro, carteiraController.recomendacao);

module.exports = router;
