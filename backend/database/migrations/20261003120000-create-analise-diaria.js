"use strict";

// Leitura diária de tendência da IA (ADR 0052): o prompt diário do ativo (ADR 0051) enviado ao Gemini, sem busca, com
// a resposta em JSON nos quatro horizontes. UMA leitura por ativo e dia; reexecutar o dia (ANALISE_DIARIA_REFAZER=1)
// substitui a do dia, numa transação. Guarda o que o ADR 0010 pede para reconstituir "o que a IA recebeu": as versões
// (prompt, metodologia, configuração), o hash, a entrada estruturada, a instrução e o prompt enviados, a resposta
// bruta, o modelo e a chave.
//
// Escopo: GLOBAL (ADR 0007, §3) - é leitura de mercado, nunca ganha workspace_id.
//
// Não é point-in-time (ADR 0008): a leitura é feita uma vez, com o que se sabia no momento (o prompt já é montado
// point-in-time); não há revisão de fonte a versionar.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "analise_diaria",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          ativo: { type: Sequelize.STRING(20), allowNull: false },
          data_analise: { type: Sequelize.DATEONLY, allowNull: false },
          versao_prompt: { type: Sequelize.STRING(60), allowNull: false },
          versao_metodologia: { type: Sequelize.STRING(80), allowNull: false },
          versao_configuracao: { type: Sequelize.INTEGER, allowNull: false },
          // SHA-256 da instrução do sistema + prompt: a mesma entrada dá o mesmo hash.
          hash_entrada: { type: Sequelize.STRING(64), allowNull: false },
          // O preço de referência, os horizontes e as faixas, e por fator: cálculo, versão, parâmetros e leitura C.
          entrada: { type: Sequelize.JSONB, allowNull: false },
          instrucao_sistema: { type: Sequelize.TEXT, allowNull: false },
          prompt: { type: Sequelize.TEXT, allowNull: false },
          resposta_bruta: { type: Sequelize.TEXT, allowNull: false },
          // As quatro leituras validadas (IMEDIATO, CURTO, MEDIO, LONGO), como a IA as escreveu.
          leituras: { type: Sequelize.JSONB, allowNull: false },
          modelo: { type: Sequelize.STRING(80), allowNull: false },
          tokens: { type: Sequelize.INTEGER, allowNull: true },
          // Chave do Gemini que respondeu: "gratuita" ou "paga".
          chave: { type: Sequelize.STRING(10), allowNull: false },
          collection_execution_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "collection_execution", key: "id" }
          },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await queryInterface.addIndex("analise_diaria", ["ativo", "data_analise"], {
        name: "uq_analise_diaria_ativo_data",
        unique: true,
        transaction
      });
      await queryInterface.sequelize.query(
        "ALTER TABLE analise_diaria ADD CONSTRAINT ck_analise_diaria_chave CHECK (chave IN ('gratuita', 'paga'))",
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("analise_diaria");
  }
};
