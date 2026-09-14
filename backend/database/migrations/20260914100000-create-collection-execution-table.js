"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("collection_execution", {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true
      },
      collector_code: {
        type: Sequelize.STRING(60),
        allowNull: false
      },
      trigger_type: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "running"
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      records_read: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_created: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_updated: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_skipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_failed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      triggered_by: {
        type: Sequelize.CHAR(36),
        allowNull: true,
        references: { model: "user", key: "id" }
      },
      metadata: {
        type: Sequelize.JSON,
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

    await queryInterface.addIndex("collection_execution", ["collector_code", "started_at"], {
      name: "idx_collection_execution_collector_started"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("collection_execution");
  }
};
