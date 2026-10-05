"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { arredondar } = require("./modelos/posicao-historica");

// FATOR (PROPOSTA, ADR 0060): safra brasileira de arábica, fator "Safra brasileira (bienalidade do café)" do FEL 1 para
// o café, como o F2 do Motor do Café v1 (2026-10-04). Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation), Conab, Boletim da Safra de Café (4 levantamentos por ano: jan, mai, set e dez), cada
//   série com todas as versões desde jan/2023 (ADR 0043):
//     CONAB.CAFE.BRASIL.PRODUCAO_ARABICA / PRODUCAO_CONILON (mil sacas)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por LEVANTAMENTO (o que ele dizia da safra mais nova):
//     A. a produção de arábica e de conilon da safra; a variação do arábica contra a safra anterior (contexto: a
//        bienalidade)
//     B. a revisão do arábica contra o levantamento anterior da MESMA safra, em %
//     C. as regras candidatas do estudo: redução do arábica além de [CALIBRAR]% contra o levantamento anterior pesa para
//        alta; revisão para cima, para baixa; revisões marginais, ou só do conilon, são neutras. O limiar é calibração
//        do FinMind sobre as revisões do arábica na base (11, de 2023 a 2026): |revisão| tem mediana de 3,3%, percentil
//        40 de ~2% e 80 de ~5,5%. Faixa neutra de 2%, forte a partir de 5%
//
// O 1º levantamento de cada safra (janeiro) não tem revisão: sem decisão. O estudo diz: a revisão de safra causada por
// um choque de clima já lido no F1 deve pesar menos (dupla contagem, fica para a agregação); a surpresa contra a
// expectativa do mercado (paga) não é coletada. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "safra_cafe_conab_arabica";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  arabica: "CONAB.CAFE.BRASIL.PRODUCAO_ARABICA",
  conilon: "CONAB.CAFE.BRASIL.PRODUCAO_CONILON"
});

const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 2,
  limiarFortePct: 5,
  semanasTendencia: 1,
  limiarTendenciaPp: 2
});

const ROTULOS_TENDENCIA = { SUBINDO: "Revisões subindo", CAINDO: "Revisões caindo", ESTAVEL: "Estável" };

// O que a Conab dizia de uma série e safra até `ate` (inclusive): a última versão publicada até lá, ou undefined.
function valorAte(versoes, serie, safra, ate) {
  let valor;
  for (const v of versoes) {
    if (v.seriesCode === serie && v.observedAt === safra && v.publishedAt <= ate) valor = v.value;
  }
  return valor;
}

const variacao = (a, b) => (a === undefined || b === undefined || !b ? null : arredondar((a / b - 1) * 100, 2));

// Função PURA: as versões (obterVersoesAsOf, em ordem de publicação) -> um ponto por levantamento.
function derivarSafraCafe(versoes, { parametros = PARAMETROS_PADRAO } = {}) {
  const ordenadas = [...versoes].map((v) => ({ ...v, publishedAt: new Date(v.publishedAt).toISOString() }));
  ordenadas.sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : 1));
  const levantamentos = [...new Set(ordenadas.map((v) => v.publishedAt))];
  const revisoes = [];
  const pontos = [];
  levantamentos.forEach((data, i) => {
    const conhecidas = ordenadas.filter((v) => v.publishedAt <= data && v.seriesCode === SERIES.arabica);
    if (conhecidas.length === 0) return;
    const safra = conhecidas.map((v) => v.observedAt).sort().at(-1);
    const anoSafra = Number(safra.slice(0, 4));
    const safraAnterior = `${anoSafra - 1}${safra.slice(4)}`;
    const anterior = i > 0 ? levantamentos[i - 1] : null;
    const arabica = valorAte(ordenadas, SERIES.arabica, safra, data);
    const arabicaAntes = anterior ? valorAte(ordenadas, SERIES.arabica, safra, anterior) : undefined;
    const conilon = valorAte(ordenadas, SERIES.conilon, safra, data);
    const conilonAntes = anterior ? valorAte(ordenadas, SERIES.conilon, safra, anterior) : undefined;
    const revisao = variacao(arabica, arabicaAntes);
    revisoes.push(revisao);
    const revisaoAnterior = revisoes.length > parametros.semanasTendencia ? revisoes.at(-1 - parametros.semanasTendencia) : null;
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: data.slice(0, 10),
      safra: anoSafra,
      arabica: arabica ?? null,
      arabicaLevantamentoAnterior: arabicaAntes ?? null,
      revisaoArabicaPct: revisao,
      conilon: conilon ?? null,
      revisaoConilonPct: variacao(conilon, conilonAntes),
      contraSafraAnteriorPct: variacao(arabica, valorAte(ordenadas, SERIES.arabica, safraAnterior, data)),
      decisao: faixa.decidirPorFaixa(revisao, revisaoAnterior ?? null, parametros, faixa.DIRECAO.BAIXA),
      disponivelEm: data,
      disponivelEmEhEstimado: false
    });
  });
  return pontos;
}

async function calcularSafraCafe({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const versoes = await servico.obterVersoesAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarSafraCafe(versoes, { parametros });
}

const TEXTOS = {
  campo: "revisaoArabicaPct",
  primeiroPasso: (p) =>
    `No levantamento de ${p.observedAt.split("-").reverse().join("/")}, a Conab estimou o arábica da safra ${p.safra} em ` +
    `${faixa.fmt(p.arabica, 0)} mil sacas, contra ${faixa.fmt(p.arabicaLevantamentoAnterior, 0)} no levantamento anterior: ` +
    `revisão de ${faixa.comSinal(p.revisaoArabicaPct)}% (B).`,
  nomeValor: "a revisão",
  abaixo: "a estimativa de arábica foi cortada além da margem normal das revisões, menos oferta",
  acima: "a estimativa de arábica foi elevada além da margem normal das revisões, mais oferta",
  subindo: "as revisões estão indo para cima",
  caindo: "as revisões estão indo para baixo",
  rotulosTendencia: ROTULOS_TENDENCIA,
  janela: "levantamentos"
};

function explicarSafraCafe(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosSafraCafe(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    acimaPressiona: faixa.DIRECAO.BAIXA,
    episodios: [
      { data: "2024-09-19", rotulo: "Arábica cortado no 3º levantamento de 2024" },
      { data: "2025-05-06", rotulo: "Arábica elevado no 2º levantamento de 2025" },
      { data: "2026-09-24", rotulo: "3º levantamento de 2026 (24/09)" }
    ],
    cenarios: [
      { valor: -6, valorAnterior: -1, rotulo: "Corte forte no arábica" },
      { valor: 1, valorAnterior: 4, rotulo: "Revisão marginal" },
      { valor: 4, valorAnterior: 1, rotulo: "Arábica elevado além do normal" }
    ]
  });
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "Arábica (Conab)", campo: "arabica", casas: 0, sufixo: "mil sacas" },
    { camada: "A", rotulo: "Conilon (Conab, contexto)", campo: "conilon", casas: 0, sufixo: "mil sacas" },
    { camada: "A", rotulo: "Arábica contra a safra anterior (contexto)", campo: "contraSafraAnteriorPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Revisão do arábica", campo: "revisaoArabicaPct", casas: 2, sinal: true, unidadeValor: "%", sufixo: "contra o levantamento anterior" },
    { camada: "B", rotulo: "Revisão do conilon (contexto)", campo: "revisaoConilonPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Produção de arábica estimada a cada levantamento (A)",
    unidade: "mil sacas",
    casas: 0,
    series: [
      { campo: "arabica", rotulo: "Arábica (A)" },
      { campo: "conilon", rotulo: "Conilon (contexto)" }
    ]
  },
  graficoC: { titulo: "Revisão do arábica (B) e as faixas da decisão (C)", campo: "revisaoArabicaPct", rotulo: "Revisão (B)", unidade: "%" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ janela: "levantamentos" }),
  exemplos: { colunaValor: "Revisão", unidade: "%" },
  nota:
    "Por levantamento, não é tempo real: a Conab publica 4 levantamentos da safra de café por ano (jan, mai, set e dez). " +
    "Só o arábica decide (o ICF é arábica); o conilon é contexto. A base tem os levantamentos desde jan/2023."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "LEVANTAMENTO",
  calcular: calcularSafraCafe,
  explicar: explicarSafraCafe,
  exemplos: exemplosSafraCafe,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, derivarSafraCafe };
