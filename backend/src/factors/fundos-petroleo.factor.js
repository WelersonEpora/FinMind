"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarDias } = require("./base/semana-de-dias");

// FATOR (PROPOSTA, ADR 0050): posicionamento dos fundos no WTI, fator "Especulação e posicionamento de fundos (COT)"
// do FEL 1 para o petróleo. Mesmo molde dos outros: camadas A e B calculadas, C simulada pela decisão por faixa com
// parâmetros que o Comitê ajusta; o peso é o do FEL 1; não alimenta o motor, o Centro de Decisão nem a IA.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), CFTC COT, WTI da NYMEX, posição de terça:
//     CFTC.CRUDE_WTI.MM_LONG / MM_SHORT - contratos comprados e vendidos dos fundos (managed money)
//     CFTC.CRUDE_WTI.OPEN_INTEREST      - contratos em aberto do mercado
//   fator (calculado sob demanda, NUNCA gravado):
//     A. liquida = comprados - vendidos; variacaoSemanal = contra a terça anterior; liquidaPctOi = liquida / contratos
//        em aberto (o mercado cresceu muito desde 2006: em % ele fica comparável no tempo)
//     B. percentil3Anos = onde liquidaPctOi fica entre as das 156 semanas anteriores (0 = a mais vendida, 100 = a
//        mais comprada; nulo com menos de 150 delas); posicaoRelativa = percentil3Anos - 50 (de -50 a +50). Para o
//        gráfico, a faixa dos 3 anos: os percentis 10, 50 e 90 de liquidaPctOi nessas semanas
//     C. decisão por faixa sobre a posição relativa: fundos muito comprados = pressão de BAIXA (risco de reversão);
//        muito vendidos = de ALTA. É a leitura da proposta ("posição em extremo indica risco de reversão"); o FEL 1 só
//        diz que o fator "amplifica" (pergunta ao David se ele tem direção própria)
//
// No histórico (2010 a 2026), a posição segue o preço (+0,2 com a variação do WTI das 13 a 26 semanas anteriores: os
// fundos compram depois da alta, o "amplifica" do FEL 1) e, nos extremos, o preço tende a virar: com os fundos entre
// os 10% mais vendidos dos 3 anos, o WTI subiu em 74% dos casos 26 semanas depois (média +12%); entre os 10% mais
// comprados, em 44% (média -1%). Fora dos extremos, perto de 50%. Posição de terça, divulgada na sexta seguinte
// (às vezes depois, com feriado ou shutdown). Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "fundos_petroleo_cot_wti";
const FACTOR_VERSION = 1;

const SERIES = {
  comprados: "CFTC.CRUDE_WTI.MM_LONG",
  vendidos: "CFTC.CRUDE_WTI.MM_SHORT",
  contratosEmAberto: "CFTC.CRUDE_WTI.OPEN_INTEREST"
};

const DIAS_SEMANA = 7;
const SEMANAS_JANELA = 156;
const SEMANAS_MINIMAS = 150;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2010 a 2026): a faixa neutra de 30 pontos é o
// percentil 20 a 80 dos 3 anos; o forte, de 40, abaixo do 10 ou acima do 90; a mudança da posição relativa em 4
// semanas tem mediana de ~11 pontos. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 30,
  limiarFortePct: 40,
  semanasTendencia: 4,
  limiarTendenciaPp: 15
});

const ACIMA_PRESSIONA = faixa.DIRECAO.BAIXA;
const ROTULOS_TENDENCIA = { SUBINDO: "Fundos comprando", CAINDO: "Fundos vendendo", ESTAVEL: "Estável" };
const UNIDADE = " pontos";

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// O percentil `p` (0 a 1) de `valores`, pelo índice mais próximo abaixo.
function quantil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(p * (ordenados.length - 1))];
}

// Onde `valor` fica entre `anteriores`, de 0 a 100 (empates contam meio).
function percentil(valor, anteriores) {
  let abaixo = 0;
  let iguais = 0;
  for (const outro of anteriores) {
    if (outro < valor) abaixo += 1;
    else if (outro === valor) iguais += 1;
  }
  return ((abaixo + iguais / 2) / anteriores.length) * 100;
}

// As linhas de obterAsOf() -> Map(terça -> { comprados, vendidos, contratosEmAberto, disponivelEm, estimado }), só
// as semanas com as três séries.
function semanasCompletas(linhasAsOf) {
  const campoDa = Object.fromEntries(Object.entries(SERIES).map(([campo, codigo]) => [codigo, campo]));
  const semanas = new Map();
  for (const linha of linhasAsOf) {
    const campo = campoDa[linha.seriesCode];
    if (!campo) continue;
    if (!semanas.has(linha.observedAt)) semanas.set(linha.observedAt, { disponivelEm: null, estimado: false });
    const semana = semanas.get(linha.observedAt);
    semana[campo] = linha.value;
    if (!semana.disponivelEm || linha.publishedAt > semana.disponivelEm) semana.disponivelEm = linha.publishedAt;
    semana.estimado = semana.estimado || linha.publishedAtIsEstimated;
  }
  for (const [data, semana] of semanas) {
    if (Object.keys(SERIES).some((campo) => semana[campo] === undefined) || !semana.contratosEmAberto) semanas.delete(data);
  }
  return semanas;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana (a terça da posição).
function derivarFundosPetroleo(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const semanas = semanasCompletas(linhasAsOf);
  const datas = [...semanas.keys()].sort();
  const liquidaEm = new Map();
  const pctOiEm = new Map();
  for (const data of datas) {
    const s = semanas.get(data);
    liquidaEm.set(data, s.comprados - s.vendidos);
    pctOiEm.set(data, ((s.comprados - s.vendidos) / s.contratosEmAberto) * 100);
  }

  const posicoes = new Map();
  const pontos = [];
  for (const observedAt of datas) {
    const semana = semanas.get(observedAt);
    const anteriores = [];
    for (let k = 1; k <= SEMANAS_JANELA; k += 1) {
      const valor = pctOiEm.get(somarDias(observedAt, -DIAS_SEMANA * k));
      if (valor !== undefined) anteriores.push(valor);
    }
    const completa = anteriores.length >= SEMANAS_MINIMAS;
    const pctl = completa ? arredondar(percentil(pctOiEm.get(observedAt), anteriores), 1) : null;
    const faixa3Anos = (p) => (completa ? arredondar(quantil(anteriores, p), 2) : null);
    const posicaoRelativa = pctl === null ? null : arredondar(pctl - 50, 1);
    posicoes.set(observedAt, posicaoRelativa);
    const liquidaAnterior = liquidaEm.get(somarDias(observedAt, -DIAS_SEMANA));
    const anterior = posicoes.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      comprados: semana.comprados,
      vendidos: semana.vendidos,
      liquida: liquidaEm.get(observedAt),
      variacaoSemanal: liquidaAnterior === undefined ? null : liquidaEm.get(observedAt) - liquidaAnterior,
      liquidaPctOi: arredondar(pctOiEm.get(observedAt), 2),
      p10_3Anos: faixa3Anos(0.1),
      mediana3Anos: faixa3Anos(0.5),
      p90_3Anos: faixa3Anos(0.9),
      percentil3Anos: pctl,
      posicaoRelativa,
      decisao: faixa.decidirPorFaixa(posicaoRelativa, anterior ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: semana.disponivelEm,
      disponivelEmEhEstimado: semana.estimado
    });
  }
  return pontos;
}

async function calcularFundosPetroleo({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarFundosPetroleo(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "posicaoRelativa",
  primeiroPasso: (p) =>
    `Os fundos estavam com ${faixa.fmt(p.liquida, 0)} contratos líquidos no WTI (${faixa.fmt(p.liquidaPctOi)}% dos ` +
    `contratos em aberto), no percentil ${faixa.fmt(p.percentil3Anos, 1)} dos 3 anos anteriores: posição relativa de ` +
    `${faixa.comSinal(p.posicaoRelativa, 1)}${UNIDADE} (B).`,
  nomeValor: "a posição relativa",
  abaixo: "fundos muito vendidos têm pouco espaço para vender mais, risco de reversão para cima",
  acima: "fundos muito comprados têm pouco espaço para comprar mais, risco de reversão para baixo",
  subindo: "os fundos estão aumentando a posição comprada",
  caindo: "os fundos estão reduzindo a posição comprada",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

const EPISODIOS = [
  { data: "2014-06-24", rotulo: "Fundos muito comprados antes da queda de 2014" },
  { data: "2016-02-16", rotulo: "Fundos muito vendidos no fundo de 2016" },
  { data: "2023-03-14", rotulo: "Fundos muito vendidos na crise dos bancos regionais dos EUA" },
  { data: "2020-04-21", rotulo: "Pandemia (WTI negativo)" },
  { data: "2025-04-08", rotulo: "Fundos muito vendidos depois do anúncio das tarifas" }
];
const CENARIOS = [
  { valor: 45, valorAnterior: 30, rotulo: "Muito comprados e comprando mais" },
  { valor: 35, valorAnterior: 36, rotulo: "Comprados acima do normal, parados" },
  { valor: 5, valorAnterior: 35, rotulo: "Perto do normal, depois de muito comprados" },
  { valor: -35, valorAnterior: -15, rotulo: "Vendidos acima do normal e vendendo" },
  { valor: -45, valorAnterior: -48, rotulo: "Muito vendidos, começando a recomprar" }
];

function explicarFundos(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosFundos(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    episodios: EPISODIOS,
    cenarios: CENARIOS,
    acimaPressiona: ACIMA_PRESSIONA
  });
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    {
      camada: "A",
      rotulo: "Posição líquida dos fundos",
      campo: "liquida",
      casas: 0,
      sufixo: "contratos",
      secundario: { campo: "variacaoSemanal", casas: 0, sinal: true, prefixo: "variação na semana:", sufixo: "contratos" }
    },
    { camada: "A", rotulo: "Líquida / contratos em aberto", campo: "liquidaPctOi", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Percentil nos 3 anos anteriores", campo: "percentil3Anos", casas: 1, sufixo: "0 = mais vendida, 100 = mais comprada" },
    { camada: "B", rotulo: "Posição relativa (percentil - 50)", campo: "posicaoRelativa", casas: 1, sinal: true, sufixo: "pontos" }
  ],
  graficoAB: {
    titulo: "Posição líquida dos fundos em % dos contratos em aberto (A) × a faixa dos 3 anos anteriores (B)",
    unidade: "%",
    casas: 2,
    exigeCampo: "mediana3Anos",
    series: [
      { campo: "liquidaPctOi", rotulo: "Líquida (A)" },
      { campo: "p90_3Anos", rotulo: "Percentil 90 em 3 anos (B)" },
      { campo: "mediana3Anos", rotulo: "Mediana em 3 anos (B)" },
      { campo: "p10_3Anos", rotulo: "Percentil 10 em 3 anos (B)" }
    ]
  },
  graficoC: { titulo: "Posição relativa (B) e as faixas da decisão (C)", campo: "posicaoRelativa", rotulo: "Posição relativa (B)", unidade: "pontos" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ unidade: "pontos", unidadeMudanca: "pontos" }),
  exemplos: { colunaValor: "Posição relativa", unidade: "pontos" },
  nota:
    "Semanal, não é tempo real: a posição é de terça e a CFTC a divulga na sexta seguinte (com feriado, na segunda; " +
    "em 2025 o shutdown atrasou semanas). Fundos = managed money, só futuros, WTI da NYMEX."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularFundosPetroleo,
  explicar: explicarFundos,
  exemplos: exemplosFundos,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIES,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  percentil,
  derivarFundosPetroleo,
  calcularFundosPetroleo,
  explicarFundos,
  exemplosFundos
};
