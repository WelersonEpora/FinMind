"use strict";

const { randomUUID } = require("node:crypto");

// docs/adr/0007-escopo-de-dados-global-espaco-usuario.md - fundação de
// "Espaço" (workspace): fronteira de propriedade dos futuros dados privados.
// Escopo das tabelas criadas aqui: nenhuma das duas é dado de mercado nem
// dado privado de um espaço - são a própria estrutura de vínculo.
//
// Nome fixo copiado de propósito (migration é histórico congelado, não pode
// depender do código da aplicação, que pode mudar depois).
const PERSONAL_WORKSPACE_NAME = "Espaço pessoal";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workspace", {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      // Preenchido só no espaço pessoal do usuário - marca qual é e, com o
      // índice único abaixo, faz o banco garantir "no máximo um espaço
      // pessoal por usuário" (NULL repetido é permitido em índice único).
      personal_user_id: {
        type: Sequelize.CHAR(36),
        allowNull: true,
        references: { model: "user", key: "id" }
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

    await queryInterface.addIndex("workspace", ["personal_user_id"], {
      name: "uq_workspace_personal_user_id",
      unique: true
    });

    await queryInterface.createTable("workspace_member", {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true
      },
      workspace_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "workspace", key: "id" },
        onDelete: "CASCADE"
      },
      // Sem ON DELETE CASCADE de propósito: apagar um usuário não pode
      // apagar vínculos (e, futuramente, dado patrimonial) em silêncio.
      user_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "user", key: "id" }
      },
      // Papel DENTRO do espaço (owner | editor | viewer) - não tem relação
      // com user.role, que é papel de plataforma. Menor privilégio como
      // default.
      role: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "viewer"
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

    // Sem UNIQUE(user_id): um usuário pode participar de vários espaços.
    await queryInterface.addIndex("workspace_member", ["workspace_id", "user_id"], {
      name: "uq_workspace_member_workspace_user",
      unique: true
    });
    await queryInterface.addIndex("workspace_member", ["user_id"], { name: "idx_workspace_member_user_id" });

    // Precisa ficar em sincronia manual com WorkspaceMember.ROLE (model).
    await queryInterface.sequelize.query(
      "ALTER TABLE workspace_member ADD CONSTRAINT ck_workspace_member_role CHECK (role IN ('owner', 'editor', 'viewer'))"
    );

    // Backfill: todo usuário existente ganha um espaço pessoal e vira seu
    // owner. Numa transação só - ou todos ganham, ou nenhum.
    const users = await queryInterface.sequelize.query("SELECT id FROM user", {
      type: queryInterface.sequelize.QueryTypes.SELECT
    });

    if (users.length === 0) return;

    const now = new Date();
    const workspaces = users.map((user) => ({
      id: randomUUID(),
      name: PERSONAL_WORKSPACE_NAME,
      personal_user_id: user.id,
      created_at: now,
      updated_at: now
    }));
    const members = workspaces.map((workspace) => ({
      id: randomUUID(),
      workspace_id: workspace.id,
      user_id: workspace.personal_user_id,
      role: "owner",
      created_at: now,
      updated_at: now
    }));

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkInsert("workspace", workspaces, { transaction });
      await queryInterface.bulkInsert("workspace_member", members, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workspace_member");
    await queryInterface.dropTable("workspace");
  }
};
