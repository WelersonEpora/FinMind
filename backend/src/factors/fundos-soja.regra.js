"use strict";

const { criarFatorFundosCot } = require("./modelos/fundos-cot");
const { PARAMETROS_POSICAO } = require("./modelos/posicao-historica");
const s = require("./modelos/soja-comum");

// REGRA R3 da soja: o posicionamento dos fundos, igual ao café (proposta da soja v2.2, §2.6; aprovada pelo Comitê, com o
// David, em 2026-10-08, ADR 0116; o café: ADR 0089 e a revisão). Regra da LEITURA CONSOLIDADA, só de INFORMAÇÃO: marca
// o papel dos fundos na leitura (EXCESSO, ou SEM_PAPEL com o extremo contra), sem mudar a direção, a faixa nem a
// confiança. Só em 7 e 30 dias. Sem peso e sem direção própria: o COT reage ao preço, e no petróleo e no café o extremo
// não antecipou reversão nem continuação (ADRs 0089 e 0094).
//
// O cálculo é o molde do COT (modelos/fundos-cot.js): o managed money da soja na CBOT (CFTC 005602) em % dos contratos em
// aberto, no percentil dos 3 anos anteriores, a posição de terça divulgada na sexta. O estado: EXTREMO COMPRADO no
// percentil 90 ou acima (posição relativa de +40 ou mais), EXTREMO VENDIDO no 10 ou abaixo (-40 ou menos), fora do
// extremo no meio (os limites aprovados, os do café). O extremo, lido como reversão, aponta: comprados, para baixa;
// vendidos, para alta. A IA compara esse lado com a leitura dela para dizer o papel.

const FACTOR_ID = "fundos_soja_cot_cbot";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  comprados: "CFTC.SOYBEANS.MM_LONG",
  vendidos: "CFTC.SOYBEANS.MM_SHORT",
  contratosEmAberto: "CFTC.SOYBEANS.OPEN_INTEREST"
});

// O extremo aprovado: percentis 10 e 90 (posição relativa de 40 pontos).
const PARAMETROS_PADRAO = Object.freeze({ limiarFortePct: 40 });

const cot = criarFatorFundosCot({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  series: SERIES,
  parametrosPadrao: PARAMETROS_POSICAO,
  mercado: "na soja (CBOT)",
  episodios: [],
  nota: ""
});

const ESTADOS = {
  EXTREMO_COMPRADO: { codigo: "EXTREMO_COMPRADO", rotulo: "Extremo comprado", aponta: "BAIXA" },
  EXTREMO_VENDIDO: { codigo: "EXTREMO_VENDIDO", rotulo: "Extremo vendido", aponta: "ALTA" },
  FORA_DO_EXTREMO: { codigo: "FORA_DO_EXTREMO", rotulo: "Fora do extremo", aponta: null }
};

function estadoDaPosicao(posicaoRelativa, parametros) {
  if (posicaoRelativa === null || posicaoRelativa === undefined) return null;
  if (posicaoRelativa >= parametros.limiarFortePct) return ESTADOS.EXTREMO_COMPRADO;
  if (posicaoRelativa <= -parametros.limiarFortePct) return ESTADOS.EXTREMO_VENDIDO;
  return ESTADOS.FORA_DO_EXTREMO;
}

const EFEITO = {
  EXTREMO_COMPRADO:
    "nos horizontes CURTO e MEDIO, o extremo aponta BAIXA (reversão): com a leitura de baixa, o papel é EXCESSO; com a de alta, SEM_PAPEL com o extremo contra. Só informação: não muda a direção, a faixa nem a confiança",
  EXTREMO_VENDIDO:
    "nos horizontes CURTO e MEDIO, o extremo aponta ALTA (reversão): com a leitura de alta, o papel é EXCESSO; com a de baixa, SEM_PAPEL com o extremo contra. Só informação: não muda a direção, a faixa nem a confiança",
  FORA_DO_EXTREMO: "SEM_PAPEL em todos os horizontes"
};

// Um ponto do molde do COT -> o ponto da regra, com o estado.
function pontoDaRegra(p, parametros) {
  const estado = estadoDaPosicao(p.posicaoRelativa, parametros);
  return {
    factorId: FACTOR_ID,
    factorVersion: FACTOR_VERSION,
    observedAt: p.observedAt,
    liquida: p.liquida,
    variacaoSemanal: p.variacaoSemanal,
    liquidaPctOi: p.liquidaPctOi,
    percentilJanela: p.percentilJanela,
    posicaoRelativa: p.posicaoRelativa,
    p10Janela: p.p10Janela,
    medianaJanela: p.medianaJanela,
    p90Janela: p.p90Janela,
    estado: estado ? { codigo: estado.codigo, rotulo: estado.rotulo, aponta: estado.aponta } : null,
    estadoTexto: estado ? `${estado.rotulo}${estado.aponta ? ` (aponta ${estado.aponta === "ALTA" ? "alta" : "baixa"}, leitura de reversão)` : ""}` : "sem estado (histórico curto)",
    efeitoTexto: estado ? EFEITO[estado.codigo] : "sem efeito",
    decisao: null,
    disponivelEm: p.disponivelEm,
    disponivelEmEhEstimado: p.disponivelEmEhEstimado
  };
}

// Função PURA: as linhas de obterAsOf() do COT -> um ponto por semana, com o estado da regra.
function derivarFundosSoja(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  return cot.derivar(linhasAsOf, { parametros: { ...PARAMETROS_POSICAO, ...parametros } }).map((p) => pontoDaRegra(p, parametros));
}

async function calcularFundosSoja({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const pontos = await cot.calcular({ asOf, parametros: { ...PARAMETROS_POSICAO, ...parametros } }, deps);
  return pontos.map((p) => pontoDaRegra(p, parametros));
}

function explicarFundosSoja(ponto) {
  if (!ponto) return [];
  return [
    `Os fundos estavam com ${s.fmt(ponto.liquida, 0)} contratos líquidos na soja (CBOT), ${s.comSinal(ponto.liquidaPctOi)}% dos contratos em aberto, ` +
      `no percentil ${s.fmt(ponto.percentilJanela)} dos 3 anos anteriores.`,
    `Estado: ${ponto.estadoTexto}.`,
    `Efeito: ${ponto.efeitoTexto}.`
  ];
}

const EPISODIOS = [
  { data: "2019-05-14", rotulo: "Guerra comercial: fundos muito vendidos" },
  { data: "2021-01-12", rotulo: "Compras da China: fundos muito comprados" },
  { data: "2026-09-29", rotulo: "Setembro de 2026" }
];

function exemplosFundosSoja(pontos) {
  return s.exemplosPorData(pontos, EPISODIOS, "posicaoRelativa");
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    { camada: "A", rotulo: "Posição líquida dos fundos", campo: "liquida", casas: 0, sufixo: "contratos", secundario: { campo: "variacaoSemanal", casas: 0, sinal: true, prefixo: "variação na semana:", sufixo: "contratos" } },
    { camada: "A", rotulo: "Líquida / contratos em aberto", campo: "liquidaPctOi", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Percentil nos 3 anos anteriores", campo: "percentilJanela", casas: 1, sufixo: "0 = mais vendida, 100 = mais comprada" },
    { camada: "B", rotulo: "Posição relativa (percentil - 50)", campo: "posicaoRelativa", casas: 1, sinal: true, sufixo: "pontos" }
  ],
  graficoAB: {
    titulo: "Posição líquida dos fundos em % dos contratos em aberto (A) × a faixa dos 3 anos anteriores (B)",
    unidade: "%",
    casas: 2,
    exigeCampo: "medianaJanela",
    series: [
      { campo: "liquidaPctOi", rotulo: "Líquida (A)" },
      { campo: "p90Janela", rotulo: "Percentil 90 em 3 anos (B)" },
      { campo: "medianaJanela", rotulo: "Mediana em 3 anos (B)" },
      { campo: "p10Janela", rotulo: "Percentil 10 em 3 anos (B)" }
    ]
  },
  graficoC: {
    titulo: "Posição relativa (B) e os limites do extremo",
    campo: "posicaoRelativa",
    rotulo: "Posição relativa (B)",
    unidade: "pontos",
    limiares: [
      { chave: "limiarFortePct", sinal: 1, rotulo: "Extremo comprado (percentil 90)" },
      { chave: "limiarFortePct", sinal: -1, rotulo: "Extremo vendido (percentil 10)" }
    ]
  },
  rotulosDecisao: s.ROTULOS_DECISAO,
  parametros: [
    {
      chave: "limiarFortePct",
      rotulo: "Limite do extremo",
      unidade: "pontos",
      explicacao: "A partir dessa posição relativa (percentil - 50), para cima é extremo comprado e para baixo, extremo vendido (aprovado: percentis 10 e 90, 40 pontos, os do café)."
    }
  ],
  semTendencia: true,
  regra:
    "o managed money da soja (CBOT) em % dos contratos em aberto, no percentil dos 3 anos anteriores: extremo comprado com a posição relativa em +{limiarFortePct} pontos ou mais, vendido em -{limiarFortePct} ou menos; só em CURTO e MEDIO; o papel (EXCESSO, ou SEM_PAPEL com o extremo contra) é informação: não muda a direção, a faixa nem a confiança",
  exemplos: { colunaValor: "Posição relativa (pontos)" },
  nota:
    "Semanal, não é tempo real: a posição é de terça e a CFTC a divulga na sexta seguinte. Fundos = managed money, só futuros, soja da CBOT (Chicago), o mesmo preço que liquida o SJC."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularFundosSoja,
  explicar: explicarFundosSoja,
  exemplos: exemplosFundosSoja,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, estadoDaPosicao, derivarFundosSoja, calcularFundosSoja };
