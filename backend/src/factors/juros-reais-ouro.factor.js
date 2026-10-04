"use strict";

const faixa = require("./base/decisao-por-faixa");
const { criarFatorJuroVariacao } = require("./modelos/juro-variacao-semanal");

// FATOR (PROPOSTA, ADR 0050): juro real, fator "Juros reais (Fed) e rendimento dos títulos" do FEL 1 para o ouro. O
// cálculo é o molde comum dos juros (modelos/juro-variacao-semanal.js), o mesmo do petróleo, com o juro real no lugar
// do nominal.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), diários, na média da semana (sábado a sexta):
//     FRED.DFII10    - rendimento do Treasury de 10 anos indexado à inflação (TIPS): o juro real de mercado, o custo de
//                      oportunidade de quem fica com o ouro (que não paga juros)
//     FRED.DFEDTARU  - limite superior da meta do Fed (desde dez/2008): contexto, o ciclo do Fed
//   fator (calculado sob demanda, NUNCA gravado):
//     A. juroReal10a e metaFed da semana; variacaoMeta52Semanas = o ciclo do Fed no último ano (contexto)
//     B. juroReal10a26SemanasAntes; variacao26Semanas = juroReal10a - ele, em p.p.
//     C. decisão por faixa sobre a variação: juro real subindo além da faixa = pressão de BAIXA ("juros reais altos
//        pressionam ouro; juros baixos favorecem", FEL 1); caindo, de alta
//
// Por que a variação e não o nível (histórico de 2006 a 2026, contra a LBMA): a variação em 26 semanas anda com o ouro
// em sentido contrário (-0,52 com a variação do ouro nas mesmas 26 semanas; -0,64 em 2023 a 2026, os anos do
// "descolamento" que o FEL 1 cita, que é do NÍVEL), mas não antecipa o preço (+0,12 com o ouro 26 semanas depois). O
// nível tem correlação POSITIVA com o ouro seguinte (+0,51), o contrário do FEL 1: efeito das tendências longas, que
// não serve de regra. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "juros_reais_ouro_tips_10a";
const FACTOR_VERSION = 1;

const SERIES = { juroReal10a: "FRED.DFII10", metaFed: "FRED.DFEDTARU" };

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2006 a 2026): |variação em 26 semanas| tem percentis
// 40/60/80 de 0,24 / 0,36 / 0,61 p.p.; a mudança dela em 4 semanas tem mediana de 0,16 p.p. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 0.25,
  limiarFortePct: 0.6,
  semanasTendencia: 4,
  limiarTendenciaPp: 0.2
});

const ACIMA_PRESSIONA = faixa.DIRECAO.BAIXA;
const ROTULOS_TENDENCIA = { SUBINDO: "Juro real acelerando a alta", CAINDO: "Juro real acelerando a queda", ESTAVEL: "Estável" };
const UNIDADE = " p.p.";

const TEXTOS = {
  primeiroPasso: (p) =>
    `O juro real de 10 anos (TIPS) ficou em ${faixa.fmt(p.juroReal10a)}% na semana, contra ${faixa.fmt(p.juroReal10a26SemanasAntes)}% ` +
    `26 semanas antes: ${faixa.comSinal(p.variacao26Semanas)}${UNIDADE} (B).` +
    (p.metaFed === null ? "" : ` A meta do Fed está em ${faixa.fmt(p.metaFed)}% (contexto).`),
  nomeValor: "a variação",
  abaixo: "juro real em queda reduz o custo de oportunidade de ficar com o ouro, que não paga juros",
  acima: "juro real em alta aumenta o custo de oportunidade de ficar com o ouro, que não paga juros",
  subindo: "a alta do juro real está ganhando força (ou a queda perdendo)",
  caindo: "a queda do juro real está ganhando força (ou a alta perdendo)",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

const EPISODIOS = [
  { data: "2013-06-28", rotulo: "Taper tantrum: juro real dispara e o ouro despenca" },
  { data: "2020-08-07", rotulo: "Juro real negativo e ouro no recorde da pandemia" },
  { data: "2022-10-21", rotulo: "Alta do Fed: juro real volta a ficar positivo" },
  { data: "2024-09-20", rotulo: "Início dos cortes do Fed" }
];
const CENARIOS = [
  { valor: 1, valorAnterior: 0.5, rotulo: "Juro real subindo forte e acelerando" },
  { valor: 0.4, valorAnterior: 0.45, rotulo: "Juro real subindo, ritmo estável" },
  { valor: 0.05, valorAnterior: 0.5, rotulo: "Juro real parado, depois de subir" },
  { valor: -0.4, valorAnterior: -0.1, rotulo: "Juro real caindo e acelerando a queda" },
  { valor: -0.9, valorAnterior: -1.1, rotulo: "Juro real caindo forte, perdendo ritmo" }
];

const APRESENTACAO = {
  unidade: "p.p.",
  quadros: [
    {
      camada: "A",
      rotulo: "Juro real de 10 anos (TIPS)",
      campo: "juroReal10a",
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
    { camada: "B", rotulo: "Juro real 26 semanas antes", campo: "juroReal10a26SemanasAntes", casas: 2, unidadeValor: "%" },
    { camada: "B", rotulo: "Variação em 26 semanas", campo: "variacao26Semanas", casas: 2, sinal: true, sufixo: "p.p." }
  ],
  graficoAB: {
    titulo: "Juro real de 10 anos (A) × o mesmo 26 semanas antes (B), com a meta do Fed",
    unidade: "% a.a.",
    casas: 2,
    exigeCampo: "juroReal10a26SemanasAntes",
    series: [
      { campo: "juroReal10a", rotulo: "Juro real 10 anos (A)" },
      { campo: "juroReal10a26SemanasAntes", rotulo: "26 semanas antes (B)" },
      { campo: "metaFed", rotulo: "Meta do Fed (contexto)" }
    ]
  },
  graficoC: { titulo: "Variação em 26 semanas (B) e as faixas da decisão (C)", campo: "variacao26Semanas", rotulo: "Variação (B)", unidade: "p.p." },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ unidade: "p.p.", unidadeMudanca: "p.p." }),
  exemplos: { colunaValor: "Variação", unidade: "p.p." },
  nota:
    "Semanal, não é tempo real: média dos dias da semana do juro real de 10 anos (FRED, TIPS; o valor de sexta sai na " +
    "segunda). A meta do Fed é contexto: a leitura usa o juro real de mercado."
};

const fator = criarFatorJuroVariacao({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  series: { principal: SERIES.juroReal10a, contexto: SERIES.metaFed },
  campos: {
    principal: "juroReal10a",
    contexto: "metaFed",
    variacaoContexto: "variacaoMeta52Semanas",
    principalAntes: "juroReal10a26SemanasAntes",
    variacao: "variacao26Semanas"
  },
  acimaPressiona: ACIMA_PRESSIONA,
  textos: TEXTOS,
  episodios: EPISODIOS,
  cenarios: CENARIOS,
  apresentacao: APRESENTACAO
});

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA: fator.METODOLOGIA, derivarJurosReaisOuro: fator.derivar };
