"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const Role = sequelize.define(
    "Role",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      name: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true
      }
    },
    {
      tableName: "role",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Role.associate = (models) => {
    Role.hasMany(models.User, { foreignKey: "role_id", as: "users" });
  };

  return Role;
};
