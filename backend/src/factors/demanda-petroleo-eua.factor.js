"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { crescimentoAnualSemanal, somarDias, DIAS_SEMANA } = require("./base/crescimento-anual-semanal");

// FATOR (PROPOSTA, ADR 0050): demanda de petróleo dos EUA (EIA), fator "Demanda global e atividade econômica" do FEL 1.
// Mesmo molde dos fatores de estoques e de produção: camadas A e B calculadas, C simulada pela decisão por faixa com
// parâmetros que o Comitê ajusta; o peso é o do FEL 1; não alimenta o motor, o Centro de Decisão nem a IA.
//
// Só os EUA, por decisão do usuário (2026-10-03): a demanda da China no JODI (que o FEL 1 cita) é marcada pelo
// próprio JODI como "não avaliada" e caiu ~30% de mar a jun/2026 sem explicação; fica como lacuna e pergunta ao David.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (tabela observation):
//     EIA.PETROLEO_FLUXOS.DERIVADOS_FORNECIDOS - total de derivados fornecidos ao mercado dos EUA, semanal (mil
//       barris/dia): a medida de consumo do Weekly Petroleum Status Report
//   fator (calculado sob demanda, NUNCA gravado):
//     A. media4Semanas       = média das últimas 4 semanas (a semana isolada oscila com feriados)
//     B. crescimentoAnualPct = contra as mesmas 4 semanas do ano anterior (núcleo `base/crescimento-anual-semanal.js`)
//     C. decisão por faixa sobre crescimentoAnualPct, com o sentido INVERSO dos fatores de oferta: consumo crescendo
//        acima da faixa = pressão de ALTA ("alta com demanda forte; baixa com recessão", FEL 1)
//
// A demanda não antecipa o preço no histórico: anda junto com ele (os dois seguem a economia). Mede a situação.
// Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "demanda_petroleo_eua";
const FACTOR_VERSION = 1;

const SERIE_DEMANDA = "EIA.PETROLEO_FLUXOS.DERIVADOS_FORNECIDOS";

// Padrões do FinMind (2026-10-03), do histórico do banco de dev desde 2010: |crescimento anual| tem percentis 40/60/80
// de 1,6 / 2,8 / 5,0%; a mudança do crescimento em 13 semanas tem mediana de ~2,5 a 2,7 p.p. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 2,
  limiarFortePct: 5,
  semanasTendencia: 13,
  limiarTendenciaPp: 2.5
});

const ACIMA_PRESSIONA = faixa.DIRECAO.ALTA;
const ROTULOS_TENDENCIA = { SUBINDO: "Crescimento subindo", CAINDO: "Crescimento caindo", ESTAVEL: "Estável" };

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana.
function derivarDemandaPetroleoEua(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const crescimentos = new Map();
  return crescimentoAnualSemanal(linhasAsOf, SERIE_DEMANDA).map((semana) => {
    const { observedAt, linha, crescimentoAnualPct } = semana;
    crescimentos.set(observedAt, crescimentoAnualPct);
    const anterior = crescimentos.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
    return {
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      demanda: linha.value,
      media4Semanas: semana.media4Semanas,
      mediaAnoAnterior: semana.mediaAnoAnterior,
      crescimentoAnualPct,
      decisao: faixa.decidirPorFaixa(crescimentoAnualPct, anterior ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: linha.publishedAt,
      disponivelEmEhEstimado: linha.publishedAtIsEstimated
    };
  });
}

async function calcularDemandaPetroleoEua({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: [SERIE_DEMANDA], asOf }, deps);
  return derivarDemandaPetroleoEua(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "crescimentoAnualPct",
  primeiroPasso: (p) =>
    `O consumo médio das últimas 4 semanas nos EUA é de ${faixa.fmt(p.media4Semanas, 0)} mil barris/dia, ` +
    `${faixa.comSinal(p.crescimentoAnualPct)}% contra o mesmo período do ano anterior (B).`,
  nomeValor: "o crescimento anual",
  abaixo: "consumo encolhendo é demanda fraca",
  acima: "consumo crescendo é demanda forte",
  subindo: "o consumo cresce mais (ou encolhe menos) que antes",
  caindo: "o consumo cresce menos (ou encolhe mais) que antes",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const EPISODIOS = [
  { data: "2008-12-26", rotulo: "Recessão de 2008" },
  { data: "2009-06-26", rotulo: "Fundo da recessão" },
  { data: "2015-07-31", rotulo: "Demanda firme com o petróleo barato" },
  { data: "2020-04-24", rotulo: "Pandemia" },
  { data: "2021-06-25", rotulo: "Reabertura depois da pandemia" }
];
const CENARIOS = [
  { valor: 7, valorAnterior: 3, rotulo: "Crescendo forte e subindo" },
  { valor: 3, valorAnterior: 3.5, rotulo: "Crescendo e estável" },
  { valor: 0.5, valorAnterior: 4, rotulo: "Quase parado, depois de crescer" },
  { valor: -3, valorAnterior: 0, rotulo: "Encolhendo e piorando" },
  { valor: -8, valorAnterior: -12, rotulo: "Encolhendo forte, mas melhorando" }
];

function explicarDemanda(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosDemanda(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    episodios: EPISODIOS,
    cenarios: CENARIOS,
    acimaPressiona: ACIMA_PRESSIONA
  });
}

const APRESENTACAO = {
  unidade: "mil barris/dia",
  quadros: [
    { camada: "A", rotulo: "Consumo semanal (derivados fornecidos)", campo: "demanda", casas: 0, sufixo: "mil barris/dia" },
    { camada: "A", rotulo: "Consumo médio de 4 semanas", campo: "media4Semanas", casas: 0, sufixo: "mil barris/dia" },
    { camada: "B", rotulo: "Mesmo período do ano anterior", campo: "mediaAnoAnterior", casas: 0, sufixo: "mil barris/dia" },
    { camada: "B", rotulo: "Crescimento anual", campo: "crescimentoAnualPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Consumo médio de 4 semanas nos EUA (A) × o do mesmo período do ano anterior (B)",
    unidade: "mil barris/dia",
    casas: 0,
    exigeCampo: "mediaAnoAnterior",
    series: [
      { campo: "media4Semanas", rotulo: "Consumo (A)" },
      { campo: "mediaAnoAnterior", rotulo: "Ano anterior (B)" }
    ]
  },
  graficoC: { titulo: "Crescimento anual (B) e as faixas da decisão (C)", campo: "crescimentoAnualPct", rotulo: "Crescimento anual (B)" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.PARAMETROS_FAIXA,
  exemplos: { colunaValor: "Crescimento anual" },
  nota:
    "Semanal, não é tempo real: a EIA publica na quarta (quinta com feriado) a semana encerrada na sexta anterior. " +
    "Só os EUA: a China (JODI) é lacuna, ver as perguntas ao David."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularDemandaPetroleoEua,
  explicar: explicarDemanda,
  exemplos: exemplosDemanda,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIE_DEMANDA,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  derivarDemandaPetroleoEua,
  calcularDemandaPetroleoEua,
  explicarDemanda,
  exemplosDemanda
};
