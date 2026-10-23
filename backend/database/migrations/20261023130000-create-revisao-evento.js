"use strict";

// A revisão imediata com evento de magnitude 3 (§6 da análise do café de 2026-10-19; aprovada pelo Comitê em 2026-10-22;
// ADR 0149): cada evento ACEITO de grau ALTA do café, na leitura diária de eventos, pede a revisão de uma pessoa (os
// fatores e as regras diante do fato). Os pendentes são calculados dos eventos; esta tabela guarda só a revisão feita.
//
// `revisao_evento`: uma revisão por evento. `chave` é a chave natural do evento (o ativo, a data da leitura e o título):
// a leitura do dia pode ser refeita e trocar os ids dos eventos, então a revisão não aponta para o id. `evento` guarda a
// cópia do evento revisado (o título, o tipo, a pressão e as fontes).
//
// Escopo: GLOBAL (ADR 0007, §3) - a revisão é sobre dado de mercado e vale para todos; nunca ganha workspace_id.
// Gravar é só de admin de plataforma; `revisado_por` diz quem revisou.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, DATEONLY, STRING, JSONB, TEXT, DATE } = Sequelize;
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "revisao_evento",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          ativo: { type: STRING(20), allowNull: false },
          data: { type: DATEONLY, allowNull: false },
          chave: { type: STRING(400), allowNull: false },
          evento: { type: JSONB, allowNull: false },
          observacao: { type: TEXT, allowNull: true },
          revisado_por: { type: UUID, allowNull: true },
          revisado_em: { type: DATE, allowNull: false },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await queryInterface.sequelize.query("ALTER TABLE revisao_evento ADD CONSTRAINT ck_revisao_evento_ativo CHECK (ativo IN ('CAFE'))", {
        transaction
      });
      await queryInterface.addIndex("revisao_evento", ["chave"], { name: "uq_revisao_evento_chave", unique: true, transaction });
      await queryInterface.addConstraint("revisao_evento", {
        fields: ["revisado_por"],
        type: "foreign key",
        name: "fk_revisao_evento_revisado_por",
        references: { table: "user", field: "id" },
        onDelete: "SET NULL",
        transaction
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("revisao_evento");
  }
};
