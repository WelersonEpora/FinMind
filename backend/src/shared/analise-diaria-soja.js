"use strict";

const { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, criarClassificador } = require("./analise-diaria-base");

// Configuração do prompt diário de análise da soja (ADR 0116), no molde da do café (analise-diaria-cafe.js): o que a
// metodologia define e o prompt só MOSTRA. Nada daqui é escrito à mão no texto do prompt (ai/prompts/soja-analise-diaria.md).
// Mudar um valor = versão nova desta configuração (VERSAO), gravada com cada leitura.

// v1 (2026-10-08): a primeira, com a aprovação da soja pelo Comitê, com o David (ADR 0116).
const VERSAO = 1;

// Os mesmos quatro horizontes dos outros ativos, em dias corridos.
const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", rotulo: "Imediato", dias: 1, variacao: "d1" },
  { codigo: "CURTO", rotulo: "Curto", dias: 7, variacao: "d7" },
  { codigo: "MEDIO", rotulo: "Médio", dias: 30, variacao: "d30" },
  { codigo: "LONGO", rotulo: "Longo", dias: 90, variacao: "d90" }
]);

// As faixas de variação da soja, em %, por horizonte. PROVISÓRIAS (2026-10-08), pelo critério dos outros ativos (ADR
// 0079): T1 e T2 são os percentis 40 e 80 da variação absoluta do SJC da B3 (US$/saca) no contrato de cada horizonte (o
// mais próximo que ainda negocia depois da data-alvo; o IMEDIATO, o próximo pregão), de 2022-03-21 a 2026-10-07 (886 a
// 948 pregões, banco de dev), arredondados: |1 dia| 0,54 / 1,44%; |7 dias| 1,20 / 3,04%; |30 dias| 2,65 / 6,41%; |90
// dias| 2,91 / 7,92%. Com o vencimento mais próximo para todos, quase o mesmo em 1 e 7 dias e menos em 30 e 90 (2,12 /
// 5,77% e 2,28 / 6,38%). O histórico é curto e tem um buraco de cerca de 9 meses em 2023: o de 90 dias fica perto do de 30.
// A metodologia ajusta.
const FAIXAS = Object.freeze({
  IMEDIATO: { t1: 0.5, t2: 1.4 },
  CURTO: { t1: 1.2, t2: 3 },
  MEDIO: { t1: 2.6, t2: 6.4 },
  LONGO: { t1: 2.9, t2: 7.9 }
});

// De onde os horizontes contam (analise-diaria-base.js::REFERENCIA_HORIZONTES; ADR 0106), como nos outros ativos.
const REFERENCIA_HORIZONTES = "DATA_DO_PRECO_RECEBIDO";

// O preço de referência (ADR 0116): o futuro SJC da B3 (soja, US$/saca), liquidado pelo preço da soja da CME; o
// vencimento de cada horizonte (centro-decisao.service.js::lerFuturo), sem emendar contratos. O preço também em reais,
// pela PTAX de venda do mesmo dia, como referência.
const PRECO = Object.freeze({
  serie: "SJC",
  moeda: "US$",
  pregoesNoHistorico: 10,
  rotulo: "soja (SJC)",
  unidadeHistorico: "US$/saca",
  unidadeEmReais: "por saca",
  descricaoFaixas: "preço da soja no futuro SJC da B3, no vencimento de cada horizonte (a linha \"Contrato\" de cada um)",
  avisos: Object.freeze([
    "Aviso: o SJC é o futuro de soja da B3 (US$ por saca de 60 kg), liquidado pelo preço de ajuste do minicontrato de soja da CME: é o preço de Chicago convertido de bushel para saca (uma saca tem 2,2046 bushels). O câmbio e o prêmio do porto não entram no preço. O COT dos fundos é o da soja de Chicago (CBOT).",
    "Aviso: cada vencimento é uma série própria e nada é emendado: as variações usam só o histórico do contrato atual. Um contrato com pouco histórico, ou que não negociou na data de comparação, deixa a variação SEM DADO."
  ]),
  emReais: true
});

// A curva do SJC e o vencimento de cada horizonte (como o ADR 0078): cada horizonte usa o vencimento mais próximo que
// ainda vale depois da data-alvo, e a curva vai ao bloco 2.2. O aviso de menos de 100 contratos no dia, como no milho e
// no café.
const CURVA = Object.freeze({
  aplica: true,
  porHorizonte: true,
  fonte: "B3 (ajuste e contratos negociados de cada vencimento do SJC)",
  liquidezMinima: 100,
  semDado: "SEM DADO: nenhum vencimento do SJC negociou até a data.",
  lacuna: "Curva do SJC sem dado na data"
});

const NOME = "analise-diaria-soja";
const ARQUIVO_PROMPT = "soja-analise-diaria.md";
const COLETOR = "soja-analise-ia-diario";

const classificarVariacao = criarClassificador(FAIXAS);

module.exports = {
  VERSAO,
  NOME,
  ARQUIVO_PROMPT,
  COLETOR,
  HORIZONTES,
  FAIXAS,
  CODIGOS_FAIXA,
  TENDENCIA_DA_FAIXA,
  REFERENCIA_HORIZONTES,
  PRECO,
  CURVA,
  classificarVariacao
};
