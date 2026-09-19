"use strict";

const workspaceService = require("../services/workspace.service");

async function listar(req, res, next) {
  try {
    return res.json(await workspaceService.listarEspacosDoUsuario(req.user.sub));
  } catch (err) {
    return next(err);
  }
}

async function criar(req, res, next) {
  try {
    return res.status(201).json(await workspaceService.criarEspaco(req.user.sub, req.body || {}));
  } catch (err) {
    return next(err);
  }
}

// req.workspaceMember foi preenchido por requireWorkspaceMember (vínculo
// verificado no banco) - o espaço e o papel nunca vêm do corpo da requisição.
async function listarMembros(req, res, next) {
  try {
    const { workspaceId, role } = req.workspaceMember;
    return res.json(await workspaceService.listarMembros(workspaceId, { userId: req.user.sub, papel: role }));
  } catch (err) {
    return next(err);
  }
}

async function listarCandidatos(req, res, next) {
  try {
    const { workspaceId } = req.workspaceMember;
    return res.json(await workspaceService.listarCandidatos(workspaceId));
  } catch (err) {
    return next(err);
  }
}

async function adicionarMembro(req, res, next) {
  try {
    const { workspaceId } = req.workspaceMember;
    return res.status(201).json(await workspaceService.adicionarMembro(workspaceId, req.body || {}));
  } catch (err) {
    return next(err);
  }
}

async function removerMembro(req, res, next) {
  try {
    const { workspaceId } = req.workspaceMember;
    await workspaceService.removerMembro(workspaceId, req.params.membroId);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function excluir(req, res, next) {
  try {
    const { workspaceId } = req.workspaceMember;
    await workspaceService.excluirEspaco(workspaceId, req.body || {});
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, criar, listarMembros, listarCandidatos, adicionarMembro, removerMembro, excluir };
