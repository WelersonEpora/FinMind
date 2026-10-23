"use strict";

// Teste de captura dos eventos (ADR 0144; análise do café de 2026-10-19, item E2, aprovado pelo Comitê em 2026-10-22):
// a lista de eventos de referência dos agrícolas (milho, café e soja), o gabarito contra o qual se mede se a leitura
// diária de eventos captura 80% dos eventos relevantes num período de 30 dias.
//
// `evento_referencia`: um candidato por linha. O FinMind gera os candidatos por gatilhos objetivos, sem a IA de eventos
// (a publicação de um relatório, um movimento grande do preço e, à parte, o alerta de fonte secundária), e o usuário
// adiciona os seus (MANUAL). Quem julga é uma pessoa: `relevante` (null enquanto não avaliado) e, nos relevantes,
// `captura` (o evento aceito da leitura que o cobre fica em `captura_evento`, uma cópia: a leitura do dia pode ser
// refeita e trocar os ids dos eventos). `chave` é a chave natural do candidato gerado: gerar de novo não duplica nem
// apaga a avaliação.
//
// Escopo: GLOBAL (ADR 0007, §3) - a avaliação é sobre dado de mercado e vale para todos; nunca ganha workspace_id.
// Gravar é só de admin de plataforma; `avaliado_por` diz quem avaliou.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, DATEONLY, STRING, BOOLEAN, JSONB, TEXT, DATE } = Sequelize;
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "evento_referencia",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          ativo: { type: STRING(20), allowNull: false },
          data: { type: DATEONLY, allowNull: false },
          origem: { type: STRING(20), allowNull: false },
          chave: { type: STRING(200), allowNull: false },
          titulo: { type: STRING(300), allowNull: false },
          detalhe: { type: JSONB, allowNull: true },
          relevante: { type: BOOLEAN, allowNull: true },
          captura: { type: STRING(20), allowNull: true },
          captura_evento: { type: JSONB, allowNull: true },
          observacao: { type: TEXT, allowNull: true },
          avaliado_por: { type: UUID, allowNull: true },
          avaliado_em: { type: DATE, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE evento_referencia
          ADD CONSTRAINT ck_evento_referencia_ativo CHECK (ativo IN ('MILHO', 'CAFE', 'SOJA')),
          ADD CONSTRAINT ck_evento_referencia_origem CHECK (origem IN ('CALENDARIO', 'PRECO', 'SECUNDARIA', 'MANUAL')),
          ADD CONSTRAINT ck_evento_referencia_captura CHECK (captura IS NULL OR captura IN ('CAPTURADO', 'NAO_CAPTURADO')),
          ADD CONSTRAINT ck_evento_referencia_captura_relevante CHECK (captura IS NULL OR relevante IS TRUE)`,
        { transaction }
      );
      await queryInterface.addIndex("evento_referencia", ["chave"], { name: "uq_evento_referencia_chave", unique: true, transaction });
      await queryInterface.addIndex("evento_referencia", ["ativo", "data"], { name: "ix_evento_referencia_ativo_data", transaction });
      await queryInterface.addConstraint("evento_referencia", {
        fields: ["avaliado_por"],
        type: "foreign key",
        name: "fk_evento_referencia_avaliado_por",
        references: { table: "user", field: "id" },
        onDelete: "SET NULL",
        transaction
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("evento_referencia");
  }
};
