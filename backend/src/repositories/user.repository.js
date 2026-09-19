"use strict";

const { Op } = require("sequelize");
const { User, sequelize } = require("../models");
const workspaceRepository = require("./workspace.repository");

async function findByEmail(email) {
  return User.findOne({ where: { email } });
}

async function findById(id) {
  return User.findByPk(id);
}

async function findAll() {
  return User.findAll({ order: [["created_at", "ASC"]] });
}

// Único caminho de criação de usuário: todo usuário nasce com o espaço
// pessoal + vínculo owner (do espaço), na mesma transação (ver ADR 0007). Não existe um
// `create` solto de propósito - ele criaria um usuário sem espaço.
async function createWithPersonalWorkspace(data) {
  return sequelize.transaction(async (transaction) => {
    const user = await User.create(data, { transaction });
    await workspaceRepository.createPersonalFor(user, { transaction });
    return user;
  });
}

async function update(user, data) {
  return user.update(data);
}

async function countActiveAdmins(excludeId) {
  return User.count({ where: { role: User.ROLE.ADMIN, active: true, id: { [Op.ne]: excludeId } } });
}

module.exports = { findByEmail, findById, findAll, createWithPersonalWorkspace, update, countActiveAdmins };
