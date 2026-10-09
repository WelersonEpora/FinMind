"use strict";

const { criarFatorFundosCot } = require("./modelos/fundos-cot");
const { PARAMETROS_POSICAO } = require("./modelos/posicao-historica");
const d = require("./modelos/dolar-comum");

// REGRA R1 do dólar: o posicionamento dos fundos, igual ao café e à soja (proposta do dólar, §2.4; decisão do usuário,
// 2026-10-09, ADR 0117, adendo; ADR 0126). Regra da LEITURA CONSOLIDADA, só de INFORMAÇÃO: marca o papel dos fundos na
// leitura (EXCESSO, ou SEM_PAPEL com o extremo contra), sem mudar a direção, a faixa nem a confiança. Só em 7 e 30 dias.
// O relatório do Comitê dava direção ao fator 7; no petróleo e no café o extremo não antecipou reversão nem continuação
// (ADRs 0089 e 0094).
//
// O cálculo é o molde do COT (modelos/fundos-cot.js) sobre o futuro do real brasileiro na CME, pelo relatório TFF da CFTC
// (ADR 0120): os fundos alavancados (leveraged money), comprados e vendidos EM REAL, em % dos contratos em aberto, no
// percentil dos 3 anos anteriores. O estado: EXTREMO COMPRADO EM REAL no percentil 90 ou acima, EXTREMO VENDIDO no 10 ou
// abaixo. O extremo, lido como reversão (como no café), aponta para o DÓLAR: comprados em real, alta do dólar (o real
// tende a devolver); vendidos em real, baixa do dólar.

const FACTOR_ID = "fundos_dolar_cot_brl";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  comprados: "CFTC.BRL.LEV_MONEY_LONG",
  vendidos: "CFTC.BRL.LEV_MONEY_SHORT",
  contratosEmAberto: "CFTC.BRL.OPEN_INTEREST"
});

const PARAMETROS_PADRAO = Object.freeze({ limiarFortePct: 40 });

const cot = criarFatorFundosCot({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  series: SERIES,
  parametrosPadrao: PARAMETROS_POSICAO,
  mercado: "no real brasileiro (CME)",
  episodios: [],
  nota: ""
});

// O lado que o extremo aponta é o do DÓLAR (o preço lido), o contrário do lado dos fundos no real.
const ESTADOS = {
  EXTREMO_COMPRADO: { codigo: "EXTREMO_COMPRADO", rotulo: "Extremo comprado em real", aponta: "ALTA" },
  EXTREMO_VENDIDO: { codigo: "EXTREMO_VENDIDO", rotulo: "Extremo vendido em real", aponta: "BAIXA" },
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
    "nos horizontes CURTO e MEDIO, o extremo aponta ALTA do dólar (reversão: os fundos muito comprados em real tendem a devolver): com a leitura de alta, o papel é EXCESSO; com a de baixa, SEM_PAPEL com o extremo contra. Só informação: não muda a direção, a faixa nem a confiança",
  EXTREMO_VENDIDO:
    "nos horizontes CURTO e MEDIO, o extremo aponta BAIXA do dólar (reversão: os fundos muito vendidos em real tendem a recomprar): com a leitura de baixa, o papel é EXCESSO; com a de alta, SEM_PAPEL com o extremo contra. Só informação: não muda a direção, a faixa nem a confiança",
  FORA_DO_EXTREMO: "SEM_PAPEL em todos os horizontes"
};

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
    estadoTexto: estado ? `${estado.rotulo}${estado.aponta ? ` (aponta ${estado.aponta === "ALTA" ? "alta" : "baixa"} do dólar, leitura de reversão)` : ""}` : "sem estado (histórico curto)",
    efeitoTexto: estado ? EFEITO[estado.codigo] : "sem efeito",
    decisao: null,
    disponivelEm: p.disponivelEm,
    disponivelEmEhEstimado: p.disponivelEmEhEstimado
  };
}

function derivarFundosDolar(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  return cot.derivar(linhasAsOf, { parametros: { ...PARAMETROS_POSICAO, ...parametros } }).map((p) => pontoDaRegra(p, parametros));
}

async function calcularFundosDolar({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const pontos = await cot.calcular({ asOf, parametros: { ...PARAMETROS_POSICAO, ...parametros } }, deps);
  return pontos.map((p) => pontoDaRegra(p, parametros));
}

function explicarFundosDolar(ponto) {
  if (!ponto) return [];
  return [
    `Os fundos alavancados estavam com ${d.fmt(ponto.liquida, 0)} contratos líquidos no real (CME), ${d.comSinal(ponto.liquidaPctOi)}% dos contratos em aberto, ` +
      `no percentil ${d.fmt(ponto.percentilJanela, 1)} dos 3 anos anteriores (positivo = comprados em real).`,
    `Estado: ${ponto.estadoTexto}.`,
    `Efeito: ${ponto.efeitoTexto}.`
  ];
}

const EPISODIOS = [
  { data: "2015-09-22", rotulo: "2015: fundos muito vendidos em real" },
  { data: "2020-03-17", rotulo: "Covid" },
  { data: "2026-09-29", rotulo: "Setembro de 2026" }
];

function exemplosFundosDolar(pontos) {
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      const ponto = [...pontos].reverse().find((p) => p.observedAt <= data);
      return { data: ponto?.observedAt || data, rotulo, valor: ponto?.posicaoRelativa ?? null, decisao: null };
    }),
    cenarios: []
  };
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    { camada: "A", rotulo: "Posição líquida dos fundos alavancados no real", campo: "liquida", casas: 0, sufixo: "contratos (positivo = comprados em real)", secundario: { campo: "variacaoSemanal", casas: 0, sinal: true, prefixo: "variação na semana:", sufixo: "contratos" } },
    { camada: "A", rotulo: "Líquida / contratos em aberto", campo: "liquidaPctOi", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Percentil nos 3 anos anteriores", campo: "percentilJanela", casas: 1, sufixo: "0 = mais vendida em real, 100 = mais comprada" },
    { camada: "B", rotulo: "Posição relativa (percentil - 50)", campo: "posicaoRelativa", casas: 1, sinal: true, sufixo: "pontos" }
  ],
  graficoAB: {
    titulo: "Posição líquida dos fundos alavancados no real, em % dos contratos em aberto (A) × a faixa dos 3 anos anteriores (B)",
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
      { chave: "limiarFortePct", sinal: 1, rotulo: "Extremo comprado em real (percentil 90)" },
      { chave: "limiarFortePct", sinal: -1, rotulo: "Extremo vendido em real (percentil 10)" }
    ]
  },
  rotulosDecisao: d.ROTULOS_DECISAO,
  parametros: [
    {
      chave: "limiarFortePct",
      rotulo: "Limite do extremo",
      unidade: "pontos",
      explicacao: "A partir dessa posição relativa (percentil - 50), para cima é extremo comprado em real e para baixo, extremo vendido (decidido: percentis 10 e 90, 40 pontos, os do café)."
    }
  ],
  semTendencia: true,
  regra:
    "os fundos alavancados no real (CME, relatório TFF) em % dos contratos em aberto, no percentil dos 3 anos anteriores: extremo comprado em real com a posição relativa em +{limiarFortePct} pontos ou mais (aponta alta do dólar), vendido em -{limiarFortePct} ou menos (aponta baixa); só em CURTO e MEDIO; o papel (EXCESSO, ou SEM_PAPEL com o extremo contra) é informação: não muda a direção, a faixa nem a confiança",
  exemplos: { colunaValor: "Posição relativa (pontos)" },
  nota: "Semanal, não é tempo real: a posição é de terça e a CFTC a divulga na sexta seguinte, com semanas faltando no histórico do real. Fundos = leveraged money (o TFF, o relatório das moedas), só futuros, no real brasileiro da CME."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularFundosDolar,
  explicar: explicarFundosDolar,
  exemplos: exemplosFundosDolar,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, estadoDaPosicao, derivarFundosDolar, calcularFundosDolar };
