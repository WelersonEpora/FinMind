"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");
const { ATIVOS, CODIGOS_TIPO: TIPOS } = require("../shared/eventos-mercado");

// Um evento de mercado de uma leitura diária (ADRs 0047 e 0049), uma linha por ativo afetado: o mesmo fato que afeta
// petróleo e ouro tem duas linhas, com a mesma ordem e as mesmas fontes, cada uma com o fator e a pressão do seu ativo.
// `aceito = false` quando nenhuma página de fonte autorizada o sustenta: fica gravado para a tela, mas não vai ao Motor.
// ATIVOS e TIPOS vêm de shared/eventos-mercado.js, em sincronia com os CHECKs das migrations.
const GRAUS = ["BAIXA", "MEDIA", "ALTA"];

module.exports = (sequelize) => {
  const GeopoliticaEvento = sequelize.define(
    "GeopoliticaEvento",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      leitura_id: { type: DataTypes.UUID, allowNull: false },
      ativo: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [ATIVOS] } },
      tipo: { type: DataTypes.STRING(30), allowNull: true, validate: { isIn: [TIPOS] } },
      // Um dos 34 fatores do FEL 1 (shared/fatores-fel1.js) ou NAO_SE_APLICA; null nos eventos de antes do ADR 0049.
      fator: { type: DataTypes.STRING(60), allowNull: true },
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
  GeopoliticaEvento.TIPOS = TIPOS;

  GeopoliticaEvento.associate = (db) => {
    GeopoliticaEvento.belongsTo(db.GeopoliticaLeitura, { foreignKey: "leitura_id", as: "leitura" });
  };

  return GeopoliticaEvento;
};
