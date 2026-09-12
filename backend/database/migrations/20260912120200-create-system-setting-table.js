"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("system_setting", {
      key: {
        type: Sequelize.STRING(80),
        allowNull: false,
        primaryKey: true
      },
      value: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP")
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP")
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("system_setting");
  }
};
