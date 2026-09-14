"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("market_quote", {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true
      },
      // Código do instrumento (ex.: "USD_BRL") - genérico de propósito, pra
      // não exigir uma tabela de ativos antes das definições do David.
      instrument_code: {
        type: Sequelize.STRING(30),
        allowNull: false
      },
      // Código da fonte/série (ex.: "BCB_SGS_1").
      source_code: {
        type: Sequelize.STRING(30),
        allowNull: false
      },
      // "venda" | "compra" - permite adicionar a série de compra (SGS 10813)
      // no futuro sem alterar o esquema.
      modality: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "venda"
      },
      // Granularidade diária (a fonte inicial, BCB SGS, é um fechamento
      // diário, não intradiário) - ver docs/adr/0003-persistencia-coletas.md.
      reference_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      value: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false
      },
      unit: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: "BRL"
      },
      collection_execution_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "collection_execution", key: "id" }
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

    // Chave natural (dedup/upsert) - prefixo (instrument_code, reference_date)
    // também serve às consultas de histórico por instrumento+período.
    await queryInterface.addIndex("market_quote", ["instrument_code", "reference_date", "source_code", "modality"], {
      name: "idx_market_quote_natural_key",
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("market_quote");
  }
};
