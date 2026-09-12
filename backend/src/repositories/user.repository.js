"use strict";

const { User, Role } = require("../models");

async function findByEmail(email) {
  return User.findOne({ where: { email }, include: [{ model: Role, as: "role" }] });
}

async function findById(id) {
  return User.findByPk(id, { include: [{ model: Role, as: "role" }] });
}

module.exports = { findByEmail, findById };
