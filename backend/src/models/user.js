"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

const ROLES = ["owner", "colaborador"];

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      email: {
        type: DataTypes.STRING(180),
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
      },
      password_hash: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      // Papel gravado desde já, mas sem enforcement de autorização nesta
      // fase - nenhuma rota checa `role` ainda (mesmo critério já adotado
      // no Personal-Assistant, models/membro.js).
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "colaborador",
        validate: { isIn: [ROLES] }
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: "user",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  User.ROLE = Object.fromEntries(ROLES.map((role) => [role.toUpperCase(), role]));

  return User;
};
