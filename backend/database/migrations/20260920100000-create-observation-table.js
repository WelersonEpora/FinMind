"use strict";

// Escopo: GLOBAL (dado de mercado - sem workspace_id, nunca terá; ver
// docs/adr/0007-escopo-de-dados-global-espaco-usuario.md §3).
//
// Camada point-in-time do FinMind - ver docs/adr/0008-camada-observation-point-in-time.md.
// APPEND-ONLY: nenhuma linha é atualizada ou apagada depois de inserida. Uma
// revisão publicada pela fonte entra como linha NOVA (mesmo series_code +
// observed_at, published_at diferente).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("observation", {
      id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true
      },
      // Identifica a série (ex.: "FRED.DGS10", "LBMA.GOLD_PM.USD",
      // "CFTC.GC.MM_LONG"). Convenção FONTE.SERIE[.DIMENSAO]; o catálogo
      // vive no código (collectors/), não numa tabela.
      series_code: {
        type: Sequelize.STRING(60),
        allowNull: false
      },
      // A que período/data o valor SE REFERE (não quando ficou disponível).
      observed_at: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      // Quando esse valor passou a estar publicamente disponível. Sempre UTC.
      // Ver published_at_is_estimated para saber se é o instante real da
      // fonte ou uma estimativa.
      published_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      // Quando o FinMind baixou esse valor. Sempre >= o que sabemos de fato.
      collected_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      value: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false
      },
      unit: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      source_code: {
        type: Sequelize.STRING(30),
        allowNull: false
      },
      // false = published_at foi informado pela fonte; true = foi derivado
      // por regra documentada ou é o limite superior (collected_at). A base
      // da estimativa fica em metadata.publishedAtBasis.
      published_at_is_estimated: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // 0 = primeira versão vista; n = n-ésima revisão (ordem de inserção).
      // Informativo: a ordem que vale para asOf() é sempre published_at.
      revision_seq: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      collection_execution_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "collection_execution", key: "id" }
      },
      // Proveniência/base da estimativa de published_at (ver ADR 0008).
      metadata: {
        type: Sequelize.JSON,
        allowNull: true
      }
      // Sem created_at/updated_at de propósito: a tabela é append-only (não
      // há "updated") e collected_at já é o momento da criação da linha.
    });

    // Impede duplicar a mesma versão histórica; e serve de índice para o
    // asOf() (prefixo series_code + observed_at).
    await queryInterface.addIndex("observation", ["series_code", "observed_at", "published_at"], {
      name: "uk_pit",
      unique: true
    });

    // Consultas por janela de disponibilidade (asOf e "o que mudou desde X").
    await queryInterface.addIndex("observation", ["series_code", "published_at"], {
      name: "idx_observation_series_published"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("observation");
  }
};
