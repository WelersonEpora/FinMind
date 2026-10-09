"use strict";

// Eventos de mercado do dólar (fase 1 do dólar, só aquisição, ADR 0124): uma leitura diária PRÓPRIA do dólar, nas mesmas
// tabelas e no mesmo desenho da soja (ADR 0115), sem tocar na leitura principal nem na da soja. O que muda:
//   - geopolitica_leitura: a `frente` aceita 'DOLAR'; entram nivel_dolar e resumo_dolar, obrigatório o nível na leitura
//     do dólar.
//   - geopolitica_evento: o ativo aceita DOLAR e o tipo aceita os cinco tipos do dólar (POLITICA_MONETARIA,
//     POLITICA_FISCAL, RISCO_INSTITUCIONAL, INTERVENCAO_CAMBIAL e DADO_ECONOMICO).
//
// Escopo: GLOBAL (ADR 0007, §3), como as tabelas de origem.

const NIVEIS = "('NORMAL', 'ATENCAO', 'RELEVANTE', 'EXCEPCIONAL')";
const TIPOS_ANTES = ["GEOPOLITICA", "POLITICA_COMERCIAL", "CLIMA_EXTREMO", "REGULACAO", "CHOQUE_LOGISTICO", "SANIDADE", "POLITICA_OFERTA"];
const TIPOS_DOLAR = ["POLITICA_MONETARIA", "POLITICA_FISCAL", "RISCO_INSTITUCIONAL", "INTERVENCAO_CAMBIAL", "DADO_ECONOMICO"];
const lista = (valores) => `(${valores.map((v) => `'${v}'`).join(", ")})`;

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };
      const sql = (texto) => queryInterface.sequelize.query(texto, opcoes);

      await sql("ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_frente");
      await sql("ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_frente CHECK (frente IN ('PRINCIPAL', 'SOJA', 'DOLAR'))");

      await queryInterface.addColumn("geopolitica_leitura", "nivel_dolar", { type: Sequelize.STRING(20), allowNull: true }, opcoes);
      await queryInterface.addColumn("geopolitica_leitura", "resumo_dolar", { type: Sequelize.TEXT, allowNull: true }, opcoes);
      await sql(`ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_nivel_dolar CHECK (nivel_dolar IN ${NIVEIS})`);
      await sql("ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_dolar CHECK (frente <> 'DOLAR' OR nivel_dolar IS NOT NULL)");

      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_ativo");
      await sql("ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_ativo CHECK (ativo IN ('OURO', 'PETROLEO', 'MILHO', 'CAFE', 'SOJA', 'DOLAR'))");
      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_tipo");
      await sql(`ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_tipo CHECK (tipo IN ${lista([...TIPOS_ANTES, ...TIPOS_DOLAR])})`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };
      const sql = (texto) => queryInterface.sequelize.query(texto, opcoes);

      await sql("DELETE FROM geopolitica_evento WHERE ativo = 'DOLAR'");
      await sql("DELETE FROM geopolitica_evento WHERE leitura_id IN (SELECT id FROM geopolitica_leitura WHERE frente = 'DOLAR')");
      await sql("DELETE FROM geopolitica_leitura WHERE frente = 'DOLAR'");

      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_tipo");
      await sql(`ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_tipo CHECK (tipo IN ${lista(TIPOS_ANTES)})`);
      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_ativo");
      await sql("ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_ativo CHECK (ativo IN ('OURO', 'PETROLEO', 'MILHO', 'CAFE', 'SOJA'))");

      await sql("ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_dolar");
      await sql("ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_nivel_dolar");
      await queryInterface.removeColumn("geopolitica_leitura", "nivel_dolar", opcoes);
      await queryInterface.removeColumn("geopolitica_leitura", "resumo_dolar", opcoes);
      await sql("ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_frente");
      await sql("ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_frente CHECK (frente IN ('PRINCIPAL', 'SOJA'))");
    });
  }
};
