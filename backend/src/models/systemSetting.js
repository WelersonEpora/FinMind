"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const SystemSetting = sequelize.define(
    "SystemSetting",
    {
      key: {
        type: DataTypes.STRING(80),
        primaryKey: true,
        allowNull: false
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    },
    {
      tableName: "system_setting",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  return SystemSetting;
};
