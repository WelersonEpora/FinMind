"use strict";

// Simplifica o modelo de papéis: sai a tabela `role` + `user.role_id` (FK),
// entra uma coluna `role` direto em `user` (string, owner/colaborador) -
// mesmo padrão já usado no Personal-Assistant (models/membro.js), adotado
// aqui porque, nesta fase, nenhuma rota faz enforcement de autorização por
// papel - uma tabela separada com FK não paga o próprio custo ainda.
// admin -> owner, viewer -> colaborador (equivalência 1:1, sem perda de
// dado para quem já tinha usuário seedado).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("user", "role", {
      type: Sequelize.STRING(20),
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      UPDATE user u
      JOIN role r ON r.id = u.role_id
      SET u.role = CASE r.name
        WHEN 'admin' THEN 'owner'
        WHEN 'viewer' THEN 'colaborador'
        ELSE 'colaborador'
      END
    `);

    await queryInterface.changeColumn("user", "role", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "colaborador"
    });

    // MariaDB recusa dropar o índice/coluna enquanto a FK que depende dele
    // existir - nome da constraint é autogerado (varia por ambiente), então
    // é preciso descobrir em vez de supor um nome fixo (ex.: "user_ibfk_1").
    const [fk] = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'role_id'
         AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    if (fk) {
      await queryInterface.sequelize.query(`ALTER TABLE user DROP FOREIGN KEY \`${fk.name}\``);
    }

    await queryInterface.removeIndex("user", "idx_user_role_id");
    await queryInterface.removeColumn("user", "role_id");
    await queryInterface.dropTable("role");
  },

  async down(queryInterface, Sequelize) {
    const { randomUUID } = require("node:crypto");

    await queryInterface.createTable("role", {
      id: { type: Sequelize.CHAR(36), allowNull: false, primaryKey: true },
      name: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") }
    });

    const now = new Date();
    const adminId = randomUUID();
    const viewerId = randomUUID();

    await queryInterface.bulkInsert("role", [
      { id: adminId, name: "admin", created_at: now, updated_at: now },
      { id: viewerId, name: "viewer", created_at: now, updated_at: now }
    ]);

    await queryInterface.addColumn("user", "role_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
      references: { model: "role", key: "id" }
    });

    await queryInterface.sequelize.query(
      `UPDATE user SET role_id = CASE role WHEN 'owner' THEN :adminId ELSE :viewerId END`,
      { replacements: { adminId, viewerId } }
    );

    await queryInterface.changeColumn("user", "role_id", {
      type: Sequelize.CHAR(36),
      allowNull: false
    });

    await queryInterface.addIndex("user", ["role_id"], { name: "idx_user_role_id" });
    await queryInterface.removeColumn("user", "role");
  }
};
