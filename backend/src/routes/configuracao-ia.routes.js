"use strict";

const { Router } = require("express");
const configuracaoIaController = require("../controllers/configuracao-ia.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireRole = require("../shared/middlewares/require-role");
const { criarLimitadorDeRequisicoes } = require("../shared/middlewares/rate-limit");

// As chaves do Gemini da plataforma (ADR 0156): só o admin de plataforma vê e altera. A chave nunca volta na resposta.
const router = Router();

// Salvar testa a chave no Google: o limite evita usar a rota para testar chaves em massa.
const limitarSalvarChave = criarLimitadorDeRequisicoes({
  janelaMs: 10 * 60_000,
  maxRequisicoes: 10,
  mensagem: "Muitas tentativas de cadastrar chave em pouco tempo. Aguarde alguns minutos.",
  chave: (req) => req.user.sub
});

router.get("/configuracoes/ia", requireAuth, requireRole("admin"), configuracaoIaController.obter);
router.put("/configuracoes/ia/chaves/:tipo", requireAuth, requireRole("admin"), limitarSalvarChave, configuracaoIaController.salvarChave);
router.delete("/configuracoes/ia/chaves/:tipo", requireAuth, requireRole("admin"), configuracaoIaController.removerChave);

module.exports = router;
