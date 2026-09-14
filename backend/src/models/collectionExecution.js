"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

const TRIGGER_TYPES = ["manual", "script"];
const STATUSES = ["running", "success", "partial_success", "failed"];

module.exports = (sequelize) => {
  const CollectionExecution = sequelize.define(
    "CollectionExecution",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      collector_code: {
        type: DataTypes.STRING(60),
        allowNull: false
      },
      trigger_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [TRIGGER_TYPES] }
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "running",
        validate: { isIn: [STATUSES] }
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      finished_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      records_read: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_created: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_updated: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_skipped: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_failed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      triggered_by: {
        type: DataTypes.UUID,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true
      }
    },
    {
      tableName: "collection_execution",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  CollectionExecution.TRIGGER_TYPE = Object.fromEntries(TRIGGER_TYPES.map((v) => [v.toUpperCase(), v]));
  CollectionExecution.STATUS = Object.fromEntries(STATUSES.map((v) => [v.toUpperCase(), v]));

  CollectionExecution.associate = (db) => {
    CollectionExecution.hasMany(db.MarketQuote, { foreignKey: "collection_execution_id", as: "cotacoes" });
    CollectionExecution.belongsTo(db.User, { foreignKey: "triggered_by", as: "usuarioDisparo" });
  };

  return CollectionExecution;
};
