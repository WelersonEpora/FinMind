"use strict";

// Linha de base do schema no PostgreSQL (docs/adr/0026-postgresql-como-banco.md): cria de uma vez o schema que
// as 13 migrations do MariaDB (database/migrations) produziram até 2026-09-24, sem repetir o histórico de
// correções delas. Migrations do Postgres a partir daqui entram nesta pasta, depois deste arquivo.
//
// Escopo das tabelas (ADR 0007, §3):
// - GLOBAL: collection_execution, market_quote, observation, system_setting (dado de mercado e da plataforma;
//   nunca ganham workspace_id).
// - USER: user.
// - Estrutura de vínculo (nem dado de mercado nem dado privado): workspace, workspace_member.
//
// Diferenças deliberadas em relação ao MariaDB:
// - ids em `uuid` nativo (lá, CHAR(36)); continuam gerados na aplicação (crypto.randomUUID()).
// - DATETIME vira `timestamptz` (Sequelize.DATE), gravado e lido em UTC como antes.
// - JSON vira `jsonb`.
// - e-mail único sem distinção de maiúsculas por índice em lower(email): o MariaDB fazia isso pela collation.
// - sem índice nas colunas de FK para collection_execution (o InnoDB criava um sozinho): nenhuma consulta filtra
//   por elas e ninguém apaga uma execução. A FK continua valendo.
// - "user" é palavra reservada no Postgres: o queryInterface já põe aspas; SQL escrito à mão precisa pôr.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };

      await queryInterface.createTable(
        "user",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          email: { type: Sequelize.STRING(180), allowNull: false },
          password_hash: { type: Sequelize.STRING(100), allowNull: false },
          name: { type: Sequelize.STRING(120), allowNull: false },
          active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          // Papel de PLATAFORMA (admin | user); o papel dentro de um espaço fica em workspace_member.role.
          role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "user" },
          photo_path: { type: Sequelize.STRING(255), allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.sequelize.query('CREATE UNIQUE INDEX uq_user_email_lower ON "user" (lower(email))', opcoes);

      await queryInterface.createTable(
        "system_setting",
        {
          key: { type: Sequelize.STRING(80), allowNull: false, primaryKey: true },
          value: { type: Sequelize.TEXT, allowNull: true },
          description: { type: Sequelize.STRING(255), allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );

      await queryInterface.createTable(
        "collection_execution",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          collector_code: { type: Sequelize.STRING(60), allowNull: false },
          trigger_type: { type: Sequelize.STRING(20), allowNull: false },
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "running" },
          started_at: { type: Sequelize.DATE, allowNull: false },
          finished_at: { type: Sequelize.DATE, allowNull: true },
          records_read: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          records_created: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          records_updated: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          records_skipped: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          records_failed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          duration_ms: { type: Sequelize.INTEGER, allowNull: true },
          error_message: { type: Sequelize.TEXT, allowNull: true },
          triggered_by: { type: Sequelize.UUID, allowNull: true, references: { model: "user", key: "id" } },
          metadata: { type: Sequelize.JSONB, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.addIndex("collection_execution", ["collector_code", "started_at"], {
        name: "idx_collection_execution_collector_started",
        transaction
      });

      await queryInterface.createTable(
        "market_quote",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          instrument_code: { type: Sequelize.STRING(30), allowNull: false },
          source_code: { type: Sequelize.STRING(30), allowNull: false },
          modality: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "venda" },
          reference_date: { type: Sequelize.DATEONLY, allowNull: false },
          value: { type: Sequelize.DECIMAL(18, 6), allowNull: false },
          unit: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "BRL" },
          collection_execution_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "collection_execution", key: "id" }
          },
          metadata: { type: Sequelize.JSONB, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      // Chave natural (ADR 0003): dedup/upsert da coleta.
      await queryInterface.addIndex("market_quote", ["instrument_code", "reference_date", "source_code", "modality"], {
        name: "idx_market_quote_natural_key",
        unique: true,
        transaction
      });

      // Append-only (ADR 0008): revisão da fonte = linha nova.
      await queryInterface.createTable(
        "observation",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          series_code: { type: Sequelize.STRING(120), allowNull: false },
          observed_at: { type: Sequelize.DATEONLY, allowNull: false },
          published_at: { type: Sequelize.DATE, allowNull: false },
          collected_at: { type: Sequelize.DATE, allowNull: false },
          value: { type: Sequelize.DECIMAL(18, 6), allowNull: false },
          unit: { type: Sequelize.STRING(20), allowNull: false },
          source_code: { type: Sequelize.STRING(64), allowNull: false },
          published_at_is_estimated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          revision_seq: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          collection_execution_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "collection_execution", key: "id" }
          },
          metadata: { type: Sequelize.JSONB, allowNull: true }
        },
        opcoes
      );
      await queryInterface.addIndex("observation", ["series_code", "observed_at", "published_at"], {
        name: "uk_pit",
        unique: true,
        transaction
      });
      await queryInterface.addIndex("observation", ["series_code", "published_at"], {
        name: "idx_observation_series_published",
        transaction
      });
      await queryInterface.addIndex("observation", ["series_code", "source_code", "observed_at", "published_at_is_estimated"], {
        name: "idx_observation_resumo",
        transaction
      });
      await queryInterface.addIndex("observation", ["source_code", "series_code", "published_at"], {
        name: "idx_observation_source_series_published",
        transaction
      });

      await queryInterface.createTable(
        "workspace",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          name: { type: Sequelize.STRING(120), allowNull: false },
          // Preenchido só no espaço pessoal: com o índice único, no máximo um espaço pessoal por usuário.
          personal_user_id: { type: Sequelize.UUID, allowNull: true, references: { model: "user", key: "id" } },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.addIndex("workspace", ["personal_user_id"], {
        name: "uq_workspace_personal_user_id",
        unique: true,
        transaction
      });

      await queryInterface.createTable(
        "workspace_member",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          workspace_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "workspace", key: "id" },
            onDelete: "CASCADE"
          },
          // Sem ON DELETE CASCADE de propósito: apagar um usuário não apaga vínculos em silêncio.
          user_id: { type: Sequelize.UUID, allowNull: false, references: { model: "user", key: "id" } },
          role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "viewer" },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.addIndex("workspace_member", ["workspace_id", "user_id"], {
        name: "uq_workspace_member_workspace_user",
        unique: true,
        transaction
      });
      await queryInterface.addIndex("workspace_member", ["user_id"], { name: "idx_workspace_member_user_id", transaction });
      // Em sincronia manual com WorkspaceMember.ROLE (model).
      await queryInterface.sequelize.query(
        "ALTER TABLE workspace_member ADD CONSTRAINT ck_workspace_member_role CHECK (role IN ('owner', 'editor', 'viewer'))",
        opcoes
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const tabela of ["workspace_member", "workspace", "observation", "market_quote", "collection_execution", "system_setting", "user"]) {
        await queryInterface.dropTable(tabela, { transaction });
      }
    });
  }
};
