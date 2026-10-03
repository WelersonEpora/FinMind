"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { mediaMesmaSemana, DIAS_SEMANA } = require("./base/mesma-semana-5-anos");

// FATOR (PROPOSTA, ADR 0050): margem de refino, fator "Refino e margens (crack spreads)" do FEL 1. Mesmo molde dos
// outros: camadas A e B calculadas, C simulada pela decisão por faixa com parâmetros que o Comitê ajusta; o peso é o
// do FEL 1; não alimenta o motor, o Centro de Decisão nem a IA.
//
// OBSERVÁVEIS → FATOR (ver ADR 0008):
//   observáveis (tabela observation), preços à vista diários da EIA e um fluxo semanal:
//     EIA.PETROLEO_PRECOS.BRENT        - Brent (US$/barril)
//     EIA.PETROLEO_PRECOS.GASOLINA_NY  - gasolina convencional, porto de Nova York (US$/galão)
//     EIA.PETROLEO_PRECOS.DIESEL_NY    - diesel S10, porto de Nova York (US$/galão), desde 2006
//     EIA.PETROLEO_FLUXOS.UTILIZACAO_REFINARIAS - utilização das refinarias dos EUA (%), só como contexto (quadro A)
//   fator (calculado sob demanda, NUNCA gravado):
//     A. crack 3-2-1 de cada dia = [(2 × gasolina + 1 × diesel) × 42 galões − 3 × Brent] ÷ 3, em US$ por barril: a
//        margem de transformar 3 barris de petróleo em 2 de gasolina e 1 de diesel. Contra o BRENT, e não o WTI:
//        os derivados de Nova York são precificados contra o Brent, e em 2011-2013 o WTI ficou até US$ 20 abaixo
//        dele (excesso em Cushing), o que inflava o crack com WTI sem que a margem real subisse.
//        crack da semana = média dos dias da semana (sábado a sexta) com os três preços; a semana é a da sexta
//     B. media5Anos = média do crack da mesma semana nos 5 anos anteriores (núcleo `base/mesma-semana-5-anos.js`);
//        desvio = crack - media5Anos, em US$/barril. Não em %: a média chega a US$ 7, e o desvio em % explode
//        (+247% em 2012); em US$ ele é estável
//     C. decisão por faixa sobre o desvio, em US$/barril: margem acima do normal = pressão de ALTA ("margens altas
//        elevam demanda por cru", FEL 1)
//
// No histórico, a margem acima do normal anda com refinarias mais cheias (+0,25 com a utilização), mas não antecipa
// o preço do petróleo. Os preços diários saem uma vez por semana (quarta), com os dias até a terça: a última semana
// pode ter só 1 ou 2 dias (o quadro mostra quantos). Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "refino_petroleo_crack_321";
const FACTOR_VERSION = 1;

const SERIES = {
  brent: "EIA.PETROLEO_PRECOS.BRENT",
  gasolina: "EIA.PETROLEO_PRECOS.GASOLINA_NY",
  diesel: "EIA.PETROLEO_PRECOS.DIESEL_NY",
  utilizacao: "EIA.PETROLEO_FLUXOS.UTILIZACAO_REFINARIAS"
};

const GALOES_POR_BARRIL = 42;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2011 a 2026): |desvio| tem percentis 40/60/80 de
// US$ 3,0 / 4,5 / 8,3 por barril; a mudança do desvio em 4 semanas tem mediana de US$ 2,6. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 3,
  limiarFortePct: 10,
  semanasTendencia: 4,
  limiarTendenciaPp: 3
});

const ACIMA_PRESSIONA = faixa.DIRECAO.ALTA;
const ROTULOS_TENDENCIA = { SUBINDO: "Margem subindo", CAINDO: "Margem caindo", ESTAVEL: "Estável" };
const UNIDADE = " US$/barril";

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// A sexta da semana (sábado a sexta) de um dia.
function sextaDaSemana(dataIso) {
  const diaDaSemana = new Date(`${dataIso}T00:00:00Z`).getUTCDay();
  return somarDias(dataIso, (5 - diaDaSemana + 7) % 7);
}

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

function crack321({ brent, gasolina, diesel }) {
  return ((2 * gasolina + diesel) * GALOES_POR_BARRIL - 3 * brent) / 3;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana com crack.
function derivarRefinoPetroleo(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const porSerie = Object.fromEntries(Object.keys(SERIES).map((chave) => [chave, new Map()]));
  const chavePorCodigo = Object.fromEntries(Object.entries(SERIES).map(([chave, codigo]) => [codigo, chave]));
  for (const linha of linhasAsOf) {
    const chave = chavePorCodigo[linha.seriesCode];
    if (chave) porSerie[chave].set(linha.observedAt, linha);
  }

  // Os dias com os três preços, agrupados pela sexta da semana.
  const semanas = new Map();
  for (const [dia, brent] of porSerie.brent) {
    const gasolina = porSerie.gasolina.get(dia);
    const diesel = porSerie.diesel.get(dia);
    if (!gasolina || !diesel) continue;
    const sexta = sextaDaSemana(dia);
    if (!semanas.has(sexta)) semanas.set(sexta, { cracks: [], disponivelEm: null, estimado: false });
    const semana = semanas.get(sexta);
    semana.cracks.push(crack321({ brent: brent.value, gasolina: gasolina.value, diesel: diesel.value }));
    for (const linha of [brent, gasolina, diesel]) {
      if (!semana.disponivelEm || linha.publishedAt > semana.disponivelEm) semana.disponivelEm = linha.publishedAt;
      semana.estimado = semana.estimado || linha.publishedAtIsEstimated;
    }
  }

  const crackDaSemana = new Map([...semanas].map(([sexta, s]) => [sexta, s.cracks.reduce((a, b) => a + b, 0) / s.cracks.length]));
  const desvios = new Map();
  const pontos = [];
  for (const observedAt of [...semanas.keys()].sort()) {
    const semana = semanas.get(observedAt);
    const crack = crackDaSemana.get(observedAt);
    const media = mediaMesmaSemana((data) => crackDaSemana.get(data), observedAt);
    const desvio = media === null ? null : arredondar(crack - media, 2);
    desvios.set(observedAt, desvio);
    const anterior = desvios.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      crack: arredondar(crack, 2),
      diasNaSemana: semana.cracks.length,
      utilizacao: porSerie.utilizacao.get(observedAt)?.value ?? null,
      media5Anos: media === null ? null : arredondar(media, 2),
      desvio,
      decisao: faixa.decidirPorFaixa(desvio, anterior ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: semana.disponivelEm,
      disponivelEmEhEstimado: semana.estimado
    });
  }
  return pontos;
}

async function calcularRefinoPetroleo({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarRefinoPetroleo(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "desvio",
  primeiroPasso: (p) =>
    `A margem de refino (crack 3-2-1 com o Brent) foi de US$ ${faixa.fmt(p.crack)} por barril na semana, ` +
    `contra US$ ${faixa.fmt(p.media5Anos)} na mesma semana dos 5 anos anteriores: ${faixa.comSinal(p.desvio)}${UNIDADE} (B).`,
  nomeValor: "o desvio",
  abaixo: "margem abaixo do normal reduz a demanda por petróleo",
  acima: "margem acima do normal eleva a demanda por petróleo",
  subindo: "a margem está subindo em relação ao normal",
  caindo: "a margem está caindo em relação ao normal",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

const EPISODIOS = [
  { data: "2012-09-28", rotulo: "Margem alta com a falta de derivados na costa leste" },
  { data: "2016-02-26", rotulo: "Margem perto do normal, com o petróleo barato" },
  { data: "2020-04-24", rotulo: "Pandemia" },
  { data: "2022-10-28", rotulo: "Crise do diesel depois da invasão da Ucrânia" },
  { data: "2024-06-28", rotulo: "Margem um pouco abaixo do normal" }
];
const CENARIOS = [
  { valor: 15, valorAnterior: 8, rotulo: "Bem acima do normal e subindo" },
  { valor: 5, valorAnterior: 5.5, rotulo: "Acima do normal e parada" },
  { valor: 1, valorAnterior: 6, rotulo: "Perto do normal, voltando de cima" },
  { valor: -4, valorAnterior: -1, rotulo: "Abaixo do normal e caindo" },
  { valor: -11, valorAnterior: -14, rotulo: "Bem abaixo do normal, mas melhorando" }
];

function explicarRefino(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosRefino(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    episodios: EPISODIOS,
    cenarios: CENARIOS,
    acimaPressiona: ACIMA_PRESSIONA
  });
}

const APRESENTACAO = {
  unidade: "US$/barril",
  quadros: [
    {
      camada: "A",
      rotulo: "Margem de refino (crack 3-2-1)",
      campo: "crack",
      casas: 2,
      sufixo: "US$/barril",
      secundario: { campo: "diasNaSemana", casas: 0, prefixo: "US$/barril, média de", sufixo: "dia(s)" }
    },
    { camada: "A", rotulo: "Utilização das refinarias (contexto)", campo: "utilizacao", casas: 1, unidadeValor: "%", sufixo: "EIA, semanal: sai na quarta seguinte" },
    { camada: "B", rotulo: "Média de 5 anos (mesma semana)", campo: "media5Anos", casas: 2, sufixo: "US$/barril" },
    { camada: "B", rotulo: "Desvio contra a média", campo: "desvio", casas: 2, sinal: true, sufixo: "US$/barril" }
  ],
  graficoAB: {
    titulo: "Margem de refino 3-2-1 (A) × média da mesma semana nos 5 anos anteriores (B)",
    unidade: "US$/barril",
    casas: 2,
    exigeCampo: "media5Anos",
    series: [
      { campo: "crack", rotulo: "Margem (A)" },
      { campo: "media5Anos", rotulo: "Média de 5 anos (B)" }
    ]
  },
  graficoC: { titulo: "Desvio (B) e as faixas da decisão (C)", campo: "desvio", rotulo: "Desvio (B)", unidade: "US$/barril" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ unidade: "US$/barril", unidadeMudanca: "US$/barril" }),
  exemplos: { colunaValor: "Desvio", unidade: "US$/barril" },
  nota:
    "Semanal, não é tempo real: a EIA publica os preços diários uma vez por semana (quarta), com os dias até a terça; " +
    "a última semana pode ter só 1 ou 2 dias. Preços à vista de Nova York e o Brent, todos da EIA."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularRefinoPetroleo,
  explicar: explicarRefino,
  exemplos: exemplosRefino,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIES,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  crack321,
  sextaDaSemana,
  derivarRefinoPetroleo,
  calcularRefinoPetroleo,
  explicarRefino,
  exemplosRefino
};
