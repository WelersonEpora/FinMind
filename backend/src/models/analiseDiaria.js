"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// Leitura diária de tendência da IA (ADR 0052): uma por ativo e dia, com o que foi enviado (versões, hash, entrada,
// instrução e prompt), a resposta bruta e as quatro leituras validadas.
module.exports = (sequelize) =>
  sequelize.define(
    "AnaliseDiaria",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      ativo: { type: DataTypes.STRING(20), allowNull: false },
      data_analise: { type: DataTypes.DATEONLY, allowNull: false },
      versao_prompt: { type: DataTypes.STRING(60), allowNull: false },
      versao_metodologia: { type: DataTypes.STRING(80), allowNull: false },
      versao_configuracao: { type: DataTypes.INTEGER, allowNull: false },
      hash_entrada: { type: DataTypes.STRING(64), allowNull: false },
      entrada: { type: DataTypes.JSONB, allowNull: false },
      instrucao_sistema: { type: DataTypes.TEXT, allowNull: false },
      prompt: { type: DataTypes.TEXT, allowNull: false },
      resposta_bruta: { type: DataTypes.TEXT, allowNull: false },
      leituras: { type: DataTypes.JSONB, allowNull: false },
      modelo: { type: DataTypes.STRING(80), allowNull: false },
      tokens: { type: DataTypes.INTEGER, allowNull: true },
      chave: { type: DataTypes.STRING(10), allowNull: false, validate: { isIn: [["gratuita", "paga"]] } },
      collection_execution_id: { type: DataTypes.UUID, allowNull: false }
    },
    {
      tableName: "analise_diaria",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );
