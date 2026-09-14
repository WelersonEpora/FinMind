"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

const MODALITIES = ["venda", "compra"];

module.exports = (sequelize) => {
  const MarketQuote = sequelize.define(
    "MarketQuote",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      instrument_code: {
        type: DataTypes.STRING(30),
        allowNull: false
      },
      source_code: {
        type: DataTypes.STRING(30),
        allowNull: false
      },
      modality: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "venda",
        validate: { isIn: [MODALITIES] }
      },
      reference_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      value: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false
      },
      unit: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "BRL"
      },
      collection_execution_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true
      }
    },
    {
      tableName: "market_quote",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  MarketQuote.MODALITY = Object.fromEntries(MODALITIES.map((v) => [v.toUpperCase(), v]));

  MarketQuote.associate = (db) => {
    MarketQuote.belongsTo(db.CollectionExecution, { foreignKey: "collection_execution_id", as: "execucao" });
  };

  return MarketQuote;
};
