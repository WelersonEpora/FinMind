"use strict";

const { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, criarClassificador } = require("./analise-diaria-base");

// Configuração do prompt diário de análise do dólar (USD/BRL, ADR 0126), no molde da soja (analise-diaria-soja.js): o
// que a metodologia define e o prompt só MOSTRA. Nada daqui é escrito à mão no texto do prompt
// (ai/prompts/dolar-analise-diaria.md). Mudar um valor = versão nova desta configuração (VERSAO), gravada com cada leitura.

// v1 (2026-10-09): a primeira, com a aprovação do dólar (decisões do usuário de 2026-10-09, ADR 0117, adendo; ADR 0126).
const VERSAO = 1;

// Os mesmos quatro horizontes dos outros ativos, em dias corridos.
const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", rotulo: "Imediato", dias: 1, variacao: "d1" },
  { codigo: "CURTO", rotulo: "Curto", dias: 7, variacao: "d7" },
  { codigo: "MEDIO", rotulo: "Médio", dias: 30, variacao: "d30" },
  { codigo: "LONGO", rotulo: "Longo", dias: 90, variacao: "d90" }
]);

// As faixas de variação do dólar, em %, por horizonte (2026-10-09), pelo critério dos outros ativos (ADR 0079): T1 e T2
// são os percentis 40 e 80 da variação absoluta da PTAX de venda, de 2010 a 2026 (4.141 a 4.203 dias, banco de dev),
// arredondados: |1 dia| 0,35 / 0,97%; |7 dias| 0,86 / 2,34%; |30 dias| 1,91 / 4,94%; |90 dias| 3,10 / 8,57%. Estáveis:
// desde 2000 e desde 2016, a diferença é de até 0,3 p.p. no de 90 dias.
const FAIXAS = Object.freeze({
  IMEDIATO: { t1: 0.4, t2: 1 },
  CURTO: { t1: 0.9, t2: 2.3 },
  MEDIO: { t1: 1.9, t2: 4.9 },
  LONGO: { t1: 3.1, t2: 8.6 }
});

// De onde os horizontes contam (analise-diaria-base.js::REFERENCIA_HORIZONTES; ADR 0106), como nos outros ativos.
const REFERENCIA_HORIZONTES = "DATA_DO_PRECO_RECEBIDO";

// O preço de referência (decisão 6): a PTAX de venda do BCB, em R$ por US$, em market_quote (shared/preco-market-quote.js).
const PRECO = Object.freeze({
  serie: "PTAX",
  moeda: "R$",
  // A PTAX tem 4 casas (R$ por US$): com 2, a variação de um dia sumiria.
  casas: 4,
  pregoesNoHistorico: 10,
  rotulo: "dólar (PTAX)",
  unidadeHistorico: "R$/US$",
  descricaoFaixas: "dólar pela PTAX de venda do BCB",
  avisos: Object.freeze([
    "Aviso: a PTAX de venda é a taxa oficial do BCB, a média das quatro janelas de apuração entre 10h e 13h20, publicada perto das 13h30. É uma foto do meio do dia: um movimento da tarde só entra na PTAX do dia seguinte.",
    "Aviso: o ajuste do DOL (o dólar futuro da B3, bloco 2.2) embute o diferencial de juros até o vencimento: não é a PTAX, e a diferença entre os dois não é sinal por si."
  ]),
  emReais: false
});

// A curva do DOL como CONTEXTO (decisão 6): o ajuste de cada vencimento negociado no último pregão, com os contratos. Não
// é o preço de referência e não tem um contrato por horizonte (`porHorizonte: false`): a leitura e a avaliação são pela
// PTAX. `futuro`: de onde a curva vem (o preço de referência não é um futuro).
const CURVA = Object.freeze({
  aplica: true,
  porHorizonte: false,
  futuro: Object.freeze({ prefixo: "B3.DOL", campo: "SETTLE" }),
  fonte: "B3 (ajuste de cada vencimento do DOL, em R$ por US$ 1.000, e os contratos negociados no dia)",
  liquidezMinima: 100,
  // Só os vencimentos negociados no dia: o DOL concentra os negócios no 1º vencimento, e os outros têm só o ajuste teórico.
  soComNegocios: true,
  semDado: "SEM DADO: nenhum vencimento do DOL negociou até a data.",
  lacuna: "Curva do DOL sem dado na data"
});

const NOME = "analise-diaria-dolar";
const ARQUIVO_PROMPT = "dolar-analise-diaria.md";
const COLETOR = "dolar-analise-ia-diario";

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
