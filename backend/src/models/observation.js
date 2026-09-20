"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// Tabela APPEND-ONLY (ver docs/adr/0008-camada-observation-point-in-time.md):
// uma observação histórica nunca é alterada nem apagada. Uma revisão da
// fonte entra como linha nova. Os hooks abaixo fecham as portas do Sequelize
// (instance.update/save em linha existente, Model.update, Model.destroy,
// upsert) - o repository também não expõe nenhuma operação desse tipo.
const MENSAGEM_APPEND_ONLY = "A tabela observation é append-only: registre uma nova versão em vez de alterar ou apagar uma existente.";

function bloquear() {
  throw new Error(MENSAGEM_APPEND_ONLY);
}

module.exports = (sequelize) => {
  const Observation = sequelize.define(
    "Observation",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      series_code: { type: DataTypes.STRING(60), allowNull: false },
      observed_at: { type: DataTypes.DATEONLY, allowNull: false },
      published_at: { type: DataTypes.DATE, allowNull: false },
      collected_at: { type: DataTypes.DATE, allowNull: false },
      value: { type: DataTypes.DECIMAL(18, 6), allowNull: false },
      unit: { type: DataTypes.STRING(20), allowNull: false },
      source_code: { type: DataTypes.STRING(30), allowNull: false },
      published_at_is_estimated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      revision_seq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      collection_execution_id: { type: DataTypes.UUID, allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true }
    },
    {
      tableName: "observation",
      timestamps: false,
      underscored: true,
      hooks: {
        beforeUpdate: bloquear,
        beforeBulkUpdate: bloquear,
        beforeDestroy: bloquear,
        beforeBulkDestroy: bloquear,
        beforeUpsert: bloquear
      }
    }
  );

  Observation.MENSAGEM_APPEND_ONLY = MENSAGEM_APPEND_ONLY;

  Observation.associate = (db) => {
    Observation.belongsTo(db.CollectionExecution, { foreignKey: "collection_execution_id", as: "execucao" });
  };

  return Observation;
};
