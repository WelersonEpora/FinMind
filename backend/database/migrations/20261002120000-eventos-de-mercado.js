"use strict";

// Eventos de mercado (ADR 0049): a leitura diária de geopolítica (ADR 0047) passa a cobrir quatro ativos e sete tipos
// de evento, nas MESMAS tabelas (geopolitica_leitura e geopolitica_evento; o nome ficou o da origem para não mexer no
// que já funciona). Só o que o modelo atual não suportava:
//   - geopolitica_leitura: nível e resumo do milho e do café (nulos nas leituras anteriores, que só tinham ouro e
//     petróleo);
//   - geopolitica_evento: o ativo aceita MILHO e CAFE; o `tipo` passa à lista de sete tipos (a geopolítica é um deles) e
//     os eventos existentes são mapeados; entra o `fator` (um dos 34 fatores do FEL 1, ou NAO_SE_APLICA; nulo nos
//     eventos anteriores, que a IA não classificou); sai o `assunto`, que era sempre GEOPOLITICA e agora repetiria o tipo.
//
// Escopo: GLOBAL (ADR 0007, §3), como as tabelas de origem.
//
// Mapeamento dos tipos antigos (subtipos da geopolítica): conflito militar, rota marítima (ataque a navio), infraestrutura,
// sanção, diplomacia e outro -> GEOPOLITICA; decisão de produção -> POLITICA_OFERTA.

const NIVEIS = "('NORMAL', 'ATENCAO', 'RELEVANTE', 'EXCEPCIONAL')";
const TIPOS_NOVOS = "('GEOPOLITICA', 'POLITICA_COMERCIAL', 'CLIMA_EXTREMO', 'REGULACAO', 'CHOQUE_LOGISTICO', 'SANIDADE', 'POLITICA_OFERTA')";
const TIPOS_ANTIGOS = "('CONFLITO_MILITAR', 'ROTA_MARITIMA', 'INFRAESTRUTURA', 'SANCAO', 'PRODUCAO', 'DIPLOMACIA', 'OUTRO')";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };
      const sql = (texto) => queryInterface.sequelize.query(texto, opcoes);

      for (const ativo of ["milho", "cafe"]) {
        await queryInterface.addColumn("geopolitica_leitura", `nivel_${ativo}`, { type: Sequelize.STRING(20), allowNull: true }, opcoes);
        await queryInterface.addColumn("geopolitica_leitura", `resumo_${ativo}`, { type: Sequelize.TEXT, allowNull: true }, opcoes);
        await sql(`ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_nivel_${ativo} CHECK (nivel_${ativo} IN ${NIVEIS})`);
      }

      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_ativo");
      await sql("ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_ativo CHECK (ativo IN ('OURO', 'PETROLEO', 'MILHO', 'CAFE'))");

      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_tipo");
      await sql("UPDATE geopolitica_evento SET tipo = 'POLITICA_OFERTA' WHERE tipo = 'PRODUCAO'");
      await sql(`UPDATE geopolitica_evento SET tipo = 'GEOPOLITICA' WHERE tipo IN ${TIPOS_ANTIGOS}`);
      await sql(`ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_tipo CHECK (tipo IN ${TIPOS_NOVOS})`);

      // Código de um dos 34 fatores do FEL 1 (shared/fatores-fel1.js) ou NAO_SE_APLICA. Sem CHECK: a lista vive no código
      // (o parser só aceita um fator do próprio ativo).
      await queryInterface.addColumn("geopolitica_evento", "fator", { type: Sequelize.STRING(60), allowNull: true }, opcoes);

      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_assunto");
      await queryInterface.removeColumn("geopolitica_evento", "assunto", opcoes);
    });
  },

  // Volta ao formato do ADR 0047: os eventos do milho e do café e as colunas novas saem; os tipos voltam a subtipos
  // aproximados (o subtipo original de cada evento não foi guardado).
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };
      const sql = (texto) => queryInterface.sequelize.query(texto, opcoes);

      await queryInterface.addColumn(
        "geopolitica_evento",
        "assunto",
        { type: Sequelize.STRING(30), allowNull: false, defaultValue: "GEOPOLITICA" },
        opcoes
      );
      await sql("ALTER TABLE geopolitica_evento ALTER COLUMN assunto DROP DEFAULT");
      await sql("ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_assunto CHECK (assunto IN ('GEOPOLITICA'))");
      await queryInterface.removeColumn("geopolitica_evento", "fator", opcoes);

      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_tipo");
      await sql("UPDATE geopolitica_evento SET tipo = CASE tipo WHEN 'POLITICA_OFERTA' THEN 'PRODUCAO' WHEN 'CHOQUE_LOGISTICO' THEN 'ROTA_MARITIMA' WHEN 'POLITICA_COMERCIAL' THEN 'SANCAO' ELSE 'OUTRO' END WHERE tipo IS NOT NULL");
      await sql(`ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_tipo CHECK (tipo IN ${TIPOS_ANTIGOS})`);

      await sql("DELETE FROM geopolitica_evento WHERE ativo IN ('MILHO', 'CAFE')");
      await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_ativo");
      await sql("ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_ativo CHECK (ativo IN ('OURO', 'PETROLEO'))");

      for (const ativo of ["milho", "cafe"]) {
        await sql(`ALTER TABLE geopolitica_leitura DROP CONSTRAINT ck_geopolitica_leitura_nivel_${ativo}`);
        await queryInterface.removeColumn("geopolitica_leitura", `nivel_${ativo}`, opcoes);
        await queryInterface.removeColumn("geopolitica_leitura", `resumo_${ativo}`, opcoes);
      }
    });
  }
};
