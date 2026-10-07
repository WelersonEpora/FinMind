"use strict";

const faixa = require("./base/decisao-por-faixa");
const { criarFatorJuroVariacao } = require("./modelos/juro-variacao-semanal");

// FATOR (PROPOSTA, ADR 0050): juros, fator "Juros e expectativas macro" do FEL 1 para o petróleo. O cálculo é o
// molde comum dos juros (modelos/juro-variacao-semanal.js); aqui ficam as séries, os textos e a apresentação.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), diários, na média da semana (sábado a sexta):
//     FRED.DGS10     - rendimento do Treasury de 10 anos (nominal): o juro longo, com a expectativa do mercado para o
//                      Fed embutida (a expectativa direta, os futuros de Fed Funds, não é coletada)
//     FRED.DFEDTARU  - limite superior da meta do Fed (desde dez/2008): contexto, o ciclo do Fed
//   fator (calculado sob demanda, NUNCA gravado):
//     A. treasury10a e metaFed da semana; variacaoMeta52Semanas = o ciclo do Fed no último ano (contexto)
//     B. treasury10a26SemanasAntes; variacao26Semanas = treasury10a - ele, em p.p.
//     C. decisão por faixa sobre a variação: juro subindo além da faixa = pressão de BAIXA ("juros altos podem
//        pressionar demanda; juros baixos favorecem", FEL 1); caindo, de alta
//
// Por que o Treasury e não a meta (histórico do Brent futuro, 2011 a 2026, ADR 0102): a meta do Fed só se relaciona
// com o preço por causa da pandemia; sem 2019 a 2021, perto de zero. A alta do Treasury em 26 semanas tem -0,16 e -0,14
// com o Brent 91 e 182 dias depois, o mesmo sem as crises. O juro também sobe com o petróleo dos 6 meses anteriores
// (+0,45: petróleo alto, inflação, juro); a pressão é o efeito seguinte. Direção própria e o Treasury no lugar da meta
// são decisões do usuário (ADR 0102). Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "juros_petroleo_treasury_10a";
const FACTOR_VERSION = 1;

const SERIES = { treasury10a: "FRED.DGS10", metaFed: "FRED.DFEDTARU" };

// Padrões do FinMind (2026-10-03), do histórico do banco de dev desde 2010: |variação em 26 semanas| tem percentis
// 40/60/80 de 0,28 / 0,47 / 0,79 p.p.; a mudança dela em 4 semanas tem mediana de 0,19 p.p. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 0.5,
  limiarFortePct: 1,
  semanasTendencia: 4,
  limiarTendenciaPp: 0.25
});

const ACIMA_PRESSIONA = faixa.DIRECAO.BAIXA;
const ROTULOS_TENDENCIA = { SUBINDO: "Juro acelerando a alta", CAINDO: "Juro acelerando a queda", ESTAVEL: "Estável" };
const UNIDADE = " p.p.";

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  primeiroPasso: (p) =>
    `O Treasury de 10 anos ficou em ${faixa.fmt(p.treasury10a)}% na semana, contra ${faixa.fmt(p.treasury10a26SemanasAntes)}% ` +
    `26 semanas antes: ${faixa.comSinal(p.variacao26Semanas)}${UNIDADE} (B).` +
    (p.metaFed === null ? "" : ` A meta do Fed está em ${faixa.fmt(p.metaFed)}% (contexto).`),
  nomeValor: "a variação",
  abaixo: "juro em queda barateia o crédito e favorece a atividade e a demanda por petróleo",
  acima: "juro em alta encarece o crédito e pressiona a atividade e a demanda por petróleo",
  subindo: "a alta do juro está ganhando força (ou a queda perdendo)",
  caindo: "a queda do juro está ganhando força (ou a alta perdendo)",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

const EPISODIOS = [
  { data: "2013-09-06", rotulo: "Taper tantrum: o mercado antecipa o fim das compras do Fed" },
  { data: "2020-03-27", rotulo: "Pandemia: juro despenca" },
  { data: "2022-06-17", rotulo: "Ciclo de alta do Fed contra a inflação" },
  { data: "2023-10-20", rotulo: "Treasury de 10 anos a 5%" },
  { data: "2024-09-20", rotulo: "Início dos cortes do Fed" }
];
const CENARIOS = [
  { valor: 1.5, valorAnterior: 0.8, rotulo: "Juro subindo forte e acelerando" },
  { valor: 0.7, valorAnterior: 0.75, rotulo: "Juro subindo, ritmo estável" },
  { valor: 0.1, valorAnterior: 0.9, rotulo: "Juro parado, depois de subir" },
  { valor: -0.7, valorAnterior: -0.3, rotulo: "Juro caindo e acelerando a queda" },
  { valor: -1.4, valorAnterior: -1.6, rotulo: "Juro caindo forte, perdendo ritmo" }
];

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
    "segunda). A meta do Fed é contexto: a leitura usa o juro longo, que embute a expectativa do mercado para o Fed."
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
  acimaPressiona: ACIMA_PRESSIONA,
  textos: TEXTOS,
  episodios: EPISODIOS,
  cenarios: CENARIOS,
  apresentacao: APRESENTACAO
});

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIES,
  PARAMETROS_PADRAO,
  METODOLOGIA: fator.METODOLOGIA,
  derivarJurosPetroleo: fator.derivar,
  calcularJurosPetroleo: fator.calcular,
  explicarJuros: fator.explicar,
  exemplosJuros: fator.exemplos
};
