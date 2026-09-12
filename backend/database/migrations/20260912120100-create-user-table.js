"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user", {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true
      },
      email: {
        type: Sequelize.STRING(180),
        allowNull: false,
        unique: true
      },
      password_hash: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      role_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "role", key: "id" }
      },
      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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

    await queryInterface.addIndex("user", ["role_id"], { name: "idx_user_role_id" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user");
  }
};
