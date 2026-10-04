"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarDias } = require("./base/semana-de-dias");

// FATOR (PROPOSTA, ADR 0050): ETFs, fator "Fluxo de ETFs de ouro" do FEL 1. Camadas A e B calculadas, C simulada pela
// decisão por faixa com parâmetros que o Comitê ajusta; o peso é o do FEL 1.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), semanais, do World Gold Council (USO INTERNO, ADR 0037):
//     WGC.ETF.<REGIAO>.TONELADAS - ouro guardado pelos ETFs de cada região (América do Norte, Europa, Ásia e outros)
//   fator (calculado sob demanda, NUNCA gravado):
//     A. totalT = a soma das quatro regiões (a semana só entra com as quatro); fluxo13SemanasT = contra 13 semanas antes
//     B. fluxo13SemanasPct = o mesmo em % do que os ETFs tinham 13 semanas antes (o estoque dos ETFs mudou muito desde
//        2004: em % fica comparável)
//     C. decisão por faixa sobre o fluxo: entradas além da faixa = pressão de ALTA ("alta com entradas em ETFs; baixa
//        com saídas", FEL 1)
//
// No histórico (2007 a 2026, contra a LBMA), o fluxo anda com o ouro (+0,49 com a variação do ouro nas 13 a 26 semanas
// anteriores; +0,77 em 2015 a 2022): os investidores entram com a alta e saem com a queda. Não antecipa de forma estável
// (+0,09 com o ouro 26 semanas depois; +0,30 em 2006 a 2014, -0,20 em 2015 a 2022). Propriedades: determinístico,
// versionado, point-in-time (a data de disponibilidade do WGC é a da 1ª coleta: datas anteriores ficam sem dado), sem IA.

const FACTOR_ID = "etfs_ouro_wgc";
const FACTOR_VERSION = 1;

const REGIOES = ["AMERICA_DO_NORTE", "EUROPA", "ASIA", "OUTROS"];
const SERIES = REGIOES.map((regiao) => `WGC.ETF.${regiao}.TONELADAS`);

const DIAS_SEMANA = 7;
const SEMANAS_FLUXO = 13;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2007 a 2026): |fluxo em 13 semanas| tem percentis
// 40/60/80 de 2,8 / 4,6 / 8,2%; a mudança dele em 4 semanas tem mediana de ~1,9 p.p. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 3,
  limiarFortePct: 8,
  semanasTendencia: 4,
  limiarTendenciaPp: 2
});

const ACIMA_PRESSIONA = faixa.DIRECAO.ALTA;
const ROTULOS_TENDENCIA = { SUBINDO: "Entradas acelerando", CAINDO: "Saídas acelerando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// As linhas de obterAsOf() -> Map(semana -> { total, disponivelEm, estimado }), só as semanas com as quatro regiões.
function semanasCompletas(linhasAsOf) {
  const series = new Set(SERIES);
  const semanas = new Map();
  for (const linha of linhasAsOf) {
    if (!series.has(linha.seriesCode)) continue;
    if (!semanas.has(linha.observedAt)) semanas.set(linha.observedAt, { total: 0, regioes: 0, disponivelEm: null, estimado: false });
    const semana = semanas.get(linha.observedAt);
    semana.total += linha.value;
    semana.regioes += 1;
    if (!semana.disponivelEm || linha.publishedAt > semana.disponivelEm) semana.disponivelEm = linha.publishedAt;
    semana.estimado = semana.estimado || linha.publishedAtIsEstimated;
  }
  for (const [data, semana] of semanas) if (semana.regioes < REGIOES.length) semanas.delete(data);
  return semanas;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana.
function derivarEtfsOuro(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const semanas = semanasCompletas(linhasAsOf);
  const fluxos = new Map();
  const pontos = [];
  for (const observedAt of [...semanas.keys()].sort()) {
    const semana = semanas.get(observedAt);
    const antes = semanas.get(somarDias(observedAt, -DIAS_SEMANA * SEMANAS_FLUXO))?.total;
    const fluxoPct = antes ? arredondar((semana.total / antes - 1) * 100, 2) : null;
    fluxos.set(observedAt, fluxoPct);
    const anterior = fluxos.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      totalT: arredondar(semana.total, 1),
      fluxo13SemanasT: antes ? arredondar(semana.total - antes, 1) : null,
      total13SemanasAntesT: antes ? arredondar(antes, 1) : null,
      fluxo13SemanasPct: fluxoPct,
      decisao: faixa.decidirPorFaixa(fluxoPct, anterior ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: semana.disponivelEm,
      disponivelEmEhEstimado: semana.estimado
    });
  }
  return pontos;
}

async function calcularEtfsOuro({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: SERIES, asOf }, deps);
  return derivarEtfsOuro(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "fluxo13SemanasPct",
  primeiroPasso: (p) =>
    `Os ETFs de ouro tinham ${faixa.fmt(p.totalT, 0)} t na semana, ${faixa.comSinal(p.fluxo13SemanasT, 0)} t em 13 semanas: ` +
    `${faixa.comSinal(p.fluxo13SemanasPct)}% do que tinham 13 semanas antes (B).`,
  nomeValor: "o fluxo",
  abaixo: "saídas dos ETFs devolvem ouro ao mercado e mostram investidores saindo",
  acima: "entradas nos ETFs tiram ouro do mercado e mostram investidores entrando",
  subindo: "as entradas estão ganhando força (ou as saídas perdendo)",
  caindo: "as saídas estão ganhando força (ou as entradas perdendo)",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const EPISODIOS = [
  { data: "2013-06-28", rotulo: "Saída em massa dos ETFs na queda de 2013" },
  { data: "2016-04-29", rotulo: "Volta dos investidores em 2016" },
  { data: "2020-07-31", rotulo: "Entradas recordes na pandemia" },
  { data: "2022-12-30", rotulo: "Saídas com a alta de juros do Fed" }
];
const CENARIOS = [
  { valor: 12, valorAnterior: 6, rotulo: "Entradas fortes e acelerando" },
  { valor: 5, valorAnterior: 5.5, rotulo: "Entradas acima do normal, ritmo estável" },
  { valor: 1, valorAnterior: 6, rotulo: "Fluxo pequeno, depois de entradas fortes" },
  { valor: -5, valorAnterior: -2, rotulo: "Saídas e acelerando" },
  { valor: -10, valorAnterior: -12, rotulo: "Saídas fortes, perdendo ritmo" }
];

function explicarEtfs(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosEtfs(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    episodios: EPISODIOS,
    cenarios: CENARIOS,
    acimaPressiona: ACIMA_PRESSIONA
  });
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "Ouro nos ETFs", campo: "totalT", casas: 0, sufixo: "t, as quatro regiões" },
    { camada: "A", rotulo: "Fluxo em 13 semanas", campo: "fluxo13SemanasT", casas: 0, sinal: true, sufixo: "t" },
    { camada: "B", rotulo: "Ouro nos ETFs 13 semanas antes", campo: "total13SemanasAntesT", casas: 0, sufixo: "t" },
    { camada: "B", rotulo: "Fluxo em % do que tinham", campo: "fluxo13SemanasPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Ouro nos ETFs (A) × o mesmo 13 semanas antes (B), em toneladas",
    unidade: "t",
    casas: 0,
    exigeCampo: "total13SemanasAntesT",
    series: [
      { campo: "totalT", rotulo: "Ouro nos ETFs (A)" },
      { campo: "total13SemanasAntesT", rotulo: "13 semanas antes (B)" }
    ]
  },
  graficoC: { titulo: "Fluxo em 13 semanas (B) e as faixas da decisão (C)", campo: "fluxo13SemanasPct", rotulo: "Fluxo (B)" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.PARAMETROS_FAIXA,
  exemplos: { colunaValor: "Fluxo" },
  nota:
    "Semanal, não é tempo real: o World Gold Council atualiza a semana (encerrada na sexta) com alguns dias de atraso. " +
    "Dado de uso interno (os termos do WGC não permitem redistribuir, ADR 0037)."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularEtfsOuro,
  explicar: explicarEtfs,
  exemplos: exemplosEtfs,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, derivarEtfsOuro, calcularEtfsOuro };
