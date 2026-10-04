"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarMeses } = require("./base/meses");

// FATOR (PROPOSTA, ADR 0050): inflação, fator "Inflação e expectativas inflacionárias" do FEL 1 para o ouro. Camadas
// A e B calculadas, C simulada pela decisão por faixa com parâmetros que o Comitê ajusta; o peso é o do FEL 1.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), mensais, do FRED/ALFRED (com a data de cada divulgação):
//     FRED.CPIAUCNS - CPI cheio dos EUA, SEM ajuste sazonal: a inflação anual não precisa do ajuste e esta série não é
//                     revisada (a com ajuste é revisada todo fevereiro, por 5 anos)
//     FRED.CPILFESL - CPI núcleo (sem alimentos e energia), com ajuste sazonal: contexto
//   fator (calculado sob demanda, NUNCA gravado):
//     A. inflacaoAnualPct = CPI cheio contra o mesmo mês do ano anterior; nucleoAnualPct, idem (contexto)
//     B. distanciaMetaPp = inflacaoAnualPct - 2: a distância da meta de 2% do Fed (a meta oficial é do PCE, não
//        coletado; o CPI costuma ficar um pouco acima dele - pergunta ao David)
//     C. decisão por faixa sobre a distância: inflação acima da meta além da faixa = pressão de ALTA ("inflação alta
//        favorece ouro como proteção", FEL 1); abaixo, de baixa
//
// No histórico (2006 a 2026, contra a LBMA, com a data da 1ª divulgação), a relação que o FEL 1 descreve NÃO aparece:
// a inflação anual tem -0,04 com o ouro 26 semanas depois; em 2023 a 2026, -0,38 (a inflação alta trouxe o Fed e o
// juro real para cima, o que pesa no ouro). Nem desde 1970, com os anos 1970: +0,06 (-0,15 em 1970 a 1980; -0,19 em
// 1981 a 2000). A expectativa de inflação de mercado (a inflação implícita de 10 anos,
// FRED.T10YIE) também não: troca de sinal entre os períodos. A proposta é a medida simples e explícita; a validação
// fica para o David (pergunta). Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "inflacao_ouro_cpi_eua";
const FACTOR_VERSION = 1;

const SERIES = { cheio: "FRED.CPIAUCNS", nucleo: "FRED.CPILFESL" };
const META_FED_PCT = 2;
const MESES_ANO = 12;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2006 a 2026): a inflação anual tem percentis 10/50/90
// de 0,7 / 2,3 / 5,0%; |distância da meta| tem percentis 40/60/80 de 0,68 / 1,14 / 2,04 p.p.; a mudança dela em 4
// meses tem mediana de ~0,6 p.p. O Comitê ajusta. A janela da tendência é em MESES (a chave é a dos fatores semanais).
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 0.75,
  limiarFortePct: 2,
  semanasTendencia: 3,
  limiarTendenciaPp: 0.5
});

const ACIMA_PRESSIONA = faixa.DIRECAO.ALTA;
const ROTULOS_TENDENCIA = { SUBINDO: "Inflação acelerando", CAINDO: "Inflação desacelerando", ESTAVEL: "Estável" };
const UNIDADE = " p.p.";

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// As linhas de obterAsOf() de uma série mensal -> Map(mês -> { valor, disponivelEm, estimado }).
function porMes(linhasAsOf, seriesCode) {
  const meses = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode !== seriesCode) continue;
    meses.set(linha.observedAt, { valor: linha.value, disponivelEm: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
  }
  return meses;
}

function anual(meses, mes) {
  const agora = meses.get(mes);
  const antes = meses.get(somarMeses(mes, -MESES_ANO));
  return agora && antes ? arredondar((agora.valor / antes.valor - 1) * 100, 2) : null;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por mês do CPI cheio.
function derivarInflacaoOuro(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const cheio = porMes(linhasAsOf, SERIES.cheio);
  const nucleo = porMes(linhasAsOf, SERIES.nucleo);
  const distancias = new Map();
  const pontos = [];
  for (const observedAt of [...cheio.keys()].sort()) {
    const mes = cheio.get(observedAt);
    const inflacao = anual(cheio, observedAt);
    const distancia = inflacao === null ? null : arredondar(inflacao - META_FED_PCT, 2);
    distancias.set(observedAt, distancia);
    const anterior = distancias.get(somarMeses(observedAt, -parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      inflacaoAnualPct: inflacao,
      nucleoAnualPct: anual(nucleo, observedAt),
      metaFedPct: META_FED_PCT,
      distanciaMetaPp: distancia,
      decisao: faixa.decidirPorFaixa(distancia, anterior ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: mes.disponivelEm,
      disponivelEmEhEstimado: mes.estimado
    });
  }
  return pontos;
}

async function calcularInflacaoOuro({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarInflacaoOuro(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "distanciaMetaPp",
  janela: "meses",
  primeiroPasso: (p) =>
    `O CPI cheio dos EUA subiu ${faixa.fmt(p.inflacaoAnualPct)}% em 12 meses` +
    (p.nucleoAnualPct === null ? "" : ` (núcleo: ${faixa.fmt(p.nucleoAnualPct)}%)`) +
    `, ${faixa.comSinal(p.distanciaMetaPp)}${UNIDADE} contra a meta de ${META_FED_PCT}% do Fed (B).`,
  nomeValor: "a distância da meta",
  abaixo: "inflação abaixo da meta tira do ouro o papel de proteção contra a perda do poder de compra",
  acima: "inflação acima da meta favorece o ouro como proteção contra a perda do poder de compra",
  subindo: "a inflação está acelerando",
  caindo: "a inflação está desacelerando",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

const EPISODIOS = [
  { data: "2009-07-01", rotulo: "Deflação na crise de 2008" },
  { data: "2015-04-01", rotulo: "Inflação perto de zero com o petróleo barato" },
  { data: "2022-06-01", rotulo: "Pico da inflação depois da pandemia" },
  { data: "2024-09-01", rotulo: "Inflação voltando para perto da meta" }
];
const CENARIOS = [
  { valor: 3.5, valorAnterior: 2, rotulo: "Bem acima da meta e acelerando" },
  { valor: 1.5, valorAnterior: 1.6, rotulo: "Acima da meta, estável" },
  { valor: 0.3, valorAnterior: 1.5, rotulo: "Perto da meta, depois de alta" },
  { valor: -1.5, valorAnterior: -0.5, rotulo: "Abaixo da meta e desacelerando" },
  { valor: -2.5, valorAnterior: -3, rotulo: "Bem abaixo da meta, voltando" }
];

function explicarInflacao(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosInflacao(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    episodios: EPISODIOS,
    cenarios: CENARIOS,
    acimaPressiona: ACIMA_PRESSIONA
  });
}

const APRESENTACAO = {
  unidade: "p.p.",
  quadros: [
    { camada: "A", rotulo: "Inflação anual (CPI cheio)", campo: "inflacaoAnualPct", casas: 2, sinal: true, unidadeValor: "%", sufixo: "em 12 meses, sem ajuste sazonal" },
    { camada: "A", rotulo: "Inflação anual do núcleo (contexto)", campo: "nucleoAnualPct", casas: 2, sinal: true, unidadeValor: "%", sufixo: "sem alimentos e energia" },
    { camada: "B", rotulo: "Meta do Fed", campo: "metaFedPct", casas: 1, unidadeValor: "%", sufixo: "a meta é do PCE; o CPI é a medida coletada" },
    { camada: "B", rotulo: "Distância da meta", campo: "distanciaMetaPp", casas: 2, sinal: true, sufixo: "p.p." }
  ],
  graficoAB: {
    titulo: "Inflação anual do CPI cheio (A) × a meta de 2% do Fed (B), com o núcleo",
    unidade: "%",
    casas: 2,
    exigeCampo: "inflacaoAnualPct",
    series: [
      { campo: "inflacaoAnualPct", rotulo: "CPI cheio (A)" },
      { campo: "metaFedPct", rotulo: "Meta do Fed (B)" },
      { campo: "nucleoAnualPct", rotulo: "Núcleo (contexto)" }
    ]
  },
  graficoC: { titulo: "Distância da meta (B) e as faixas da decisão (C)", campo: "distanciaMetaPp", rotulo: "Distância da meta (B)", unidade: "p.p." },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ unidade: "p.p.", unidadeMudanca: "p.p.", janela: "meses" }),
  exemplos: { colunaValor: "Distância da meta", unidade: "p.p." },
  nota:
    "Mensal, não é tempo real: o BLS divulga o CPI do mês por volta do dia 10 a 15 do mês seguinte. O CPI cheio sem " +
    "ajuste sazonal não é revisado; o núcleo (com ajuste) é revisado todo fevereiro."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "MENSAL",
  calcular: calcularInflacaoOuro,
  explicar: explicarInflacao,
  exemplos: exemplosInflacao,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, derivarInflacaoOuro, calcularInflacaoOuro };
