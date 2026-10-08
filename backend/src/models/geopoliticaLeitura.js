"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// Leitura diária de eventos de mercado (ADRs 0047 e 0049): uma por dia, com o nível e o resumo de cada ativo e a
// resposta bruta da IA. Os eventos ficam em geopolitica_evento (apagados em cascata quando o dia é refeito). Milho e café
// entraram com o ADR 0049: nulos nas leituras anteriores. Desde o ADR 0115, uma leitura por dia POR FRENTE: a principal
// (ouro, petróleo, milho e café) e a da soja (fase 1 da soja), cada uma só com as colunas dos seus ativos.
const NIVEIS = ["NORMAL", "ATENCAO", "RELEVANTE", "EXCEPCIONAL"];

module.exports = (sequelize) => {
  const GeopoliticaLeitura = sequelize.define(
    "GeopoliticaLeitura",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      data_referencia: { type: DataTypes.DATEONLY, allowNull: false },
      frente: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "PRINCIPAL", validate: { isIn: [["PRINCIPAL", "SOJA"]] } },
      nivel_ouro: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [NIVEIS] } },
      resumo_ouro: { type: DataTypes.TEXT, allowNull: true },
      nivel_petroleo: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [NIVEIS] } },
      resumo_petroleo: { type: DataTypes.TEXT, allowNull: true },
      nivel_milho: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [NIVEIS] } },
      resumo_milho: { type: DataTypes.TEXT, allowNull: true },
      nivel_cafe: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [NIVEIS] } },
      resumo_cafe: { type: DataTypes.TEXT, allowNull: true },
      nivel_soja: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [NIVEIS] } },
      resumo_soja: { type: DataTypes.TEXT, allowNull: true },
      texto_bruto: { type: DataTypes.TEXT, allowNull: false },
      instrucao_sistema: { type: DataTypes.TEXT, allowNull: false },
      prompt: { type: DataTypes.TEXT, allowNull: false },
      versao_prompt: { type: DataTypes.STRING(40), allowNull: false },
      modelo: { type: DataTypes.STRING(80), allowNull: false },
      tokens: { type: DataTypes.INTEGER, allowNull: true },
      chave: { type: DataTypes.STRING(10), allowNull: false, validate: { isIn: [["gratuita", "paga"]] } },
      grounding: { type: DataTypes.JSON, allowNull: true },
      collection_execution_id: { type: DataTypes.UUID, allowNull: false }
    },
    {
      tableName: "geopolitica_leitura",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  GeopoliticaLeitura.NIVEIS = NIVEIS;

  GeopoliticaLeitura.associate = (db) => {
    GeopoliticaLeitura.hasMany(db.GeopoliticaEvento, { foreignKey: "leitura_id", as: "eventos", onDelete: "CASCADE" });
  };

  return GeopoliticaLeitura;
};
