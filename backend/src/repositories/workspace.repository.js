"use strict";

const { Op, literal } = require("sequelize");
const { Workspace, WorkspaceMember, User, sequelize } = require("../models");

// Nome fixo do espaço pessoal (não derivado do nome do usuário, que pode
// mudar). O que identifica um espaço pessoal é personal_user_id, não o nome.
const PERSONAL_WORKSPACE_NAME = "Espaço pessoal";

// Cria o espaço pessoal de um usuário e o vínculo dele como owner. Exige uma
// transação existente de propósito: nunca deve rodar fora da criação atômica
// do usuário (ver user.repository.js::createWithPersonalWorkspace).
async function createPersonalFor(user, { transaction } = {}) {
  if (!transaction) {
    throw new Error("createPersonalFor exige uma transação - crie o usuário via createWithPersonalWorkspace.");
  }

  const workspace = await Workspace.create(
    { name: PERSONAL_WORKSPACE_NAME, personal_user_id: user.id },
    { transaction }
  );

  await WorkspaceMember.create(
    { workspace_id: workspace.id, user_id: user.id, role: WorkspaceMember.ROLE.OWNER },
    { transaction }
  );

  return workspace;
}

// Vínculos do usuário com seus espaços, já com o espaço carregado. Sempre
// filtrado por user_id - nunca existe uma listagem de espaços sem dono.
async function findMembershipsByUser(userId) {
  return WorkspaceMember.findAll({
    where: { user_id: userId },
    include: [{ model: Workspace, as: "espaco" }]
  });
}

// Espaço compartilhado (não pessoal): o criador vira owner, tudo na mesma
// transação. Nenhuma entidade financeira é criada junto.
async function createSharedWithOwner({ name, ownerUserId }) {
  return sequelize.transaction(async (transaction) => {
    const workspace = await Workspace.create({ name, personal_user_id: null }, { transaction });

    await WorkspaceMember.create(
      { workspace_id: workspace.id, user_id: ownerUserId, role: WorkspaceMember.ROLE.OWNER },
      { transaction }
    );

    return workspace;
  });
}

// Vínculo de UM usuário com UM espaço - base de toda checagem de acesso
// (ver shared/middlewares/require-workspace-member.js).
async function findMembership(workspaceId, userId) {
  return WorkspaceMember.findOne({ where: { workspace_id: workspaceId, user_id: userId } });
}

// Só chamar depois de confirmar o vínculo do solicitante com este espaço.
async function findWorkspaceById(workspaceId) {
  return Workspace.findByPk(workspaceId);
}

// Membros de UM espaço. Atributos do usuário listados explicitamente -
// nunca password_hash nem qualquer coisa além do necessário.
async function findMembers(workspaceId) {
  return WorkspaceMember.findAll({
    where: { workspace_id: workspaceId },
    include: [{ model: User, as: "usuario", attributes: ["id", "name", "email"] }]
  });
}

// Usuários ATIVOS que ainda NÃO são membros deste espaço - a lista de escolha
// de "adicionar membro". Só nome e e-mail (nunca id nem senha). Devolve todos
// os usuários ativos, então só pode ser exposta a quem já pode adicionar
// membros e enquanto o conjunto de usuários for um grupo fechado (ADR 0007,
// §4). O id do espaço entra escapado no subselect, nunca concatenado cru.
async function findAddableUsers(workspaceId) {
  const membrosDoEspaco = `(SELECT user_id FROM workspace_member WHERE workspace_id = ${sequelize.escape(workspaceId)})`;

  return User.findAll({
    where: { active: true, id: { [Op.notIn]: literal(membrosDoEspaco) } },
    attributes: ["name", "email"],
    order: [["name", "ASC"]]
  });
}

// Vínculo pelo id do VÍNCULO **e** pelo espaço: um id de vínculo de outro
// espaço nunca é encontrado (sem isso, o owner de um espaço poderia apagar
// membros de qualquer outro).
async function findMemberInWorkspace(workspaceId, memberId) {
  return WorkspaceMember.findOne({ where: { id: memberId, workspace_id: workspaceId } });
}

// Devolve quantos vínculos foram removidos (0 ou 1). Mesmo filtro duplo.
async function removeMember(workspaceId, memberId) {
  return WorkspaceMember.destroy({ where: { id: memberId, workspace_id: workspaceId } });
}

// Exclui um espaço COMPARTILHADO e seus vínculos, numa transação. O filtro
// `personal_user_id: null` é a última barreira: mesmo que uma checagem acima
// falhe, o banco nunca apaga um espaço pessoal (e o erro desfaz a remoção dos
// vínculos). Tabelas privadas futuras com FK RESTRICT bloquearão a exclusão
// de um espaço que tenha dados (ver ADR 0007).
async function deleteSharedWorkspace(workspaceId) {
  return sequelize.transaction(async (transaction) => {
    await WorkspaceMember.destroy({ where: { workspace_id: workspaceId }, transaction });

    const removidos = await Workspace.destroy({ where: { id: workspaceId, personal_user_id: null }, transaction });
    if (removidos !== 1) {
      throw new Error("Espaço compartilhado não encontrado para exclusão.");
    }
  });
}

async function addMember({ workspaceId, userId, role }) {
  return WorkspaceMember.create({ workspace_id: workspaceId, user_id: userId, role });
}

module.exports = {
  PERSONAL_WORKSPACE_NAME,
  createPersonalFor,
  createSharedWithOwner,
  findMembershipsByUser,
  findMembership,
  findWorkspaceById,
  findMembers,
  findAddableUsers,
  findMemberInWorkspace,
  removeMember,
  deleteSharedWorkspace,
  addMember
};
