"use strict";

const { DataTypes } = require("sequelize");

// Um evento de referência do teste de captura dos eventos (ADR 0144): um candidato gerado por gatilho objetivo ou
// adicionado à mão, com a avaliação de uma pessoa (relevante e, nos relevantes, capturado ou não). GLOBAL (ADR 0007).
module.exports = (sequelize) =>
  sequelize.define(
    "EventoReferencia",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      ativo: { type: DataTypes.STRING(20), allowNull: false },
      data: { type: DataTypes.DATEONLY, allowNull: false },
      origem: { type: DataTypes.STRING(20), allowNull: false },
      chave: { type: DataTypes.STRING(200), allowNull: false },
      titulo: { type: DataTypes.STRING(300), allowNull: false },
      detalhe: { type: DataTypes.JSONB, allowNull: true },
      relevante: { type: DataTypes.BOOLEAN, allowNull: true },
      captura: { type: DataTypes.STRING(20), allowNull: true },
      captura_evento: { type: DataTypes.JSONB, allowNull: true },
      observacao: { type: DataTypes.TEXT, allowNull: true },
      avaliado_por: { type: DataTypes.UUID, allowNull: true },
      avaliado_em: { type: DataTypes.DATE, allowNull: true }
    },
    { tableName: "evento_referencia", timestamps: true, underscored: true, createdAt: "created_at", updatedAt: "updated_at" }
  );
