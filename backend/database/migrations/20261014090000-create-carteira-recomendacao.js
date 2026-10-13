"use strict";

// Carteiras virtuais (ADR 0127), etapa 4: a recomendação diária da IA de cada carteira (§4).
//
// Escopo: PRIVADA (ADR 0007, §3 e §6) - do espaço, com `workspace_id`; aponta para a rodada pela FK composta
// (workspace_id, rodada_id) e ON DELETE RESTRICT. Nenhum dado privado vai ao prompt (a entrada só tem dado global), mas
// a recomendação é da carteira: fica no espaço.
//
// Append-only: uma linha por rodada e tipo (PRINCIPAL, a que decide; REPLICA, a réplica semanal que só mede a
// consistência), gravada com a rodada, na mesma transação. Guarda o que foi à IA e o que voltou: a entrada (e o hash),
// a instrução e o prompt como foram, cada resposta bruta com os erros dela, o modelo pedido e o devolvido, os tokens por
// tipo, o custo e as tentativas. FALHA: duas respostas inválidas, o Gemini fora, o modelo não fixado, sem a chave paga
// ou sem leituras; a trilha IA fica no fallback "manter".

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, DATEONLY, STRING, DECIMAL, JSONB, TEXT } = Sequelize;
    await queryInterface.sequelize.transaction(async (transaction) => {
      const sql = (texto) => queryInterface.sequelize.query(texto, { transaction });
      await queryInterface.createTable(
        "carteira_recomendacao",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          rodada_id: { type: UUID, allowNull: false },
          data: { type: DATEONLY, allowNull: false },
          tipo: { type: STRING(10), allowNull: false },
          situacao: { type: STRING(10), allowNull: false },
          motivo_falha: { type: STRING(40), allowNull: true },
          versao_prompt: { type: STRING(60), allowNull: true },
          modelo_pedido: { type: STRING(80), allowNull: true },
          modelo_devolvido: { type: STRING(80), allowNull: true },
          hash_entrada: { type: STRING(64), allowNull: true },
          entrada: { type: JSONB, allowNull: true },
          instrucao: { type: TEXT, allowNull: true },
          prompt: { type: TEXT, allowNull: true },
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
      await queryInterface.addConstraint("carteira_recomendacao", { fields: ["rodada_id", "tipo"], type: "unique", name: "uq_carteira_recomendacao_rodada_tipo", transaction });
      await sql(`ALTER TABLE carteira_recomendacao
        ADD CONSTRAINT fk_carteira_recomendacao_rodada FOREIGN KEY (workspace_id, rodada_id) REFERENCES carteira_rodada (workspace_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        ADD CONSTRAINT ck_carteira_recomendacao_tipo CHECK (tipo IN ('PRINCIPAL', 'REPLICA')),
        ADD CONSTRAINT ck_carteira_recomendacao_situacao CHECK (situacao IN ('VALIDA', 'FALHA')),
        ADD CONSTRAINT ck_carteira_recomendacao_valida CHECK (situacao <> 'VALIDA' OR recomendacoes IS NOT NULL)`);
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("carteira_recomendacao");
  }
};
