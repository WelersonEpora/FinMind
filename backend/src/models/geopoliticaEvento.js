"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// Um evento de uma leitura diária de geopolítica (ADR 0047), por ativo. `aceito = false` quando nenhuma fonte
// autorizada o sustenta: fica gravado para a tela, mas não vai ao Motor.
const ATIVOS = ["OURO", "PETROLEO"];
// Em sincronia manual com os CHECKs da migration e com o parser (geopolitica-boletim.parser.js).
const ASSUNTOS = ["GEOPOLITICA"];
const TIPOS = ["CONFLITO_MILITAR", "ROTA_MARITIMA", "INFRAESTRUTURA", "SANCAO", "PRODUCAO", "DIPLOMACIA", "OUTRO"];
const GRAUS = ["BAIXA", "MEDIA", "ALTA"];

module.exports = (sequelize) => {
  const GeopoliticaEvento = sequelize.define(
    "GeopoliticaEvento",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      leitura_id: { type: DataTypes.UUID, allowNull: false },
      ativo: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [ATIVOS] } },
      assunto: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [ASSUNTOS] } },
      tipo: { type: DataTypes.STRING(30), allowNull: true, validate: { isIn: [TIPOS] } },
      ordem: { type: DataTypes.INTEGER, allowNull: false },
      titulo: { type: DataTypes.STRING(300), allowNull: false },
      resumo: { type: DataTypes.TEXT, allowNull: true },
      canal_transmissao: { type: DataTypes.TEXT, allowNull: true },
      pressao: { type: DataTypes.STRING(10), allowNull: true, validate: { isIn: [["ALTA", "BAIXA", "AMBIGUA"]] } },
      intensidade: { type: DataTypes.STRING(10), allowNull: true, validate: { isIn: [GRAUS] } },
      confianca: { type: DataTypes.STRING(10), allowNull: true, validate: { isIn: [GRAUS] } },
      fontes: { type: DataTypes.JSON, allowNull: false },
      aceito: { type: DataTypes.BOOLEAN, allowNull: false },
      motivo_rejeicao: { type: DataTypes.STRING(255), allowNull: true }
    },
    {
      tableName: "geopolitica_evento",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  GeopoliticaEvento.ATIVOS = ATIVOS;
  GeopoliticaEvento.ASSUNTOS = ASSUNTOS;
  GeopoliticaEvento.TIPOS = TIPOS;

  GeopoliticaEvento.associate = (db) => {
    GeopoliticaEvento.belongsTo(db.GeopoliticaLeitura, { foreignKey: "leitura_id", as: "leitura" });
  };

  return GeopoliticaEvento;
};
