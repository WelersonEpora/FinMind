"use strict";

const { DataTypes } = require("sequelize");

// Uma versão dos parâmetros da camada C de um fator (ADR 0050). Append-only: um ajuste é uma linha nova.
module.exports = (sequelize) => {
  const FatorParametroVersao = sequelize.define(
    "FatorParametroVersao",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      fator_codigo: { type: DataTypes.STRING(64), allowNull: false },
      versao: { type: DataTypes.INTEGER, allowNull: false },
      parametros: { type: DataTypes.JSONB, allowNull: false },
      motivo: { type: DataTypes.TEXT, allowNull: false },
      alterado_por: { type: DataTypes.UUID, allowNull: false }
    },
    {
      tableName: "fator_parametro_versao",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  FatorParametroVersao.associate = (db) => {
    FatorParametroVersao.belongsTo(db.User, { foreignKey: "alterado_por", as: "autor" });
  };

  return FatorParametroVersao;
};
