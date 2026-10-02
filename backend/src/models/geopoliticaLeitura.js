"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// Leitura diária de geopolítica (ADR 0047): uma por dia, com o nível e o resumo do ouro e do petróleo e a resposta
// bruta da IA. Os eventos ficam em geopolitica_evento (apagados em cascata quando o dia é refeito).
const NIVEIS = ["NORMAL", "ATENCAO", "RELEVANTE", "EXCEPCIONAL"];

module.exports = (sequelize) => {
  const GeopoliticaLeitura = sequelize.define(
    "GeopoliticaLeitura",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      data_referencia: { type: DataTypes.DATEONLY, allowNull: false },
      nivel_ouro: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [NIVEIS] } },
      resumo_ouro: { type: DataTypes.TEXT, allowNull: true },
      nivel_petroleo: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [NIVEIS] } },
      resumo_petroleo: { type: DataTypes.TEXT, allowNull: true },
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
