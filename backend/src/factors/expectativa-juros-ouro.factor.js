"use strict";

const faixa = require("./base/decisao-por-faixa");
const { criarFatorJuroVariacao } = require("./modelos/juro-variacao-semanal");

// FATOR FORA DO FEL 1 (ADR 0155, decisão do usuário; item M1 da análise do ouro de 2026-11-01): a expectativa de juros
// do Fed pelo Treasury de 2 anos, no lugar das probabilidades do CME FedWatch que o documento pede (fonte nova e paga).
// O cálculo é o molde comum dos juros (modelos/juro-variacao-semanal.js), com a janela de 13 semanas.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), diários, na média da semana (sábado a sexta):
//     FRED.DGS2      - rendimento do Treasury de 2 anos: o prazo da curva que mais reage ao que o mercado espera do Fed
//                      (já coletado, ADR 0119)
//     FRED.DFEDTARU  - limite superior da meta do Fed: contexto, o ciclo do Fed
//   fator (calculado sob demanda, NUNCA gravado):
//     A. juro2a e metaFed da semana; variacaoMeta52Semanas = o ciclo do Fed no último ano (contexto)
//     B. juro2a13SemanasAntes; variacao13Semanas = juro2a - ele, em p.p.
//     C. decisão por faixa sobre a variação: o 2 anos subindo além da faixa (o mercado esperando mais aperto) =
//        pressão de BAIXA no ouro; caindo (mais cortes), de alta
//
// Por que (ADR 0155): o IC da variação de 13 semanas contra o ouro da LBMA, de 2006 a 2026, foi de +0,06 em 5 pregões,
// +0,12 em 21 e +0,17 em 62, com o intervalo de 90% excluindo o zero e positivo nas duas metades. Fora da amostra (1977 a
// 2005), o mesmo lado e cerca de um terço do tamanho, sem significância: a relação é do regime pós-2006, em que o Fed
// domina o ouro. Por isso o peso Baixo e o voto só no MEDIO e no LONGO. Propriedades: determinístico, versionado,
// point-in-time, sem IA.

const FACTOR_ID = "expectativa_juros_ouro_dgs2_13s";
const FACTOR_VERSION = 1;

const SERIES = { juro2a: "FRED.DGS2", metaFed: "FRED.DFEDTARU" };

// Padrões do FinMind (2026-11-04), do histórico do banco de dev (2006 a 2026): |variação em 13 semanas| tem percentis
// 40/60/80 de 0,12 / 0,25 / 0,47 p.p.; a mudança dela em 4 semanas tem mediana de 0,12 p.p.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 0.15,
  limiarFortePct: 0.5,
  semanasTendencia: 4,
  limiarTendenciaPp: 0.15
});

const ACIMA_PRESSIONA = faixa.DIRECAO.BAIXA;
const ROTULOS_TENDENCIA = { SUBINDO: "Expectativa de aperto ganhando força", CAINDO: "Expectativa de cortes ganhando força", ESTAVEL: "Estável" };
const UNIDADE = " p.p.";

const TEXTOS = {
  primeiroPasso: (p) =>
    `O Treasury de 2 anos ficou em ${faixa.fmt(p.juro2a)}% na semana, contra ${faixa.fmt(p.juro2a13SemanasAntes)}% ` +
    `13 semanas antes: ${faixa.comSinal(p.variacao13Semanas)}${UNIDADE} (B).` +
    (p.metaFed === null ? "" : ` A meta do Fed está em ${faixa.fmt(p.metaFed)}% (contexto).`),
  nomeValor: "a variação",
  abaixo: "o 2 anos em queda mostra o mercado esperando juros mais baixos do Fed, o que favorece o ouro",
  acima: "o 2 anos em alta mostra o mercado esperando juros mais altos do Fed, o que pesa no ouro",
  subindo: "a expectativa de aperto está ganhando força (ou a de cortes perdendo)",
  caindo: "a expectativa de cortes está ganhando força (ou a de aperto perdendo)",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

const EPISODIOS = [
  { data: "2008-12-19", rotulo: "Fed leva os juros a zero na crise de 2008" },
  { data: "2013-06-28", rotulo: "Taper tantrum: o mercado antecipa o fim dos estímulos" },
  { data: "2022-06-17", rotulo: "Fed acelera as altas contra a inflação" },
  { data: "2024-09-20", rotulo: "Início dos cortes do Fed" }
];
const CENARIOS = [
  { valor: 0.8, valorAnterior: 0.4, rotulo: "Expectativa de aperto forte e acelerando" },
  { valor: 0.3, valorAnterior: 0.3, rotulo: "Expectativa de aperto, ritmo estável" },
  { valor: 0.05, valorAnterior: 0.4, rotulo: "2 anos parado, depois de subir" },
  { valor: -0.3, valorAnterior: -0.1, rotulo: "Expectativa de cortes ganhando força" },
  { valor: -0.9, valorAnterior: -1.1, rotulo: "Expectativa de cortes forte, perdendo ritmo" }
];

const APRESENTACAO = {
  unidade: "p.p.",
  quadros: [
    {
      camada: "A",
      rotulo: "Treasury de 2 anos",
      campo: "juro2a",
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
    { camada: "B", rotulo: "Treasury de 2 anos 13 semanas antes", campo: "juro2a13SemanasAntes", casas: 2, unidadeValor: "%" },
    { camada: "B", rotulo: "Variação em 13 semanas", campo: "variacao13Semanas", casas: 2, sinal: true, sufixo: "p.p." }
  ],
  graficoAB: {
    titulo: "Treasury de 2 anos (A) × o mesmo 13 semanas antes (B), com a meta do Fed",
    unidade: "% a.a.",
    casas: 2,
    exigeCampo: "juro2a13SemanasAntes",
    series: [
      { campo: "juro2a", rotulo: "Treasury 2 anos (A)" },
      { campo: "juro2a13SemanasAntes", rotulo: "13 semanas antes (B)" },
      { campo: "metaFed", rotulo: "Meta do Fed (contexto)" }
    ]
  },
  graficoC: { titulo: "Variação em 13 semanas (B) e as faixas da decisão (C)", campo: "variacao13Semanas", rotulo: "Variação (B)", unidade: "p.p." },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ unidade: "p.p.", unidadeMudanca: "p.p." }),
  exemplos: { colunaValor: "Variação", unidade: "p.p." },
  nota:
    "Semanal, não é tempo real: média dos dias da semana do Treasury de 2 anos (FRED; o valor de sexta sai na segunda). " +
    "A meta do Fed é contexto: a leitura usa o que o mercado espera, não a meta já decidida."
};

const fator = criarFatorJuroVariacao({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  semanasVariacao: 13,
  parametrosPadrao: PARAMETROS_PADRAO,
  series: { principal: SERIES.juro2a, contexto: SERIES.metaFed },
  campos: {
    principal: "juro2a",
    contexto: "metaFed",
    variacaoContexto: "variacaoMeta52Semanas",
    principalAntes: "juro2a13SemanasAntes",
    variacao: "variacao13Semanas"
  },
  acimaPressiona: ACIMA_PRESSIONA,
  textos: TEXTOS,
  episodios: EPISODIOS,
  cenarios: CENARIOS,
  apresentacao: APRESENTACAO
});

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA: fator.METODOLOGIA, derivarExpectativaJurosOuro: fator.derivar };
