"use strict";

const { Router } = require("express");
const workspaceController = require("../controllers/workspace.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireWorkspaceMember = require("../shared/middlewares/require-workspace-member");
const { criarLimitadorDeRequisicoes } = require("../shared/middlewares/rate-limit");

const router = Router();

// Por usuário (não por IP): criar espaço é aberto a qualquer autenticado e
// adicionar membro procura um usuário por e-mail - nenhum dos dois pode virar
// um meio de gerar linhas ou testar e-mails em volume.
const limitarCriacaoDeEspaco = criarLimitadorDeRequisicoes({
  janelaMs: 10 * 60_000,
  maxRequisicoes: 10,
  mensagem: "Muitos espaços criados em pouco tempo. Aguarde alguns minutos e tente novamente.",
  chave: (req) => req.user.sub
});

const limitarAdicaoDeMembro = criarLimitadorDeRequisicoes({
  janelaMs: 10 * 60_000,
  maxRequisicoes: 10,
  mensagem: "Muitas tentativas de adicionar membros em pouco tempo. Aguarde alguns minutos e tente novamente.",
  chave: (req) => req.user.sub
});

// Só os espaços do próprio usuário autenticado - não existe listagem de
// espaços de terceiros.
router.get("/workspaces", requireAuth, workspaceController.listar);
router.post("/workspaces", requireAuth, limitarCriacaoDeEspaco, workspaceController.criar);

// Gestão de membros: primeira rota por espaço (/workspaces/:workspaceId/...).
// O vínculo é verificado no banco a cada request; adicionar exige ser owner
// DO espaço (papel de plataforma não conta - ADR 0007, §5).
router.get("/workspaces/:workspaceId/membros", requireAuth, requireWorkspaceMember(), workspaceController.listarMembros);
// Lista de escolha do "adicionar": só o owner do espaço, igual ao adicionar.
router.get(
  "/workspaces/:workspaceId/membros/candidatos",
  requireAuth,
  requireWorkspaceMember("owner"),
  workspaceController.listarCandidatos
);
router.post(
  "/workspaces/:workspaceId/membros",
  requireAuth,
  requireWorkspaceMember("owner"),
  limitarAdicaoDeMembro,
  workspaceController.adicionarMembro
);

// Remover membro / excluir espaço: só o owner DO espaço (papel de plataforma não
// conta). O espaço pessoal é recusado no serviço (e no banco, ao excluir).
router.delete(
  "/workspaces/:workspaceId/membros/:membroId",
  requireAuth,
  requireWorkspaceMember("owner"),
  workspaceController.removerMembro
);
router.delete("/workspaces/:workspaceId", requireAuth, requireWorkspaceMember("owner"), workspaceController.excluir);

module.exports = router;
