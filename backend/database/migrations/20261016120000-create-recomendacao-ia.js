"use strict";

// Carteiras virtuais (ADR 0127, adendo de 2026-10-16): a recomendação da IA COMPARTILHADA. A entrada da recomendação só
// tem dado global (as leituras e os eventos do dia; nenhum estado de trilha, D8), então carteiras com os mesmos ativos
// mandam o mesmo prompt no mesmo dia: a chamada é feita uma vez e cada carteira guarda a cópia dela.
//
// `recomendacao_ia`: o registro de cada chamada (a principal do dia e a réplica semanal), com o que foi à IA e o que
// voltou, no mesmo formato da `carteira_recomendacao`, mais `ativos` (a combinação, em ordem alfabética). Append-only:
// uma falha fica registrada e uma nova tentativa vira outra linha. Só uma VALIDA por chave (data, tipo, hash da
// entrada, versão do prompt e modelo): é a que as carteiras reaproveitam.
//
// Escopo: GLOBAL (ADR 0007, §3) - a entrada e a resposta são dado de mercado; nunca ganha workspace_id.
//
// `carteira_recomendacao.recomendacao_ia_id` (PRIVADA, como a tabela): a chamada de que a cópia veio. Nula nas linhas de
// antes deste adendo e quando nada foi à IA (sem leituras, sem modelo fixado, sem a chave paga).

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, DATEONLY, STRING, DECIMAL, JSONB, TEXT } = Sequelize;
    await queryInterface.sequelize.transaction(async (transaction) => {
      const sql = (texto) => queryInterface.sequelize.query(texto, { transaction });
      await queryInterface.createTable(
        "recomendacao_ia",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          data: { type: DATEONLY, allowNull: false },
          tipo: { type: STRING(10), allowNull: false },
          ativos: { type: STRING(120), allowNull: false },
          situacao: { type: STRING(10), allowNull: false },
          motivo_falha: { type: STRING(40), allowNull: true },
          versao_prompt: { type: STRING(60), allowNull: false },
          modelo_pedido: { type: STRING(80), allowNull: false },
          modelo_devolvido: { type: STRING(80), allowNull: true },
          hash_entrada: { type: STRING(64), allowNull: false },
          entrada: { type: JSONB, allowNull: false },
          instrucao: { type: TEXT, allowNull: false },
          prompt: { type: TEXT, allowNull: false },
          respostas: { type: JSONB, allowNull: false },
          recomendacoes: { type: JSONB, allowNull: true },
          contrarias: { type: JSONB, allowNull: true },
          tokens: { type: JSONB, allowNull: true },
          custo_usd: { type: DECIMAL(12, 6), allowNull: true },
          tentativas: { type: JSONB, allowNull: false },
          detalhes: { type: JSONB, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await sql(`ALTER TABLE recomendacao_ia
        ADD CONSTRAINT ck_recomendacao_ia_tipo CHECK (tipo IN ('PRINCIPAL', 'REPLICA')),
        ADD CONSTRAINT ck_recomendacao_ia_situacao CHECK (situacao IN ('VALIDA', 'FALHA')),
        ADD CONSTRAINT ck_recomendacao_ia_valida CHECK (situacao <> 'VALIDA' OR recomendacoes IS NOT NULL)`);
      await sql(`CREATE UNIQUE INDEX uq_recomendacao_ia_valida ON recomendacao_ia (data, tipo, hash_entrada, versao_prompt, modelo_pedido)
        WHERE situacao = 'VALIDA'`);
      await queryInterface.addIndex("recomendacao_ia", ["tipo", "ativos", "data"], { name: "ix_recomendacao_ia_tipo_ativos_data", transaction });

      await queryInterface.addColumn("carteira_recomendacao", "recomendacao_ia_id", { type: UUID, allowNull: true }, { transaction });
      await sql(`ALTER TABLE carteira_recomendacao
        ADD CONSTRAINT fk_carteira_recomendacao_recomendacao_ia FOREIGN KEY (recomendacao_ia_id) REFERENCES recomendacao_ia (id) ON DELETE RESTRICT ON UPDATE RESTRICT`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("carteira_recomendacao", "recomendacao_ia_id", { transaction });
      await queryInterface.dropTable("recomendacao_ia", { transaction });
    });
  }
};
