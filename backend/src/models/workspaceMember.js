"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// Papel DENTRO do espaço - independente de user.role (papel de plataforma).
// Precisa ficar em sincronia manual com o CHECK ck_workspace_member_role da
// migration. Nenhuma autorização usa estes papéis ainda (não há dado
// privado a proteger) - ver docs/adr/0007-escopo-de-dados-global-espaco-usuario.md.
const ROLES = ["owner", "editor", "viewer"];

module.exports = (sequelize) => {
  const WorkspaceMember = sequelize.define(
    "WorkspaceMember",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      workspace_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "viewer",
        validate: { isIn: [ROLES] }
      }
    },
    {
      tableName: "workspace_member",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  WorkspaceMember.ROLE = Object.fromEntries(ROLES.map((role) => [role.toUpperCase(), role]));

  WorkspaceMember.associate = (db) => {
    WorkspaceMember.belongsTo(db.Workspace, { foreignKey: "workspace_id", as: "espaco" });
    WorkspaceMember.belongsTo(db.User, { foreignKey: "user_id", as: "usuario" });
  };

  return WorkspaceMember;
};
