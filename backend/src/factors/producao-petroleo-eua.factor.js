"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { crescimentoAnualSemanal, somarDias, arredondar, DIAS_SEMANA } = require("./base/crescimento-anual-semanal");

// FATOR (PROPOSTA, ADR 0050): produção de petróleo dos EUA (EIA), fator "Produção dos EUA (shale) e rig count" do
// FEL 1. Mesmo molde do fator de estoques: camadas A e B calculadas, C simulada pela decisão por faixa com parâmetros
// que o Comitê ajusta; o peso é o do FEL 1; não alimenta o motor, o Centro de Decisão nem a IA.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (tabela observation):
//     EIA.PETROLEO_FLUXOS.PRODUCAO - produção semanal de petróleo dos EUA (mil barris/dia). É uma ESTIMATIVA da EIA,
//       arredondada (desde 2023, metade das semanas é múltiplo de 100) e revista depois pelo dado mensal (não
//       coletado): por isso a medida usa a média de 4 semanas e o crescimento anual, não a semana isolada.
//   fator (calculado sob demanda, NUNCA gravado):
//     A. media4Semanas        = média da produção nas semanas t, t-1, t-2 e t-3 (nula se faltar uma)
//        recorde              = a maior produção semanal até t; distanciaRecordePct = producao(t) / recorde - 1
//     B. crescimentoAnualPct  = media4Semanas(t) / media4Semanas(t - 52 semanas) - 1: compara com o mesmo período do
//                               ano anterior, sem sazonalidade
//     C. decisão por faixa sobre crescimentoAnualPct: produção crescendo acima da faixa (mais oferta) = pressão de
//        baixa; encolhendo = pressão de alta (a direção do FEL 1: "alta com produção menor; baixa com produção
//        recorde"); tendência pela mudança do crescimento (subindo ou caindo)
//
// O rig count (Baker Hughes), também no FEL 1, não é coletado: ele antecipa a produção em alguns meses, mas não é
// necessário para medi-la (ADR 0050). Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "producao_petroleo_eua";
const FACTOR_VERSION = 1;

const SERIE_PRODUCAO = "EIA.PETROLEO_FLUXOS.PRODUCAO";

// Padrões do FinMind (2026-10-03), tirados do histórico do banco de dev: |crescimento anual| tem quartis de 1,7 /
// 4,0 / 8,4% desde 1990 e 3,3 / 7,5 / 13,5% desde 2010; a mudança do crescimento em 13 semanas tem mediana de
// ~2,1 a 2,5 p.p. A janela é de 13 semanas (um trimestre): a produção muda devagar. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 3,
  limiarFortePct: 10,
  semanasTendencia: 13,
  limiarTendenciaPp: 2
});

// "Crescimento subindo/caindo", e não "acelerando": com a produção encolhendo (-10% indo para -7%), "acelerando" confunde.
const ROTULOS_TENDENCIA = { SUBINDO: "Crescimento subindo", CAINDO: "Crescimento caindo", ESTAVEL: "Estável" };

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana (o recorde precisa do histórico inteiro).
// A média de 4 semanas e o crescimento anual vêm do núcleo comum (`base/crescimento-anual-semanal.js`).
function derivarProducaoPetroleoEua(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const crescimentos = new Map();
  const pontos = [];
  let recorde = -Infinity;
  for (const semana of crescimentoAnualSemanal(linhasAsOf, SERIE_PRODUCAO)) {
    const { observedAt, linha, crescimentoAnualPct } = semana;
    recorde = Math.max(recorde, linha.value);
    crescimentos.set(observedAt, crescimentoAnualPct);
    const anterior = crescimentos.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      producao: linha.value,
      media4Semanas: semana.media4Semanas,
      mediaAnoAnterior: semana.mediaAnoAnterior,
      recorde,
      distanciaRecordePct: arredondar((linha.value / recorde - 1) * 100, 2),
      crescimentoAnualPct,
      decisao: faixa.decidirPorFaixa(crescimentoAnualPct, anterior ?? null, parametros),
      disponivelEm: linha.publishedAt,
      disponivelEmEhEstimado: linha.publishedAtIsEstimated
    });
  }
  return pontos;
}

async function calcularProducaoPetroleoEua({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: [SERIE_PRODUCAO], asOf }, deps);
  return derivarProducaoPetroleoEua(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

function descreverRecorde(p) {
  if (p.distanciaRecordePct === 0) return "Está em recorde.";
  return `Está ${faixa.fmt(Math.abs(p.distanciaRecordePct))}% abaixo do recorde.`;
}

const TEXTOS = {
  campo: "crescimentoAnualPct",
  primeiroPasso: (p) =>
    `A produção média das últimas 4 semanas é de ${faixa.fmt(p.media4Semanas, 0)} mil barris/dia, ` +
    `${faixa.comSinal(p.crescimentoAnualPct)}% contra o mesmo período do ano anterior (B). ${descreverRecorde(p)}`,
  nomeValor: "o crescimento anual",
  abaixo: "produção encolhendo é menos oferta",
  acima: "produção crescendo é mais oferta",
  subindo: "a produção cresce mais (ou encolhe menos) que antes",
  caindo: "a produção cresce menos (ou encolhe mais) que antes",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const EPISODIOS = [
  { data: "2014-11-28", rotulo: "Recorde, antes da queda do petróleo de 2015" },
  { data: "2016-09-30", rotulo: "Produção encolhendo depois da queda do preço" },
  { data: "2019-11-29", rotulo: "Recorde, antes de 2020" },
  { data: "2020-06-26", rotulo: "Corte na pandemia" },
  { data: "2023-12-29", rotulo: "Volta ao recorde" }
];
const CENARIOS = [
  { valor: 14, valorAnterior: 9, rotulo: "Crescendo forte e acelerando" },
  { valor: 6, valorAnterior: 6.5, rotulo: "Crescendo e estável" },
  { valor: 1, valorAnterior: 5, rotulo: "Quase parada, depois de crescer" },
  { valor: -5, valorAnterior: -1, rotulo: "Encolhendo e piorando" },
  { valor: -12, valorAnterior: -15, rotulo: "Encolhendo forte, mas melhorando" }
];

function explicarProducao(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosProducao(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, { campo: TEXTOS.campo, episodios: EPISODIOS, cenarios: CENARIOS });
}

const APRESENTACAO = {
  unidade: "mil barris/dia",
  quadros: [
    { camada: "A", rotulo: "Produção média de 4 semanas", campo: "media4Semanas", casas: 0, sufixo: "mil barris/dia" },
    {
      camada: "A",
      rotulo: "Distância do recorde",
      campo: "distanciaRecordePct",
      casas: 2,
      unidadeValor: "%",
      secundario: { campo: "recorde", casas: 0, prefixo: "recorde:", sufixo: "mil barris/dia" }
    },
    { camada: "B", rotulo: "Mesmo período do ano anterior", campo: "mediaAnoAnterior", casas: 0, sufixo: "mil barris/dia" },
    { camada: "B", rotulo: "Crescimento anual", campo: "crescimentoAnualPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Produção média de 4 semanas (A) × a do mesmo período do ano anterior (B)",
    unidade: "mil barris/dia",
    casas: 0,
    exigeCampo: "mediaAnoAnterior",
    series: [
      { campo: "media4Semanas", rotulo: "Produção (A)" },
      { campo: "mediaAnoAnterior", rotulo: "Ano anterior (B)" }
    ]
  },
  graficoC: { titulo: "Crescimento anual (B) e as faixas da decisão (C)", campo: "crescimentoAnualPct", rotulo: "Crescimento anual (B)" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.PARAMETROS_FAIXA,
  exemplos: { colunaValor: "Crescimento anual" },
  nota:
    "Semanal, não é tempo real: a EIA publica na quarta (quinta com feriado) a semana encerrada na sexta anterior. " +
    "A produção semanal é uma estimativa da EIA, arredondada e revista depois pelo dado mensal."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularProducaoPetroleoEua,
  explicar: explicarProducao,
  exemplos: exemplosProducao,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIE_PRODUCAO,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  derivarProducaoPetroleoEua,
  calcularProducaoPetroleoEua,
  explicarProducao,
  exemplosProducao
};
