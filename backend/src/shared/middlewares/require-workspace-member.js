"use strict";

const { UnauthorizedError, NotFoundError, ForbiddenError } = require("../errors");
const workspaceRepository = require("../../repositories/workspace.repository");

// Exige que o usuário autenticado (req.user, de require-auth.js) seja MEMBRO
// do espaço da rota (/workspaces/:workspaceId/...) e, opcionalmente, tenha
// um dos papéis informados: requireWorkspaceMember() = qualquer membro;
// requireWorkspaceMember("owner") = só owner do espaço. Consulta o vínculo no
// banco a cada request (o espaço nunca vem do token) e ignora `user.role`
// (papel de plataforma) - ver ADR 0007, §5 e §6.
//
// Quem não é membro recebe 404, igual a um espaço que não existe: não revela
// a existência de espaços alheios.
function requireWorkspaceMember(...allowedRoles) {
  return async function checkWorkspaceMember(req, _res, next) {
    if (!req.user) {
      return next(new UnauthorizedError("Sessão ausente. Faça login novamente."));
    }

    try {
      const membership = await workspaceRepository.findMembership(req.params.workspaceId, req.user.sub);

      if (!membership) {
        return next(new NotFoundError("Espaço não encontrado."));
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
        return next(new ForbiddenError("Você não tem permissão para esta ação neste espaço."));
      }

      req.workspaceMember = { workspaceId: membership.workspace_id, role: membership.role };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = requireWorkspaceMember;
