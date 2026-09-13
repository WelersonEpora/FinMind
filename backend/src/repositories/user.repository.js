"use strict";

const { Op } = require("sequelize");
const { User } = require("../models");

async function findByEmail(email) {
  return User.findOne({ where: { email } });
}

async function findById(id) {
  return User.findByPk(id);
}

async function findAll() {
  return User.findAll({ order: [["created_at", "ASC"]] });
}

async function create(data) {
  return User.create(data);
}

async function update(user, data) {
  return user.update(data);
}

async function countActiveOwners(excludeId) {
  return User.count({ where: { role: "owner", active: true, id: { [Op.ne]: excludeId } } });
}

module.exports = { findByEmail, findById, findAll, create, update, countActiveOwners };
