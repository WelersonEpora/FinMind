"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// Espaço (workspace) - fronteira de propriedade dos dados PRIVADOS. Ver
// docs/adr/0007-escopo-de-dados-global-espaco-usuario.md. Nenhuma tabela
// de dado privado existe ainda; este model é só a estrutura de vínculo.
module.exports = (sequelize) => {
  const Workspace = sequelize.define(
    "Workspace",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      // Preenchido só no espaço pessoal do usuário (índice único no banco).
      personal_user_id: {
        type: DataTypes.UUID,
        allowNull: true
      }
    },
    {
      tableName: "workspace",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Workspace.associate = (db) => {
    Workspace.hasMany(db.WorkspaceMember, { foreignKey: "workspace_id", as: "membros" });
  };

  return Workspace;
};
