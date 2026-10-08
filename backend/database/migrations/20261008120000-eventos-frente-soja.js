"use strict";

// Eventos de mercado da soja (fase 1 da soja, só aquisição, ADR 0115): uma leitura diária PRÓPRIA da soja, nas mesmas
// tabelas, sem tocar na leitura dos quatro ativos validados (ADR 0108). O que muda:
//   - geopolitica_leitura ganha a `frente` ('PRINCIPAL' = a leitura de ouro, petróleo, milho e café, que já existia;
//     'SOJA' = a nova). A chave única passa de (data_referencia) a (data_referencia, frente): cada frente tem uma
//     leitura por dia, e refazer uma não apaga a outra.
//   - nivel_ouro e nivel_petroleo deixam de ser NOT NULL (a leitura da soja não os tem), com um CHECK que mantém a
//     obrigação na leitura principal; entram nivel_soja e resumo_soja, obrigatório o nível na leitura da soja.
//   - geopolitica_evento: o ativo aceita SOJA.
//
// Escopo: GLOBAL (ADR 0007, §3), como as tabelas de origem.

const NIVEIS = "('NORMAL', 'ATENCAO', 'RELEVANTE', 'EXCEPCIONAL')";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };
      const sql = (texto) => queryInterface.sequelize.query(texto, opcoes);

      await queryInterface.addColumn(
        "geopolitica_leitura",
        "frente",
        { type: Sequelize.STRING(20), allowNull: false, defaultValue: "PRINCIPAL" },
        opcoes
      );
      await sql("ALTER TABLE geopolitica_leitura ALTER COLUMN frente DROP DEFAULT");
      await sql("ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_frente CHECK (frente IN ('PRINCIPAL', 'SOJA'))");
      await sql("DROP INDEX uq_geopolitica_leitura_data");
      await sql("CREATE UNIQUE INDEX uq_geopolitica_leitura_data_frente ON geopolitica_leitura (data_referencia, frente)");

      await sql("ALTER TABLE geopolitica_leitura ALTER COLUMN nivel_ouro DROP NOT NULL");
      await sql("ALTER TABLE geopolitica_leitura ALTER COLUMN nivel_petroleo DROP NOT NULL");
      await sql(
        "ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_principal CHECK (frente <> 'PRINCIPAL' OR (nivel_ouro IS NOT NULL AND nivel_petroleo IS NOT NULL))"
      );

      await queryInterface.addColumn("geopolitica_leitura", "nivel_soja", { type: Sequelize.STRING(20), allowNull: true }, opcoes);
      await queryInterface.addColumn("geopolitica_leitura", "resumo_soja", { type: Sequelize.TEXT, allowNull: true }, opcoes);
      await sql(`ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_nivel_soja CHECK (nivel_soja IN ${NIVEIS})`);
      await sql("ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_soja CHECK (frente <> 'SOJA' OR nivel_soja IS NOT NULL)");

      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_ativo");
      await sql("ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_ativo CHECK (ativo IN ('OURO', 'PETROLEO', 'MILHO', 'CAFE', 'SOJA'))");
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };
      const sql = (texto) => queryInterface.sequelize.query(texto, opcoes);

      await sql("DELETE FROM geopolitica_evento WHERE ativo = 'SOJA'");
      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_ativo");
      await sql("ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_ativo CHECK (ativo IN ('OURO', 'PETROLEO', 'MILHO', 'CAFE'))");

      await sql("DELETE FROM geopolitica_evento WHERE leitura_id IN (SELECT id FROM geopolitica_leitura WHERE frente = 'SOJA')");
      await sql("DELETE FROM geopolitica_leitura WHERE frente = 'SOJA'");
      await sql("ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_soja");
      await sql("ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_nivel_soja");
      await queryInterface.removeColumn("geopolitica_leitura", "nivel_soja", opcoes);
      await queryInterface.removeColumn("geopolitica_leitura", "resumo_soja", opcoes);

      await sql("ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_principal");
      await sql("ALTER TABLE geopolitica_leitura ALTER COLUMN nivel_ouro SET NOT NULL");
      await sql("ALTER TABLE geopolitica_leitura ALTER COLUMN nivel_petroleo SET NOT NULL");

      await sql("DROP INDEX uq_geopolitica_leitura_data_frente");
      await sql("CREATE UNIQUE INDEX uq_geopolitica_leitura_data ON geopolitica_leitura (data_referencia)");
      await sql("ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_frente");
      await queryInterface.removeColumn("geopolitica_leitura", "frente", opcoes);
    });
  }
};
