"use strict";

const { DataTypes } = require("sequelize");

// Carteira virtual (ADR 0127). PRIVADA do espaço (ADR 0007): só é lida e gravada por carteira.repository.js, sempre
// com o espaço. As versões dos parâmetros e as trilhas são filhas dela (FK composta com o espaço).
module.exports = (sequelize) => {
  const Carteira = sequelize.define(
    "Carteira",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      workspace_id: { type: DataTypes.UUID, allowNull: false },
      nome: { type: DataTypes.STRING(120), allowNull: false },
      conta: { type: DataTypes.STRING(20), allowNull: false },
      moeda: { type: DataTypes.STRING(3), allowNull: false },
      capital_inicial: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
      data_inicio: { type: DataTypes.DATEONLY, allowNull: false },
      situacao: { type: DataTypes.STRING(20), allowNull: false },
      criada_por: { type: DataTypes.UUID, allowNull: false }
    },
    { tableName: "carteira", timestamps: true, underscored: true, createdAt: "created_at", updatedAt: "updated_at" }
  );

  const CarteiraParametrosVersao = sequelize.define(
    "CarteiraParametrosVersao",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      workspace_id: { type: DataTypes.UUID, allowNull: false },
      carteira_id: { type: DataTypes.UUID, allowNull: false },
      versao: { type: DataTypes.INTEGER, allowNull: false },
      tipo: { type: DataTypes.STRING(20), allowNull: false },
      vigente_desde: { type: DataTypes.DATEONLY, allowNull: false },
      parametros: { type: DataTypes.JSONB, allowNull: false },
      motivo: { type: DataTypes.TEXT, allowNull: false },
      autor_user_id: { type: DataTypes.UUID, allowNull: false }
    },
    { tableName: "carteira_parametros_versao", timestamps: true, underscored: true, createdAt: "created_at", updatedAt: "updated_at" }
  );

  const CarteiraTrilha = sequelize.define(
    "CarteiraTrilha",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      workspace_id: { type: DataTypes.UUID, allowNull: false },
      carteira_id: { type: DataTypes.UUID, allowNull: false },
      tipo: { type: DataTypes.STRING(20), allowNull: false },
      calculada: { type: DataTypes.BOOLEAN, allowNull: false }
    },
    { tableName: "carteira_trilha", timestamps: true, underscored: true, createdAt: "created_at", updatedAt: "updated_at" }
  );

  // Etapa 3: a rodada e o razão (migration 20261013150000). Os nomes das colunas são os da migration.
  const { UUID, DATEONLY, DATE, STRING, INTEGER, DECIMAL, JSONB, TEXT, BOOLEAN } = DataTypes;
  const definir = (nome, tableName, colunas) =>
    sequelize.define(
      nome,
      { id: { type: UUID, primaryKey: true, allowNull: false }, workspace_id: { type: UUID, allowNull: false }, ...colunas },
      { tableName, timestamps: true, underscored: true, createdAt: "created_at", updatedAt: "updated_at" }
    );
  // Uma definição nova por coluna: o Sequelize altera o objeto recebido (um objeto compartilhado troca o nome da coluna).
  const preco = () => ({ type: DECIMAL(20, 6), allowNull: true });

  const CarteiraRodada = definir("CarteiraRodada", "carteira_rodada", {
    carteira_id: { type: UUID, allowNull: false },
    data: { type: DATEONLY, allowNull: false },
    decisao: { type: STRING(20), allowNull: false },
    parametros_versao: { type: INTEGER, allowNull: true },
    decidida_em: { type: DATE, allowNull: false },
    liquidacao: { type: STRING(20), allowNull: false },
    liquidada_em: { type: DATE, allowNull: true },
    detalhes: { type: JSONB, allowNull: true }
  });

  const CarteiraRodadaLeitura = definir("CarteiraRodadaLeitura", "carteira_rodada_leitura", {
    rodada_id: { type: UUID, allowNull: false },
    ativo: { type: STRING(20), allowNull: false },
    situacao: { type: STRING(10), allowNull: false },
    analise_diaria_id: { type: UUID, allowNull: true },
    data_analise: { type: DATEONLY, allowNull: true },
    hash_entrada: { type: STRING(64), allowNull: true },
    versao_prompt: { type: STRING(60), allowNull: true },
    modelo: { type: STRING(80), allowNull: true },
    leituras: { type: JSONB, allowNull: true },
    preco: { type: JSONB, allowNull: true }
  });

  const CarteiraIntencao = definir("CarteiraIntencao", "carteira_intencao", {
    rodada_id: { type: UUID, allowNull: false },
    trilha_id: { type: UUID, allowNull: false },
    ativo: { type: STRING(20), allowNull: false },
    acao: { type: STRING(20), allowNull: false },
    prioridade: { type: INTEGER, allowNull: false },
    origem: { type: STRING(20), allowNull: false },
    referencia: { type: JSONB, allowNull: true },
    resultado: { type: STRING(20), allowNull: false },
    motivo_bloqueio: { type: STRING(40), allowNull: true },
    detalhe_bloqueio: { type: TEXT, allowNull: true }
  });

  const CarteiraPosicao = definir("CarteiraPosicao", "carteira_posicao", {
    trilha_id: { type: UUID, allowNull: false },
    ativo: { type: STRING(20), allowNull: false },
    lado: { type: STRING(10), allowNull: false },
    contrato: { type: JSONB, allowNull: false },
    origem: { type: STRING(20), allowNull: true },
    data_entrada: { type: DATEONLY, allowNull: false },
    entrada: { type: DECIMAL(20, 6), allowNull: false },
    distancia: preco(),
    stop_inicial: preco(),
    stop: preco(),
    alvo1: preco(),
    alvo2: preco(),
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
    motivo_saida: { type: STRING(20), allowNull: true }
  });

  const CarteiraPosicaoEvento = definir("CarteiraPosicaoEvento", "carteira_posicao_evento", {
    posicao_id: { type: UUID, allowNull: false },
    data: { type: DATEONLY, allowNull: false },
    tipo: { type: STRING(20), allowNull: false },
    preco: preco(),
    quantidade: { type: DECIMAL(20, 6), allowNull: true },
    detalhes: { type: JSONB, allowNull: true }
  });

  const CarteiraOrdem = definir("CarteiraOrdem", "carteira_ordem", {
    rodada_id: { type: UUID, allowNull: true },
    trilha_id: { type: UUID, allowNull: false },
    data_execucao: { type: DATEONLY, allowNull: false },
    ativo: { type: STRING(20), allowNull: false },
    tipo: { type: STRING(20), allowNull: false },
    motivo: { type: STRING(20), allowNull: false },
    lado: { type: STRING(10), allowNull: false },
    contrato: { type: JSONB, allowNull: false },
    quantidade: { type: DECIMAL(20, 6), allowNull: false },
    distancia: preco(),
    sem_stop: { type: BOOLEAN, allowNull: false },
    preco_informado: preco(),
    stop_informado: preco(),
    posicao_id: { type: UUID, allowNull: true },
    situacao: { type: STRING(20), allowNull: false },
    motivo_situacao: { type: STRING(40), allowNull: true },
    preco_execucao: preco(),
    quantidade_executada: { type: DECIMAL(20, 6), allowNull: true },
    detalhes: { type: JSONB, allowNull: true }
  });

  const CarteiraLancamento = definir("CarteiraLancamento", "carteira_lancamento", {
    trilha_id: { type: UUID, allowNull: false },
    rodada_id: { type: UUID, allowNull: true },
    data: { type: DATEONLY, allowNull: false },
    tipo: { type: STRING(20), allowNull: false },
    ativo: { type: STRING(20), allowNull: true },
    posicao_id: { type: UUID, allowNull: true },
    valor: { type: DECIMAL(18, 2), allowNull: false },
    cambio: { type: DECIMAL(12, 6), allowNull: true },
    descricao: { type: TEXT, allowNull: true }
  });

  const CarteiraPatrimonioDiario = definir("CarteiraPatrimonioDiario", "carteira_patrimonio_diario", {
    trilha_id: { type: UUID, allowNull: false },
    data: { type: DATEONLY, allowNull: false },
    patrimonio: { type: DECIMAL(18, 2), allowNull: false }
  });

  // Etapa 4: a recomendação diária da IA (migration 20261014090000).
  const CarteiraRecomendacao = definir("CarteiraRecomendacao", "carteira_recomendacao", {
    rodada_id: { type: UUID, allowNull: false },
    data: { type: DATEONLY, allowNull: false },
    tipo: { type: STRING(10), allowNull: false },
    situacao: { type: STRING(10), allowNull: false },
    motivo_falha: { type: STRING(40), allowNull: true },
    versao_prompt: { type: STRING(60), allowNull: true },
    modelo_pedido: { type: STRING(80), allowNull: true },
    modelo_devolvido: { type: STRING(80), allowNull: true },
    hash_entrada: { type: STRING(64), allowNull: true },
    entrada: { type: JSONB, allowNull: true },
    instrucao: { type: TEXT, allowNull: true },
    prompt: { type: TEXT, allowNull: true },
    respostas: { type: JSONB, allowNull: false },
    recomendacoes: { type: JSONB, allowNull: true },
    contrarias: { type: JSONB, allowNull: true },
    tokens: { type: JSONB, allowNull: true },
    custo_usd: { type: DECIMAL(12, 6), allowNull: true },
    tentativas: { type: JSONB, allowNull: false },
    detalhes: { type: JSONB, allowNull: true }
  });

  return {
    CarteiraRecomendacao,
    Carteira,
    CarteiraParametrosVersao,
    CarteiraTrilha,
    CarteiraRodada,
    CarteiraRodadaLeitura,
    CarteiraIntencao,
    CarteiraPosicao,
    CarteiraPosicaoEvento,
    CarteiraOrdem,
    CarteiraLancamento,
    CarteiraPatrimonioDiario
  };
};
