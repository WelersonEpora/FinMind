"use strict";

const { DataTypes } = require("sequelize");

// A recomendação da IA compartilhada pelas carteiras virtuais (ADR 0127, adendo de 2026-10-16): uma linha por chamada
// (a principal do dia ou a réplica semanal) de uma combinação de ativos. GLOBAL (ADR 0007): a entrada só tem dado de
// mercado. Cada carteira guarda a cópia em `carteira_recomendacao`, com `recomendacao_ia_id`.
module.exports = (sequelize) =>
  sequelize.define(
    "RecomendacaoIa",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      data: { type: DataTypes.DATEONLY, allowNull: false },
      tipo: { type: DataTypes.STRING(10), allowNull: false },
      ativos: { type: DataTypes.STRING(120), allowNull: false },
      situacao: { type: DataTypes.STRING(10), allowNull: false },
      motivo_falha: { type: DataTypes.STRING(40), allowNull: true },
      versao_prompt: { type: DataTypes.STRING(60), allowNull: false },
      modelo_pedido: { type: DataTypes.STRING(80), allowNull: false },
      modelo_devolvido: { type: DataTypes.STRING(80), allowNull: true },
      hash_entrada: { type: DataTypes.STRING(64), allowNull: false },
      entrada: { type: DataTypes.JSONB, allowNull: false },
      instrucao: { type: DataTypes.TEXT, allowNull: false },
      prompt: { type: DataTypes.TEXT, allowNull: false },
      respostas: { type: DataTypes.JSONB, allowNull: false },
      recomendacoes: { type: DataTypes.JSONB, allowNull: true },
      contrarias: { type: DataTypes.JSONB, allowNull: true },
      tokens: { type: DataTypes.JSONB, allowNull: true },
      custo_usd: { type: DataTypes.DECIMAL(12, 6), allowNull: true },
      tentativas: { type: DataTypes.JSONB, allowNull: false },
      detalhes: { type: DataTypes.JSONB, allowNull: true }
    },
    { tableName: "recomendacao_ia", timestamps: true, underscored: true, createdAt: "created_at", updatedAt: "updated_at" }
  );
