"use strict";

// Carteiras virtuais (ADR 0127), etapa 2: a carteira, as versões dos parâmetros e as trilhas. As tabelas da rodada, das
// ordens e do razão entram com a etapa 3.
//
// Escopo: PRIVADA (ADR 0007, §3 e §6) - as três são do espaço: `workspace_id` em todas, o filho aponta para o pai pela
// FK composta (workspace_id, carteira_id), para o banco recusar um filho ligado à carteira de outro espaço, e
// ON DELETE RESTRICT em tudo: apagar um espaço com carteira falha, nunca apaga dado em silêncio.
//
// `carteira_parametros_versao` é append-only (uma mudança é uma linha nova; o repositório não tem update nem delete).

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "carteira",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: Sequelize.UUID, allowNull: false, references: { model: "workspace", key: "id" }, onDelete: "RESTRICT", onUpdate: "RESTRICT" },
          nome: { type: Sequelize.STRING(120), allowNull: false },
          // B3 (em reais) ou INTERNACIONAL (em dólares): fixa desde a criação, como a moeda, o capital e o início.
          conta: { type: Sequelize.STRING(20), allowNull: false },
          moeda: { type: Sequelize.STRING(3), allowNull: false },
          capital_inicial: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
          // A 1ª rodada (ADR 0127): um dia útil a partir do dia seguinte ao da criação.
          data_inicio: { type: Sequelize.DATEONLY, allowNull: false },
          situacao: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "ATIVA" },
          criada_por: { type: Sequelize.UUID, allowNull: false, references: { model: "user", key: "id" }, onDelete: "RESTRICT", onUpdate: "RESTRICT" },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      // O alvo das FKs compostas dos filhos.
      await queryInterface.addConstraint("carteira", { fields: ["workspace_id", "id"], type: "unique", name: "uq_carteira_workspace_id", transaction });
      await queryInterface.addIndex("carteira", ["workspace_id", "nome"], { name: "uq_carteira_workspace_nome", unique: true, transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE carteira
           ADD CONSTRAINT ck_carteira_conta CHECK (conta IN ('B3', 'INTERNACIONAL')),
           ADD CONSTRAINT ck_carteira_moeda CHECK ((conta = 'B3' AND moeda = 'BRL') OR (conta = 'INTERNACIONAL' AND moeda = 'USD')),
           ADD CONSTRAINT ck_carteira_capital CHECK (capital_inicial > 0),
           ADD CONSTRAINT ck_carteira_situacao CHECK (situacao IN ('ATIVA', 'ENCERRADA'))`,
        { transaction }
      );

      await queryInterface.createTable(
        "carteira_parametros_versao",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: Sequelize.UUID, allowNull: false },
          carteira_id: { type: Sequelize.UUID, allowNull: false },
          // 1, 2, 3... por carteira.
          versao: { type: Sequelize.INTEGER, allowNull: false },
          // INICIAL (a da criação), AJUSTE (abre segmento novo de medição) ou CORRECAO_CUSTO (o custo real por contrato:
          // vale desde o início e não abre segmento; ADR 0127, §8).
          tipo: { type: Sequelize.STRING(20), allowNull: false },
          // A 1ª rodada em que a versão vale (numa CORRECAO_CUSTO, o início da carteira).
          vigente_desde: { type: Sequelize.DATEONLY, allowNull: false },
          // Os parâmetros completos, validados pelo domínio (carteiras/parametros.js) antes de gravar.
          parametros: { type: Sequelize.JSONB, allowNull: false },
          motivo: { type: Sequelize.TEXT, allowNull: false },
          autor_user_id: { type: Sequelize.UUID, allowNull: false, references: { model: "user", key: "id" }, onDelete: "RESTRICT", onUpdate: "RESTRICT" },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await queryInterface.addIndex("carteira_parametros_versao", ["carteira_id", "versao"], { name: "uq_carteira_parametros_versao", unique: true, transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE carteira_parametros_versao
           ADD CONSTRAINT fk_carteira_parametros_versao_carteira FOREIGN KEY (workspace_id, carteira_id)
             REFERENCES carteira (workspace_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
           ADD CONSTRAINT ck_carteira_parametros_versao_versao CHECK (versao >= 1),
           ADD CONSTRAINT ck_carteira_parametros_versao_tipo CHECK (tipo IN ('INICIAL', 'AJUSTE', 'CORRECAO_CUSTO'))`,
        { transaction }
      );

      await queryInterface.createTable(
        "carteira_trilha",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: Sequelize.UUID, allowNull: false },
          carteira_id: { type: Sequelize.UUID, allowNull: false },
          // As três trilhas e as três referências calculadas, todas criadas com a carteira (ADR 0127, §2).
          tipo: { type: Sequelize.STRING(20), allowNull: false },
          calculada: { type: Sequelize.BOOLEAN, allowNull: false },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await queryInterface.addIndex("carteira_trilha", ["carteira_id", "tipo"], { name: "uq_carteira_trilha_tipo", unique: true, transaction });
      // O alvo das FKs compostas das tabelas da rodada e do razão (etapa 3).
      await queryInterface.addConstraint("carteira_trilha", { fields: ["workspace_id", "id"], type: "unique", name: "uq_carteira_trilha_workspace_id", transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE carteira_trilha
           ADD CONSTRAINT fk_carteira_trilha_carteira FOREIGN KEY (workspace_id, carteira_id)
             REFERENCES carteira (workspace_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
           ADD CONSTRAINT ck_carteira_trilha_tipo CHECK (tipo IN ('OPERADOR', 'IA', 'DETERMINISTICA', 'CAIXA', 'COMPRAR_E_SEGURAR', 'PERSISTENCIA')),
           ADD CONSTRAINT ck_carteira_trilha_calculada CHECK (calculada = (tipo IN ('CAIXA', 'COMPRAR_E_SEGURAR', 'PERSISTENCIA')))`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("carteira_trilha", { transaction });
      await queryInterface.dropTable("carteira_parametros_versao", { transaction });
      await queryInterface.dropTable("carteira", { transaction });
    });
  }
};
