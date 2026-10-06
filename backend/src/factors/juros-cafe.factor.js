"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarDias } = require("./base/semana-de-dias");
const { criarFatorJuroVariacao } = require("./modelos/juro-variacao-semanal");

// FATOR (PROPOSTA, ADR 0060): juros, fator "Política monetária e juros globais" do FEL 1 para o café, como o F8 do
// Motor do Café v1 (2026-10-04). O cálculo é o molde comum dos juros (modelos/juro-variacao-semanal.js), o mesmo do
// petróleo: o Treasury de 10 anos em 26 semanas, com a meta do Fed como contexto.
//
// Do estudo: o canal do F8 é o custo de carregar estoque (cost of carry) e a liquidez para commodities; juro subindo
// pesa para baixa, caindo para alta. Os efeitos do juro no câmbio ficam no F4 (controle de dupla contagem do estudo).
// Fora da conta, sem o dado ou por decisão do estudo: a Selic (vai ao F4), o DXY e a inclinação das curvas. Os limiares
// são os do petróleo, calibrados na mesma série (percentis 40/60/80 de |variação em 26 semanas| desde 2010: 0,28 /
// 0,47 / 0,79 p.p.). Propriedades: determinístico, versionado, point-in-time, sem IA.
//
// A condição do dólar (ADR 0090), só na regra de BAIXA: o juro subindo só pesa para baixa com o dólar global (o índice
// amplo do Fed, FRED.DTWEXBGS, o substituto do DXY) subindo em 26 semanas, como a regra do estudo escreve; sem isso,
// neutra. Na regra de alta, sem condição: no histórico (2007 a 2026), exigir o dólar caindo não melhorou a alta. Sem o
// índice (antes de 2006), a condição não é aplicada, e o ponto diz isso. O índice da semana é o último dia conhecido
// até a publicação do ponto (o Fed o divulga às segundas, H.10).

const FACTOR_ID = "juros_cafe_treasury_10a";
// v2 (2026-10-06): o dólar global como condição da regra de baixa (ADR 0090).
const FACTOR_VERSION = 2;

const SERIES = { treasury10a: "FRED.DGS10", metaFed: "FRED.DFEDTARU", dolarAmplo: "FRED.DTWEXBGS" };
const SEMANAS_DOLAR = 26;

const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 0.5,
  limiarFortePct: 1,
  semanasTendencia: 4,
  limiarTendenciaPp: 0.25
});

const ROTULOS_TENDENCIA = { SUBINDO: "Juro acelerando a alta", CAINDO: "Juro acelerando a queda", ESTAVEL: "Estável" };
const UNIDADE = " p.p.";

const TEXTOS = {
  primeiroPasso: (p) =>
    `O Treasury de 10 anos ficou em ${faixa.fmt(p.treasury10a)}% na semana, contra ${faixa.fmt(p.treasury10a26SemanasAntes)}% ` +
    `26 semanas antes: ${faixa.comSinal(p.variacao26Semanas)}${UNIDADE} (B).` +
    (p.metaFed === null ? "" : ` A meta do Fed está em ${faixa.fmt(p.metaFed)}% (contexto).`) +
    (p.variacaoDolar26Semanas === null || p.variacaoDolar26Semanas === undefined
      ? " Sem o índice amplo do dólar (Fed) na semana: a condição da regra de baixa não é aplicada."
      : ` O índice amplo do dólar (Fed) variou ${faixa.comSinal(p.variacaoDolar26Semanas)}% em 26 semanas (condição da regra de baixa: dólar subindo).`),
  nomeValor: "a variação",
  abaixo: "juro em queda barateia o carregamento de estoque e atrai liquidez para commodities",
  acima: "juro em alta encarece o carregamento de estoque (a indústria opera com estoque mínimo) e afasta liquidez",
  subindo: "a alta do juro está ganhando força (ou a queda perdendo)",
  caindo: "a queda do juro está ganhando força (ou a alta perdendo)",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

const APRESENTACAO = {
  unidade: "p.p.",
  quadros: [
    {
      camada: "A",
      rotulo: "Treasury de 10 anos",
      campo: "treasury10a",
      casas: 2,
      unidadeValor: "%",
      secundario: { campo: "diasNaSemana", casas: 0, prefixo: "% a.a., média de", sufixo: "dia(s)" }
    },
    {
      camada: "A",
      rotulo: "Meta do Fed, limite superior (contexto)",
      campo: "metaFed",
      casas: 2,
      unidadeValor: "%",
      secundario: { campo: "variacaoMeta52Semanas", casas: 2, sinal: true, prefixo: "em 52 semanas:", sufixo: "p.p." }
    },
    { camada: "B", rotulo: "Treasury 26 semanas antes", campo: "treasury10a26SemanasAntes", casas: 2, unidadeValor: "%" },
    { camada: "B", rotulo: "Variação em 26 semanas", campo: "variacao26Semanas", casas: 2, sinal: true, sufixo: "p.p." },
    { camada: "B", rotulo: "Índice amplo do dólar (Fed) em 26 semanas (condição da baixa)", campo: "variacaoDolar26Semanas", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Treasury de 10 anos (A) × o mesmo 26 semanas antes (B), com a meta do Fed",
    unidade: "% a.a.",
    casas: 2,
    exigeCampo: "treasury10a26SemanasAntes",
    series: [
      { campo: "treasury10a", rotulo: "Treasury 10 anos (A)" },
      { campo: "treasury10a26SemanasAntes", rotulo: "26 semanas antes (B)" },
      { campo: "metaFed", rotulo: "Meta do Fed (contexto)" }
    ]
  },
  graficoC: { titulo: "Variação em 26 semanas (B) e as faixas da decisão (C)", campo: "variacao26Semanas", rotulo: "Variação (B)", unidade: "p.p." },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ unidade: "p.p.", unidadeMudanca: "p.p." }),
  exemplos: { colunaValor: "Variação", unidade: "p.p." },
  nota:
    "Semanal, não é tempo real: média dos dias da semana do Treasury de 10 anos (FRED, H.15; o valor de sexta sai na " +
    "segunda). A meta do Fed é contexto. O canal é o custo de carregar estoque; o efeito do juro no câmbio fica no F4."
};

const fator = criarFatorJuroVariacao({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  series: { principal: SERIES.treasury10a, contexto: SERIES.metaFed },
  campos: {
    principal: "treasury10a",
    contexto: "metaFed",
    variacaoContexto: "variacaoMeta52Semanas",
    principalAntes: "treasury10a26SemanasAntes",
    variacao: "variacao26Semanas"
  },
  acimaPressiona: faixa.DIRECAO.BAIXA,
  textos: TEXTOS,
  episodios: [
    { data: "2020-03-27", rotulo: "Pandemia: juro despenca" },
    { data: "2022-06-17", rotulo: "Ciclo de alta do Fed contra a inflação" },
    { data: "2024-09-20", rotulo: "Início dos cortes do Fed" }
  ],
  cenarios: [
    { valor: 1.5, valorAnterior: 0.8, rotulo: "Juro subindo forte e acelerando" },
    { valor: 0.7, valorAnterior: 0.75, rotulo: "Juro subindo, ritmo estável" },
    { valor: 0.1, valorAnterior: 0.9, rotulo: "Juro parado, depois de subir" },
    { valor: -0.7, valorAnterior: -0.3, rotulo: "Juro caindo e acelerando a queda" }
  ],
  apresentacao: APRESENTACAO
});

// O índice amplo do dólar na semana: o último dia até a sexta, entre os publicados até `ate` (ISO).
function dolarAte(linhasDolar, sexta, ate) {
  let melhor = null;
  for (const l of linhasDolar) {
    if (l.observedAt > sexta || new Date(l.publishedAt).toISOString() > ate) continue;
    if (!melhor || l.observedAt > melhor.observedAt) melhor = l;
  }
  return melhor;
}

// Função PURA: as linhas de obterAsOf() -> os pontos do molde, com a variação do dólar em 26 semanas e a condição da
// regra de baixa aplicada (ADR 0090).
function derivarJurosCafe(linhasAsOf, opcoes = {}) {
  const linhasDolar = linhasAsOf.filter((l) => l.seriesCode === SERIES.dolarAmplo);
  return fator.derivar(linhasAsOf, opcoes).map((p) => {
    const ate = new Date(p.disponivelEm).toISOString();
    const agora = dolarAte(linhasDolar, p.observedAt, ate);
    const antes = dolarAte(linhasDolar, somarDias(p.observedAt, -7 * SEMANAS_DOLAR), ate);
    const variacaoDolar26Semanas =
      agora && antes && antes.value > 0 && agora.observedAt > somarDias(p.observedAt, -14)
        ? Math.round((agora.value / antes.value - 1) * 10000) / 100
        : null;
    let decisao = p.decisao;
    if (decisao?.direcao === faixa.DIRECAO.BAIXA && variacaoDolar26Semanas !== null && variacaoDolar26Semanas <= 0) {
      decisao = { ...decisao, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, semCondicaoDolar: true };
    }
    return { ...p, factorVersion: FACTOR_VERSION, variacaoDolar26Semanas, decisao };
  });
}

async function calcularJurosCafe({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarJurosCafe(linhas, { parametros });
}

function explicarJurosCafe(ponto, parametros = PARAMETROS_PADRAO) {
  const passos = fator.METODOLOGIA.explicar(ponto, parametros);
  if (ponto?.decisao?.semCondicaoDolar) {
    passos.splice(
      1,
      2,
      `Direção: o juro subiu, mas o dólar global não (${faixa.comSinal(ponto.variacaoDolar26Semanas)}% em 26 semanas); a regra de baixa pede os dois (ADR 0090) → Neutra, sem intensidade.`
    );
  }
  return passos;
}

const METODOLOGIA = { ...fator.METODOLOGIA, factorVersion: FACTOR_VERSION, calcular: calcularJurosCafe, explicar: explicarJurosCafe };

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, derivarJurosCafe };
