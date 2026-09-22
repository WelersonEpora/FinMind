"use strict";

// Escopo: GLOBAL (mesma tabela do 20260920100000-create-observation-table.js).
//
// `series_code` era VARCHAR(60), suficiente para o WASDE (até 47 chars) e a Conab (até 45), mas pequeno demais
// para o IMEA (ADR 0018): a convenção `IMEA.CUSTO.MILHO.<TIPO>.<PERIODO>.<TECNOLOGIA>_<LOCAL>.<ITEM>` chega a 91
// chars no pior caso (`IMEA.CUSTO.MILHO.PONDERADO.SAFRA.MEDIA_CAMPO_NOVO_DO_PARECIS.CLASSIFICACAO_E_BENEFICIAMENTO`).
// Com 60, o MariaDB truncava silenciosamente (`INSERT IGNORE`) séries longas demais, e duas séries DIFERENTES
// truncadas para o mesmo prefixo colidiam na chave única - achado real, gravando 0 linhas para as séries mais
// longas. 120 dá margem para fontes futuras sem reabrir esta migration de novo.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("observation", "series_code", {
      type: Sequelize.STRING(120),
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("observation", "series_code", {
      type: Sequelize.STRING(60),
      allowNull: false
    });
  }
};
