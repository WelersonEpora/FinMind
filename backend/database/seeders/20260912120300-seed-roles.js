"use strict";

const { randomUUID } = require("node:crypto");

const ROLES = ["admin", "viewer"];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const existing = await queryInterface.sequelize.query("SELECT name FROM role", {
      type: queryInterface.sequelize.QueryTypes.SELECT
    });
    const existingNames = new Set(existing.map((row) => row.name));

    const rows = ROLES.filter((name) => !existingNames.has(name)).map((name) => ({
      id: randomUUID(),
      name,
      created_at: now,
      updated_at: now
    }));

    if (rows.length > 0) {
      await queryInterface.bulkInsert("role", rows);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("role", { name: ROLES });
  }
};
