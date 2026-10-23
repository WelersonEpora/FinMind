"use strict";

const { DataTypes } = require("sequelize");

// A revisão de um evento de magnitude 3 (ADR 0149): o evento aceito de grau ALTA da leitura diária, revisado por uma
// pessoa. Só as revisões feitas; os pendentes são calculados dos eventos. GLOBAL (ADR 0007).
module.exports = (sequelize) =>
  sequelize.define(
    "RevisaoEvento",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      ativo: { type: DataTypes.STRING(20), allowNull: false },
      data: { type: DataTypes.DATEONLY, allowNull: false },
      chave: { type: DataTypes.STRING(400), allowNull: false },
      evento: { type: DataTypes.JSONB, allowNull: false },
      observacao: { type: DataTypes.TEXT, allowNull: true },
      revisado_por: { type: DataTypes.UUID, allowNull: true },
      revisado_em: { type: DataTypes.DATE, allowNull: false }
    },
    { tableName: "revisao_evento", timestamps: true, underscored: true, createdAt: "created_at", updatedAt: "updated_at" }
  );
