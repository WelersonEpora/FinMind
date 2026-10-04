"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarMeses } = require("./base/meses");

// FATOR (PROPOSTA, ADR 0050): mineração, fator "Produção e oferta de mineração" do FEL 1 para o ouro. Camadas A e B
// calculadas, C simulada pela decisão por faixa com parâmetros que o Comitê ajusta; o peso (Baixo) é o do FEL 1.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (tabela observation), trimestral, do World Gold Council (USO INTERNO, ADR 0037; dados da Metals Focus):
//     WGC.OFERTA_DEMANDA.PRODUCAO_MINAS - a produção das minas no trimestre, em toneladas
//   fator (calculado sob demanda, NUNCA gravado):
//     A. producaoTrimestreT; producao4TrimestresT = a soma dos últimos 4 trimestres (tira a sazonalidade)
//     B. producao4TrimestresAntesT = a mesma soma um ano antes; crescimentoAnualPct = a variação, em %
//     C. decisão por faixa sobre o crescimento: produção crescendo além da faixa = pressão de BAIXA (mais oferta);
//        encolhendo, de alta. O FEL 1 diz "impacto limitado; oferta é relativamente inelástica"
//
// No histórico (2011 a 2026, 59 trimestres, contra a LBMA), a relação é fraca e curta: -0,25 com o ouro 26 semanas
// depois e -0,39 com as 26 semanas anteriores; a produção varia pouco (|crescimento anual| até ~4% em 80% dos
// trimestres), o que confirma o "impacto limitado" do FEL 1. Propriedades: determinístico, versionado, point-in-time
// (a data de disponibilidade do WGC é a da 1ª coleta: datas anteriores ficam sem dado), sem IA.

const FACTOR_ID = "mineracao_ouro_wgc";
const FACTOR_VERSION = 1;

const SERIE_PRODUCAO = "WGC.OFERTA_DEMANDA.PRODUCAO_MINAS";
const TRIMESTRES_ANO = 4;
const MESES_TRIMESTRE = 3;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2011 a 2026): |crescimento anual| tem percentis
// 40/60/80 de 2,5 / 3,3 / 4,0%; a mudança dele em 4 trimestres tem mediana de ~1,8 p.p. O Comitê ajusta. A janela da
// tendência é em TRIMESTRES (a chave é a dos fatores semanais).
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 2.5,
  limiarFortePct: 4,
  semanasTendencia: 2,
  limiarTendenciaPp: 1.5
});

const ACIMA_PRESSIONA = faixa.DIRECAO.BAIXA;
const ROTULOS_TENDENCIA = { SUBINDO: "Produção acelerando", CAINDO: "Produção desacelerando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por trimestre (o 1º dia do trimestre).
function derivarMineracaoOuro(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const trimestres = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode !== SERIE_PRODUCAO) continue;
    trimestres.set(linha.observedAt, { valor: linha.value, disponivelEm: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
  }
  const somaAte = (fim) => {
    let soma = 0;
    for (let k = 0; k < TRIMESTRES_ANO; k += 1) {
      const t = trimestres.get(somarMeses(fim, -MESES_TRIMESTRE * k));
      if (!t) return null;
      soma += t.valor;
    }
    return soma;
  };

  const crescimentos = new Map();
  const pontos = [];
  for (const observedAt of [...trimestres.keys()].sort()) {
    const trimestre = trimestres.get(observedAt);
    const soma = somaAte(observedAt);
    const somaAntes = somaAte(somarMeses(observedAt, -MESES_TRIMESTRE * TRIMESTRES_ANO));
    const crescimento = soma !== null && somaAntes ? arredondar((soma / somaAntes - 1) * 100, 2) : null;
    crescimentos.set(observedAt, crescimento);
    const anterior = crescimentos.get(somarMeses(observedAt, -MESES_TRIMESTRE * parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      producaoTrimestreT: arredondar(trimestre.valor, 1),
      producao4TrimestresT: soma === null ? null : arredondar(soma, 0),
      producao4TrimestresAntesT: somaAntes === null ? null : arredondar(somaAntes, 0),
      crescimentoAnualPct: crescimento,
      decisao: faixa.decidirPorFaixa(crescimento, anterior ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: trimestre.disponivelEm,
      disponivelEmEhEstimado: trimestre.estimado
    });
  }
  return pontos;
}

async function calcularMineracaoOuro({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: [SERIE_PRODUCAO], asOf }, deps);
  return derivarMineracaoOuro(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "crescimentoAnualPct",
  janela: "trimestres",
  primeiroPasso: (p) =>
    `As minas produziram ${faixa.fmt(p.producao4TrimestresT, 0)} t nos 4 trimestres até este, contra ` +
    `${faixa.fmt(p.producao4TrimestresAntesT, 0)} t um ano antes: ${faixa.comSinal(p.crescimentoAnualPct)}% (B).`,
  nomeValor: "o crescimento anual",
  abaixo: "produção das minas encolhendo reduz a oferta de ouro novo",
  acima: "produção das minas crescendo aumenta a oferta de ouro novo",
  subindo: "a produção está acelerando",
  caindo: "a produção está desacelerando",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const EPISODIOS = [
  { data: "2016-10-01", rotulo: "Produção crescendo depois da queda de 2013" },
  { data: "2020-04-01", rotulo: "Minas paradas na pandemia" },
  { data: "2025-10-01", rotulo: "Produção recorde com o ouro alto" }
];
const CENARIOS = [
  { valor: 6, valorAnterior: 3, rotulo: "Crescendo forte e acelerando" },
  { valor: 3, valorAnterior: 3.2, rotulo: "Crescendo acima do normal, estável" },
  { valor: 0.5, valorAnterior: 3, rotulo: "Perto de zero, depois de crescer" },
  { valor: -3, valorAnterior: -1, rotulo: "Encolhendo e piorando" },
  { valor: -5, valorAnterior: -6, rotulo: "Encolhendo forte, mas melhorando" }
];

function explicarMineracao(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosMineracao(pontosTodos, parametros = PARAMETROS_PADRAO) {
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
    { camada: "A", rotulo: "Produção das minas no trimestre", campo: "producaoTrimestreT", casas: 0, sufixo: "t" },
    { camada: "A", rotulo: "Produção em 4 trimestres", campo: "producao4TrimestresT", casas: 0, sufixo: "t" },
    { camada: "B", rotulo: "Os mesmos 4 trimestres um ano antes", campo: "producao4TrimestresAntesT", casas: 0, sufixo: "t" },
    { camada: "B", rotulo: "Crescimento anual", campo: "crescimentoAnualPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Produção das minas em 4 trimestres (A) × um ano antes (B), em toneladas",
    unidade: "t",
    casas: 0,
    exigeCampo: "producao4TrimestresAntesT",
    series: [
      { campo: "producao4TrimestresT", rotulo: "4 trimestres (A)" },
      { campo: "producao4TrimestresAntesT", rotulo: "Um ano antes (B)" }
    ]
  },
  graficoC: { titulo: "Crescimento anual (B) e as faixas da decisão (C)", campo: "crescimentoAnualPct", rotulo: "Crescimento anual (B)" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ janela: "trimestres" }),
  exemplos: { colunaValor: "Crescimento anual" },
  nota:
    "Trimestral, não é tempo real: o World Gold Council publica o trimestre cerca de um mês depois do fim dele (Gold " +
    "Demand Trends). Dado de uso interno (os termos do WGC não permitem redistribuir, ADR 0037)."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "TRIMESTRAL",
  calcular: calcularMineracaoOuro,
  explicar: explicarMineracao,
  exemplos: exemplosMineracao,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIE_PRODUCAO, PARAMETROS_PADRAO, METODOLOGIA, derivarMineracaoOuro, calcularMineracaoOuro };
