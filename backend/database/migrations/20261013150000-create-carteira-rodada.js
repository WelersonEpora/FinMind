"use strict";

// Carteiras virtuais (ADR 0127), etapa 3: a rodada diária, a cópia congelada das leituras, as intenções, as ordens, as
// posições com os eventos, o razão e o patrimônio diário.
//
// Escopo: PRIVADA (ADR 0007, §3 e §6) - todas do espaço, com `workspace_id`; cada filho aponta para o pai pela FK
// composta (workspace_id, id do pai) e ON DELETE RESTRICT.
//
// Append-only: `carteira_rodada_leitura`, `carteira_intencao`, `carteira_posicao_evento` e `carteira_lancamento` (o
// razão). Mudam de estado uma vez: `carteira_rodada` (a liquidação) e `carteira_ordem` (a execução). A posição muda com
// a vida dela (stop, quantidade aberta, encerramento), e cada mudança deixa um evento. `carteira_patrimonio_diario` é
// projeção do razão, recalculável.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });
const fk = (tabela, nome, colunas, alvo) =>
  `ALTER TABLE ${tabela} ADD CONSTRAINT ${nome} FOREIGN KEY (${colunas}) REFERENCES ${alvo} ON DELETE RESTRICT ON UPDATE RESTRICT`;

module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, DATEONLY, DATE, STRING, INTEGER, DECIMAL, JSONB, TEXT, BOOLEAN } = Sequelize;
    await queryInterface.sequelize.transaction(async (transaction) => {
      const sql = (texto) => queryInterface.sequelize.query(texto, { transaction });
      const unico = (tabela, campos, name) => queryInterface.addConstraint(tabela, { fields: campos, type: "unique", name, transaction });

      // A rodada de um dia útil: decide na madrugada de D (dados até o ajuste de D−1) e liquida na de D+1 (ajuste de D).
      // SEM_DECISAO: um dia em que não houve decisão (a rotina não rodou, ou a liquidação anterior estava pendente); a
      // rodada existe assim mesmo, para o dia ser liquidado (stop, alvos, marcação e Selic).
      await queryInterface.createTable(
        "carteira_rodada",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          carteira_id: { type: UUID, allowNull: false },
          data: { type: DATEONLY, allowNull: false },
          decisao: { type: STRING(20), allowNull: false },
          // A versão-base dos parâmetros usada na decisão (a correção de custo é lida na liquidação).
          parametros_versao: { type: INTEGER, allowNull: true },
          decidida_em: { type: DATE, allowNull: false },
          liquidacao: { type: STRING(20), allowNull: false, defaultValue: "PENDENTE" },
          liquidada_em: { type: DATE, allowNull: true },
          detalhes: { type: JSONB, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await unico("carteira_rodada", ["carteira_id", "data"], "uq_carteira_rodada_dia");
      await unico("carteira_rodada", ["workspace_id", "id"], "uq_carteira_rodada_workspace_id");
      await sql(fk("carteira_rodada", "fk_carteira_rodada_carteira", "workspace_id, carteira_id", "carteira (workspace_id, id)"));
      await sql(`ALTER TABLE carteira_rodada
        ADD CONSTRAINT ck_carteira_rodada_decisao CHECK (decisao IN ('DECIDIDA', 'SEM_DECISAO')),
        ADD CONSTRAINT ck_carteira_rodada_liquidacao CHECK (liquidacao IN ('PENDENTE', 'LIQUIDADA'))`);

      // A cópia congelada da leitura de tendência de cada ativo que a rodada usou (`analise_diaria` pode ser substituída
      // no REFAZER): o id e o hash para conferir, e as leituras e o preço como estavam.
      await queryInterface.createTable(
        "carteira_rodada_leitura",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          rodada_id: { type: UUID, allowNull: false },
          ativo: { type: STRING(20), allowNull: false },
          situacao: { type: STRING(10), allowNull: false },
          analise_diaria_id: { type: UUID, allowNull: true },
          data_analise: { type: DATEONLY, allowNull: true },
          hash_entrada: { type: STRING(64), allowNull: true },
          versao_prompt: { type: STRING(60), allowNull: true },
          modelo: { type: STRING(80), allowNull: true },
          leituras: { type: JSONB, allowNull: true },
          preco: { type: JSONB, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await unico("carteira_rodada_leitura", ["rodada_id", "ativo"], "uq_carteira_rodada_leitura_ativo");
      await sql(fk("carteira_rodada_leitura", "fk_carteira_rodada_leitura_rodada", "workspace_id, rodada_id", "carteira_rodada (workspace_id, id)"));
      await sql("ALTER TABLE carteira_rodada_leitura ADD CONSTRAINT ck_carteira_rodada_leitura_situacao CHECK (situacao IN ('OK', 'AUSENTE'))");

      // A intenção de cada trilha por ativo e rodada (o contrato comum, carteiras/intencao.js) e o que o motor fez dela.
      await queryInterface.createTable(
        "carteira_intencao",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          rodada_id: { type: UUID, allowNull: false },
          trilha_id: { type: UUID, allowNull: false },
          ativo: { type: STRING(20), allowNull: false },
          acao: { type: STRING(20), allowNull: false },
          prioridade: { type: INTEGER, allowNull: false },
          origem: { type: STRING(20), allowNull: false },
          referencia: { type: JSONB, allowNull: true },
          resultado: { type: STRING(20), allowNull: false },
          motivo_bloqueio: { type: STRING(40), allowNull: true },
          detalhe_bloqueio: { type: TEXT, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await unico("carteira_intencao", ["rodada_id", "trilha_id", "ativo"], "uq_carteira_intencao");
      await sql(fk("carteira_intencao", "fk_carteira_intencao_rodada", "workspace_id, rodada_id", "carteira_rodada (workspace_id, id)"));
      await sql(fk("carteira_intencao", "fk_carteira_intencao_trilha", "workspace_id, trilha_id", "carteira_trilha (workspace_id, id)"));
      await sql("ALTER TABLE carteira_intencao ADD CONSTRAINT ck_carteira_intencao_resultado CHECK (resultado IN ('ORDEM', 'BLOQUEADA', 'SEM_ORDEM'))");

      // A posição (a operação, no diário): nasce na execução da entrada e se encerra na última saída.
      await queryInterface.createTable(
        "carteira_posicao",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          trilha_id: { type: UUID, allowNull: false },
          ativo: { type: STRING(20), allowNull: false },
          lado: { type: STRING(10), allowNull: false },
          // { ticker, limite }: o vencimento operado, sem emendar.
          contrato: { type: JSONB, allowNull: false },
          origem: { type: STRING(20), allowNull: true },
          data_entrada: { type: DATEONLY, allowNull: false },
          entrada: { type: DECIMAL(20, 6), allowNull: false },
          // Nulos na referência comprar e segurar (sem stop nem alvo).
          distancia: { type: DECIMAL(20, 6), allowNull: true },
          stop_inicial: { type: DECIMAL(20, 6), allowNull: true },
          stop: { type: DECIMAL(20, 6), allowNull: true },
          alvo1: { type: DECIMAL(20, 6), allowNull: true },
          alvo2: { type: DECIMAL(20, 6), allowNull: true },
          quantidade_inicial: { type: DECIMAL(20, 6), allowNull: false },
          quantidade_aberta: { type: DECIMAL(20, 6), allowNull: false },
          risco_1r: { type: DECIMAL(18, 2), allowNull: true },
          alvo1_atingido: { type: BOOLEAN, allowNull: false },
          reduzida: { type: BOOLEAN, allowNull: false },
          ultimo_ajuste: { type: DECIMAL(20, 6), allowNull: false },
          resultado_r: { type: DECIMAL(12, 4), allowNull: true },
          resultado_moeda: { type: DECIMAL(18, 2), allowNull: false },
          situacao: { type: STRING(20), allowNull: false },
          data_saida: { type: DATEONLY, allowNull: true },
          motivo_saida: { type: STRING(20), allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await unico("carteira_posicao", ["workspace_id", "id"], "uq_carteira_posicao_workspace_id");
      await sql(fk("carteira_posicao", "fk_carteira_posicao_trilha", "workspace_id, trilha_id", "carteira_trilha (workspace_id, id)"));
      await sql(`ALTER TABLE carteira_posicao
        ADD CONSTRAINT ck_carteira_posicao_lado CHECK (lado IN ('COMPRADO', 'VENDIDO')),
        ADD CONSTRAINT ck_carteira_posicao_situacao CHECK (situacao IN ('ABERTA', 'ENCERRADA'))`);
      // No máximo uma posição aberta por trilha e ativo.
      await sql("CREATE UNIQUE INDEX uq_carteira_posicao_aberta ON carteira_posicao (trilha_id, ativo) WHERE situacao = 'ABERTA'");

      await queryInterface.createTable(
        "carteira_posicao_evento",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          posicao_id: { type: UUID, allowNull: false },
          data: { type: DATEONLY, allowNull: false },
          tipo: { type: STRING(20), allowNull: false },
          preco: { type: DECIMAL(20, 6), allowNull: true },
          quantidade: { type: DECIMAL(20, 6), allowNull: true },
          detalhes: { type: JSONB, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await sql(fk("carteira_posicao_evento", "fk_carteira_posicao_evento_posicao", "workspace_id, posicao_id", "carteira_posicao (workspace_id, id)"));
      await queryInterface.addIndex("carteira_posicao_evento", ["posicao_id", "data"], { name: "idx_carteira_posicao_evento_posicao", transaction });

      // A ordem que o motor gerou (ou, na etapa 6, o operador): executa no ajuste de `data_execucao`.
      await queryInterface.createTable(
        "carteira_ordem",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          rodada_id: { type: UUID, allowNull: true },
          trilha_id: { type: UUID, allowNull: false },
          data_execucao: { type: DATEONLY, allowNull: false },
          ativo: { type: STRING(20), allowNull: false },
          tipo: { type: STRING(20), allowNull: false },
          motivo: { type: STRING(20), allowNull: false },
          lado: { type: STRING(10), allowNull: false },
          contrato: { type: JSONB, allowNull: false },
          quantidade: { type: DECIMAL(20, 6), allowNull: false },
          distancia: { type: DECIMAL(20, 6), allowNull: true },
          sem_stop: { type: BOOLEAN, allowNull: false, defaultValue: false },
          preco_informado: { type: DECIMAL(20, 6), allowNull: true },
          stop_informado: { type: DECIMAL(20, 6), allowNull: true },
          posicao_id: { type: UUID, allowNull: true },
          situacao: { type: STRING(20), allowNull: false, defaultValue: "CRIADA" },
          motivo_situacao: { type: STRING(40), allowNull: true },
          preco_execucao: { type: DECIMAL(20, 6), allowNull: true },
          quantidade_executada: { type: DECIMAL(20, 6), allowNull: true },
          detalhes: { type: JSONB, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await sql(fk("carteira_ordem", "fk_carteira_ordem_rodada", "workspace_id, rodada_id", "carteira_rodada (workspace_id, id)"));
      await sql(fk("carteira_ordem", "fk_carteira_ordem_trilha", "workspace_id, trilha_id", "carteira_trilha (workspace_id, id)"));
      await sql(fk("carteira_ordem", "fk_carteira_ordem_posicao", "workspace_id, posicao_id", "carteira_posicao (workspace_id, id)"));
      await sql(`ALTER TABLE carteira_ordem
        ADD CONSTRAINT ck_carteira_ordem_tipo CHECK (tipo IN ('ENTRADA', 'REDUCAO', 'SAIDA')),
        ADD CONSTRAINT ck_carteira_ordem_situacao CHECK (situacao IN ('CRIADA', 'EXECUTADA', 'EXPIRADA', 'REJEITADA'))`);
      await queryInterface.addIndex("carteira_ordem", ["rodada_id"], { name: "idx_carteira_ordem_rodada", transaction });

      // O razão: o patrimônio é o capital inicial mais a soma destes lançamentos.
      await queryInterface.createTable(
        "carteira_lancamento",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          trilha_id: { type: UUID, allowNull: false },
          rodada_id: { type: UUID, allowNull: true },
          data: { type: DATEONLY, allowNull: false },
          tipo: { type: STRING(20), allowNull: false },
          ativo: { type: STRING(20), allowNull: true },
          posicao_id: { type: UUID, allowNull: true },
          valor: { type: DECIMAL(18, 2), allowNull: false },
          cambio: { type: DECIMAL(12, 6), allowNull: true },
          descricao: { type: TEXT, allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await sql(fk("carteira_lancamento", "fk_carteira_lancamento_trilha", "workspace_id, trilha_id", "carteira_trilha (workspace_id, id)"));
      await sql(fk("carteira_lancamento", "fk_carteira_lancamento_rodada", "workspace_id, rodada_id", "carteira_rodada (workspace_id, id)"));
      await sql(fk("carteira_lancamento", "fk_carteira_lancamento_posicao", "workspace_id, posicao_id", "carteira_posicao (workspace_id, id)"));
      await sql("ALTER TABLE carteira_lancamento ADD CONSTRAINT ck_carteira_lancamento_tipo CHECK (tipo IN ('AJUSTE_DIARIO', 'CUSTO', 'RENDIMENTO_CAIXA', 'CORRECAO_CUSTO'))");
      await queryInterface.addIndex("carteira_lancamento", ["trilha_id", "data"], { name: "idx_carteira_lancamento_trilha_data", transaction });

      await queryInterface.createTable(
        "carteira_patrimonio_diario",
        {
          id: { type: UUID, allowNull: false, primaryKey: true },
          workspace_id: { type: UUID, allowNull: false },
          trilha_id: { type: UUID, allowNull: false },
          data: { type: DATEONLY, allowNull: false },
          patrimonio: { type: DECIMAL(18, 2), allowNull: false },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        { transaction }
      );
      await unico("carteira_patrimonio_diario", ["trilha_id", "data"], "uq_carteira_patrimonio_diario");
      await sql(fk("carteira_patrimonio_diario", "fk_carteira_patrimonio_diario_trilha", "workspace_id, trilha_id", "carteira_trilha (workspace_id, id)"));
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const tabela of [
        "carteira_patrimonio_diario",
        "carteira_lancamento",
        "carteira_ordem",
        "carteira_posicao_evento",
        "carteira_posicao",
        "carteira_intencao",
        "carteira_rodada_leitura",
        "carteira_rodada"
      ]) {
        await queryInterface.dropTable(tabela, { transaction });
      }
    });
  }
};
