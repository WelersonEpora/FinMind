"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarDias, mediaSemanal } = require("./base/semana-de-dias");

// FATOR (PROPOSTA, ADR 0050): dólar, fator "Dólar (índice DXY)" do FEL 1 para o petróleo. Mesmo molde dos outros:
// camadas A e B calculadas, C simulada pela decisão por faixa com parâmetros que o Comitê ajusta; o peso é o do
// FEL 1; não alimenta o motor, o Centro de Decisão nem a IA.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (tabela observation):
//     FRED.DTWEXAFEGS - índice do dólar do Fed contra as moedas das economias avançadas (euro, iene, libra, dólar
//       canadense, franco suíço, dólar australiano e coroa sueca), diário, base jan/2006 = 100. É o mais próximo do
//       DXY que o FEL 1 cita (o DXY oficial, da ICE, é licenciado e não é coletado). O índice amplo (26 moedas,
//       DTWEXBGS) também é coletado e fica como alternativa (pergunta ao David)
//   fator (calculado sob demanda, NUNCA gravado):
//     A. indice da semana = média dos dias da semana (sábado a sexta); variacao13SemanasPct = contra 13 semanas
//        antes (contexto: é o movimento recente do dólar)
//     B. media52Semanas = média do índice nas 52 semanas anteriores (o normal recente; nula com menos de 48 delas);
//        desvioPct = indice / media52Semanas - 1
//     C. decisão por faixa sobre o desvio: dólar acima do normal = pressão de BAIXA para o petróleo ("dólar forte
//        pressiona; dólar fraco favorece", FEL 1)
//
// No histórico (2006 a 2026), o dólar é o fator com a relação mais forte com o preço: o desvio contra a média de 52
// semanas tem -0,56 com a variação do WTI dos 6 meses anteriores (os dois andam juntos, em sentidos opostos) e
// -0,37 com o WTI 26 semanas depois, desde 2015. O Fed divulga os índices em lote semanal (segundas): a última
// semana pode estar incompleta. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "dolar_petroleo_afe";
const FACTOR_VERSION = 1;

const SERIE_DOLAR = "FRED.DTWEXAFEGS";

const DIAS_SEMANA = 7;
const SEMANAS_MEDIA = 52;
const SEMANAS_MINIMAS = 48;
const SEMANAS_VARIACAO = 13;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev desde 2010: |desvio| tem percentis 40/60/80 de
// 1,8 / 2,9 / 4,3%; a mudança do desvio em 4 semanas tem mediana de ~1,2 p.p. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 2,
  limiarFortePct: 5,
  semanasTendencia: 4,
  limiarTendenciaPp: 1.5
});

const ROTULOS_TENDENCIA = { SUBINDO: "Dólar se fortalecendo", CAINDO: "Dólar se enfraquecendo", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana.
function derivarDolarPetroleo(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const semanas = mediaSemanal(linhasAsOf, SERIE_DOLAR);
  const indiceEm = (data) => semanas.get(data)?.media;

  const desvios = new Map();
  const pontos = [];
  for (const observedAt of [...semanas.keys()].sort()) {
    const semana = semanas.get(observedAt);
    const anteriores = [];
    for (let k = 1; k <= SEMANAS_MEDIA; k += 1) {
      const valor = indiceEm(somarDias(observedAt, -DIAS_SEMANA * k));
      if (valor !== undefined) anteriores.push(valor);
    }
    const media = anteriores.length >= SEMANAS_MINIMAS ? anteriores.reduce((a, b) => a + b, 0) / anteriores.length : null;
    const desvioPct = media === null ? null : arredondar((semana.media / media - 1) * 100, 2);
    desvios.set(observedAt, desvioPct);
    const antes13 = indiceEm(somarDias(observedAt, -DIAS_SEMANA * SEMANAS_VARIACAO));
    const anterior = desvios.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      indice: arredondar(semana.media, 2),
      diasNaSemana: semana.dias,
      variacao13SemanasPct: antes13 ? arredondar((semana.media / antes13 - 1) * 100, 2) : null,
      media52Semanas: media === null ? null : arredondar(media, 2),
      desvioPct,
      decisao: faixa.decidirPorFaixa(desvioPct, anterior ?? null, parametros),
      disponivelEm: semana.disponivelEm,
      disponivelEmEhEstimado: semana.estimado
    });
  }
  return pontos;
}

async function calcularDolarPetroleo({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: [SERIE_DOLAR], asOf }, deps);
  return derivarDolarPetroleo(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "desvioPct",
  primeiroPasso: (p) =>
    `O dólar contra as moedas das economias avançadas ficou em ${faixa.fmt(p.indice)} na semana, ` +
    `${faixa.comSinal(p.desvioPct)}% contra a média das 52 semanas anteriores (B).`,
  nomeValor: "o desvio",
  abaixo: "dólar abaixo do normal (fraco) favorece o petróleo",
  acima: "dólar acima do normal (forte) pressiona o petróleo",
  subindo: "o dólar está se fortalecendo em relação ao normal",
  caindo: "o dólar está se enfraquecendo em relação ao normal",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const EPISODIOS = [
  { data: "2008-10-31", rotulo: "Disparada do dólar na crise de 2008" },
  { data: "2014-12-26", rotulo: "Dólar forte na queda do petróleo de 2014" },
  { data: "2020-03-20", rotulo: "Corrida para o dólar na pandemia" },
  { data: "2022-09-30", rotulo: "Pico do dólar com a alta de juros do Fed" },
  { data: "2025-04-25", rotulo: "Dólar fraco depois do anúncio das tarifas" }
];
const CENARIOS = [
  { valor: 8, valorAnterior: 4, rotulo: "Bem acima do normal e se fortalecendo" },
  { valor: 3, valorAnterior: 3.2, rotulo: "Acima do normal e estável" },
  { valor: 0.5, valorAnterior: 3, rotulo: "Perto do normal, depois de forte" },
  { valor: -3, valorAnterior: -1, rotulo: "Abaixo do normal e se enfraquecendo" },
  { valor: -6, valorAnterior: -8, rotulo: "Bem abaixo do normal, voltando" }
];

function explicarDolar(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosDolar(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, { campo: TEXTOS.campo, episodios: EPISODIOS, cenarios: CENARIOS });
}

const APRESENTACAO = {
  unidade: "índice",
  quadros: [
    {
      camada: "A",
      rotulo: "Dólar (economias avançadas)",
      campo: "indice",
      casas: 2,
      secundario: { campo: "diasNaSemana", casas: 0, prefixo: "índice Fed, média de", sufixo: "dia(s)" }
    },
    { camada: "A", rotulo: "Variação em 13 semanas (contexto)", campo: "variacao13SemanasPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Média das 52 semanas anteriores", campo: "media52Semanas", casas: 2, sufixo: "índice" },
    { camada: "B", rotulo: "Desvio contra a média", campo: "desvioPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Dólar contra as economias avançadas (A) × média das 52 semanas anteriores (B)",
    unidade: "índice",
    casas: 2,
    exigeCampo: "media52Semanas",
    series: [
      { campo: "indice", rotulo: "Dólar (A)" },
      { campo: "media52Semanas", rotulo: "Média de 52 semanas (B)" }
    ]
  },
  graficoC: { titulo: "Desvio (B) e as faixas da decisão (C)", campo: "desvioPct", rotulo: "Desvio (B)" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.PARAMETROS_FAIXA,
  exemplos: { colunaValor: "Desvio" },
  nota:
    "Semanal, não é tempo real: o Fed divulga os índices diários em lote semanal (segundas); a última semana pode " +
    "estar incompleta. Índice do Fed contra as economias avançadas, o mais próximo do DXY (licenciado, não coletado)."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularDolarPetroleo,
  explicar: explicarDolar,
  exemplos: exemplosDolar,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIE_DOLAR,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  derivarDolarPetroleo,
  calcularDolarPetroleo,
  explicarDolar,
  exemplosDolar
};
