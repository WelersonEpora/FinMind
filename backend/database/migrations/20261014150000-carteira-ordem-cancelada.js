"use strict";

// Carteiras virtuais (ADR 0127), etapa 6: o diário do operador. Uma ordem dele que ainda aguarda a liquidação pode ser
// cancelada (a operação planejada, §7): a situação CANCELADA entra na `carteira_ordem`. A linha fica (com quem e quando
// em `detalhes`), nunca é apagada.
//
// Escopo: nenhuma tabela nova (a `carteira_ordem` é PRIVADA, ADR 0007, §3).

const SITUACOES_ANTES = "('CRIADA', 'EXECUTADA', 'EXPIRADA', 'REJEITADA')";
const SITUACOES_DEPOIS = "('CRIADA', 'EXECUTADA', 'EXPIRADA', 'REJEITADA', 'CANCELADA')";

async function trocar(queryInterface, situacoes) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const sql = (texto) => queryInterface.sequelize.query(texto, { transaction });
    await sql("ALTER TABLE carteira_ordem DROP CONSTRAINT ck_carteira_ordem_situacao");
    await sql(`ALTER TABLE carteira_ordem ADD CONSTRAINT ck_carteira_ordem_situacao CHECK (situacao IN ${situacoes})`);
  });
}

module.exports = {
  async up(queryInterface) {
    await trocar(queryInterface, SITUACOES_DEPOIS);
  },

  async down(queryInterface) {
    await trocar(queryInterface, SITUACOES_ANTES);
  }
};
