"use strict";

const faixa = require("./base/decisao-por-faixa");
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

const FACTOR_ID = "juros_cafe_treasury_10a";
const FACTOR_VERSION = 1;

const SERIES = { treasury10a: "FRED.DGS10", metaFed: "FRED.DFEDTARU" };

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
    (p.metaFed === null ? "" : ` A meta do Fed está em ${faixa.fmt(p.metaFed)}% (contexto).`),
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
    { camada: "B", rotulo: "Variação em 26 semanas", campo: "variacao26Semanas", casas: 2, sinal: true, sufixo: "p.p." }
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

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA: fator.METODOLOGIA, derivarJurosCafe: fator.derivar };
