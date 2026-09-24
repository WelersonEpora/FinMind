"use strict";

// Escopo: GLOBAL (mesma tabela do 20260920100000-create-observation-table.js).
//
// `source_code` era VARCHAR(30), pequeno demais para o custo de produção do IMEA (ADR 0018):
// `IMEA_CUSTO_MILHO_PONDERADO_MEDIA` (32) e `IMEA_CUSTO_MILHO_PONDERADO_ALTA` (31). O `INSERT IGNORE` do repositório
// rebaixa o erro de truncamento do modo estrito a aviso, e o MariaDB gravou `..._PONDERADO_MED`/`..._PONDERADO_ALT`.
// Efeito (achado real na VM, 2026-09-23): `persistirPorEdicao` procura as edições já ingeridas pelo nome COMPLETO,
// não acha nada e manda os ~10 mil valores do Ponderado para a comparação série a série a cada coleta (~4 min).
//
// 1. Alarga a coluna para 64.
// 2. Corrige as linhas truncadas. É um UPDATE numa tabela append-only (ADR 0008), mas não é revisão de dado: o valor
//    gravado nunca foi o que o coletor mandou, é a chave da fonte corrompida pelo banco. Autorizado pelo usuário.
// 3. Índice que começa por `source_code`: `listarSeriesEInstantes` (`WHERE source_code = ?`) lia o índice inteiro
//    (~6-7 s por chamada em dev com 205 mil linhas, 4 chamadas por execução do IMEA custo). Cobre a consulta.
//
// A trava contra novo truncamento silencioso fica em `point-in-time.service.js::montarVersao`.
const TRUNCADOS = [
  ["IMEA_CUSTO_MILHO_PONDERADO_MED", "IMEA_CUSTO_MILHO_PONDERADO_MEDIA"],
  ["IMEA_CUSTO_MILHO_PONDERADO_ALT", "IMEA_CUSTO_MILHO_PONDERADO_ALTA"]
];
const INDICE = "idx_observation_source_series_published";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("observation", "source_code", {
      type: Sequelize.STRING(64),
      allowNull: false
    });
    for (const [truncado, completo] of TRUNCADOS) {
      await queryInterface.sequelize.query("UPDATE observation SET source_code = :completo WHERE source_code = :truncado", {
        replacements: { truncado, completo }
      });
    }
    await queryInterface.addIndex("observation", ["source_code", "series_code", "published_at"], { name: INDICE });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("observation", INDICE);
    for (const [truncado, completo] of TRUNCADOS) {
      await queryInterface.sequelize.query("UPDATE observation SET source_code = :truncado WHERE source_code = :completo", {
        replacements: { truncado, completo }
      });
    }
    await queryInterface.changeColumn("observation", "source_code", {
      type: Sequelize.STRING(30),
      allowNull: false
    });
  }
};
