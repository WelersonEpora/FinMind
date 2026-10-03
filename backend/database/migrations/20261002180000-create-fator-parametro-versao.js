"use strict";

// Parâmetros da camada C (decisão simulada) de cada fator calculado na tela de metodologia (ADR 0050): os valores em
// uso no sistema, ajustáveis pelo admin na própria tela. Cada ajuste é uma VERSÃO nova, nunca um UPDATE: guarda quem
// mudou, quando e por quê, e permite saber que parâmetros valiam numa data (o mesmo princípio point-in-time da
// observation, ADR 0008). Sem nenhuma versão gravada, valem os padrões do código do fator.
//
// Escopo: GLOBAL (ADR 0007, §3) - parâmetro de fator de mercado, igual para todos; nunca ganha workspace_id.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "fator_parametro_versao",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          // Código do fator no FEL 1 (`shared/fatores-fel1.js`), ex.: PETROLEO_ESTOQUES_EIA.
          fator_codigo: { type: Sequelize.STRING(64), allowNull: false },
          // 1, 2, 3... por fator.
          versao: { type: Sequelize.INTEGER, allowNull: false },
          // Os parâmetros completos da versão, como o fator os recebe (validados pelo service antes de gravar).
          parametros: { type: Sequelize.JSONB, allowNull: false },
          motivo: { type: Sequelize.TEXT, allowNull: false },
          alterado_por: { type: Sequelize.UUID, allowNull: false, references: { model: "user", key: "id" } },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await queryInterface.addIndex("fator_parametro_versao", ["fator_codigo", "versao"], {
        name: "uq_fator_parametro_versao",
        unique: true,
        transaction
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("fator_parametro_versao");
  }
};
