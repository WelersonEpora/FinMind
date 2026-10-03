"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");

// FATOR (PROPOSTA, ADR 0050): oferta não-OPEP, fator "Oferta não-OPEP (Brasil, Guiana, Noruega)" do FEL 1 para o
// petróleo. Mesmo molde dos outros, mas MENSAL: camadas A e B calculadas, C simulada pela decisão por faixa com
// parâmetros que o Comitê ajusta; o peso é o do FEL 1; não alimenta o motor, o Centro de Decisão nem a IA.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), mensais (o dia é o 1º do mês):
//     ANP.PETROLEO_PRODUCAO.<UF>.<MAR|TERRA> - Brasil, por UF, em m³ no mês (as 11 UFs produtoras do arquivo)
//     JODI.PETROLEO_PRODUCAO.NO.PRODUCAO     - Noruega, mil barris/dia
//     JODI.PETROLEO_PRODUCAO.CA.PRODUCAO     - Canadá, mil barris/dia (não está no FEL 1: incluído por decisão do
//                                              usuário, 2026-10-03, por ser o 4º produtor do mundo)
//   Fora, por decisão do usuário (2026-10-03): os EUA, que já são o fator de produção dos EUA (contariam duas vezes);
//   a Guiana não reporta a nenhuma fonte coletada.
//   fator (calculado sob demanda, NUNCA gravado):
//     A. brasil = soma das UFs, em mil barris/dia (m³ × 6,28981 ÷ dias do mês ÷ 1.000); noruega; canada; total
//     B. media3Meses do total; crescimentoAnualPct = contra a média dos mesmos 3 meses do ano anterior (o mês sozinho
//        oscila com paradas de manutenção)
//     C. decisão por faixa sobre o crescimento: oferta crescendo acima da faixa = pressão de BAIXA ("alta com oferta
//        menor; baixa com crescimento de produção", FEL 1); caindo, de alta
//
// Um mês só entra com os três países. No histórico (2010 a 2026), o crescimento destes três não antecipa o preço
// (perto de zero com o WTI 6 e 12 meses depois, contando os ~2 meses até a divulgação): mede a situação da oferta,
// como a demanda. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "oferta_nao_opep_br_no_ca";
const FACTOR_VERSION = 1;

const UFS = ["AL", "AM", "BA", "CE", "ES", "MA", "PR", "RJ", "RN", "SE", "SP"];
const SERIES_BRASIL = UFS.flatMap((uf) => [`ANP.PETROLEO_PRODUCAO.${uf}.MAR`, `ANP.PETROLEO_PRODUCAO.${uf}.TERRA`]);
const SERIES = {
  brasil: SERIES_BRASIL,
  noruega: "JODI.PETROLEO_PRODUCAO.NO.PRODUCAO",
  canada: "JODI.PETROLEO_PRODUCAO.CA.PRODUCAO"
};

const BARRIS_POR_M3 = 6.28981;
const MESES_MEDIA = 3;
const MESES_ANO = 12;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2010 a 2026): |crescimento anual| tem percentis
// 40/60/80 de 2,9 / 4,1 / 7,3%; a mudança dele em 3 meses tem mediana de ~1,9 p.p. O Comitê ajusta. A janela da
// tendência é em MESES (a chave `semanasTendencia` é a mesma dos fatores semanais: é a das versões gravadas).
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 3,
  limiarFortePct: 7,
  semanasTendencia: 3,
  limiarTendenciaPp: 2
});

const ACIMA_PRESSIONA = faixa.DIRECAO.BAIXA;
const ROTULOS_TENDENCIA = { SUBINDO: "Oferta acelerando", CAINDO: "Oferta desacelerando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// O 1º dia do mês `k` meses antes ou depois de `mesIso` (AAAA-MM-01).
function somarMeses(mesIso, k) {
  const [ano, mes] = mesIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1 + k, 1)).toISOString().slice(0, 10);
}

function diasDoMes(mesIso) {
  const [ano, mes] = mesIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// As linhas de obterAsOf() -> Map(mês -> { brasil, noruega, canada, disponivelEm, estimado }), só os meses com os
// três países (o Brasil, com ao menos uma UF).
function mesesCompletos(linhasAsOf) {
  const brasil = new Set(SERIES.brasil);
  const meses = new Map();
  for (const linha of linhasAsOf) {
    let campo = null;
    if (brasil.has(linha.seriesCode)) campo = "brasil";
    else if (linha.seriesCode === SERIES.noruega) campo = "noruega";
    else if (linha.seriesCode === SERIES.canada) campo = "canada";
    if (!campo) continue;
    if (!meses.has(linha.observedAt)) meses.set(linha.observedAt, { brasil: undefined, noruega: undefined, canada: undefined, disponivelEm: null, estimado: false });
    const mes = meses.get(linha.observedAt);
    if (campo === "brasil") mes.brasil = (mes.brasil || 0) + (linha.value * BARRIS_POR_M3) / diasDoMes(linha.observedAt) / 1000;
    else mes[campo] = linha.value;
    if (!mes.disponivelEm || linha.publishedAt > mes.disponivelEm) mes.disponivelEm = linha.publishedAt;
    mes.estimado = mes.estimado || linha.publishedAtIsEstimated;
  }
  for (const [data, mes] of meses) {
    if (mes.brasil === undefined || mes.noruega === undefined || mes.canada === undefined) meses.delete(data);
  }
  return meses;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por mês.
function derivarOfertaNaoOpep(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const meses = mesesCompletos(linhasAsOf);
  const totalEm = (data) => {
    const mes = meses.get(data);
    return mes ? mes.brasil + mes.noruega + mes.canada : undefined;
  };
  const media3Em = (data) => {
    const valores = Array.from({ length: MESES_MEDIA }, (_, k) => totalEm(somarMeses(data, -k)));
    return valores.every((v) => v !== undefined) ? valores.reduce((a, b) => a + b, 0) / MESES_MEDIA : undefined;
  };

  const crescimentos = new Map();
  const pontos = [];
  for (const observedAt of [...meses.keys()].sort()) {
    const mes = meses.get(observedAt);
    const media = media3Em(observedAt);
    const mediaAnoAnterior = media3Em(somarMeses(observedAt, -MESES_ANO));
    const crescimento = media === undefined || mediaAnoAnterior === undefined ? null : arredondar((media / mediaAnoAnterior - 1) * 100, 2);
    crescimentos.set(observedAt, crescimento);
    const anterior = crescimentos.get(somarMeses(observedAt, -parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      brasil: arredondar(mes.brasil, 0),
      noruega: arredondar(mes.noruega, 0),
      canada: arredondar(mes.canada, 0),
      total: arredondar(totalEm(observedAt), 0),
      media3Meses: media === undefined ? null : arredondar(media, 0),
      media3MesesAnoAnterior: mediaAnoAnterior === undefined ? null : arredondar(mediaAnoAnterior, 0),
      crescimentoAnualPct: crescimento,
      decisao: faixa.decidirPorFaixa(crescimento, anterior ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: mes.disponivelEm,
      disponivelEmEhEstimado: mes.estimado
    });
  }
  return pontos;
}

async function calcularOfertaNaoOpep({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const seriesCodes = [...SERIES.brasil, SERIES.noruega, SERIES.canada];
  const linhas = await servico.obterAsOf({ seriesCodes, asOf }, deps);
  return derivarOfertaNaoOpep(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "crescimentoAnualPct",
  janela: "meses",
  primeiroPasso: (p) =>
    `Brasil, Noruega e Canadá produziram ${faixa.fmt(p.media3Meses, 0)} mil barris/dia na média dos 3 meses até este, ` +
    `contra ${faixa.fmt(p.media3MesesAnoAnterior, 0)} nos mesmos meses do ano anterior: ${faixa.comSinal(p.crescimentoAnualPct)}% (B).`,
  nomeValor: "o crescimento anual",
  abaixo: "oferta não-OPEP encolhendo deixa o mercado mais apertado",
  acima: "oferta não-OPEP crescendo forte aumenta a oferta global",
  subindo: "o crescimento da oferta está acelerando",
  caindo: "o crescimento da oferta está desacelerando",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const EPISODIOS = [
  { data: "2014-12-01", rotulo: "Queda do petróleo de 2014" },
  { data: "2019-06-01", rotulo: "Corte obrigatório da produção em Alberta (Canadá)" },
  { data: "2020-06-01", rotulo: "Cortes da pandemia" },
  { data: "2023-12-01", rotulo: "Pré-sal e areias betuminosas em alta" },
  { data: "2026-07-01", rotulo: "Mais recente com os três países" }
];
const CENARIOS = [
  { valor: 9, valorAnterior: 5, rotulo: "Crescendo forte e acelerando" },
  { valor: 4, valorAnterior: 4.5, rotulo: "Crescendo acima do normal, ritmo estável" },
  { valor: 1, valorAnterior: 5, rotulo: "Perto de zero, depois de crescer" },
  { valor: -4, valorAnterior: -1, rotulo: "Encolhendo e piorando" },
  { valor: -8, valorAnterior: -10, rotulo: "Encolhendo forte, mas melhorando" }
];

function explicarOferta(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosOferta(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    episodios: EPISODIOS,
    cenarios: CENARIOS,
    acimaPressiona: ACIMA_PRESSIONA
  });
}

const APRESENTACAO = {
  unidade: "mil barris/dia",
  quadros: [
    { camada: "A", rotulo: "Brasil (ANP)", campo: "brasil", casas: 0, sufixo: "mil barris/dia, convertido de m³" },
    { camada: "A", rotulo: "Noruega (JODI)", campo: "noruega", casas: 0, sufixo: "mil barris/dia" },
    { camada: "A", rotulo: "Canadá (JODI)", campo: "canada", casas: 0, sufixo: "mil barris/dia" },
    {
      camada: "B",
      rotulo: "Média de 3 meses dos três",
      campo: "media3Meses",
      casas: 0,
      secundario: { campo: "media3MesesAnoAnterior", casas: 0, prefixo: "mil barris/dia; um ano antes:", sufixo: "" }
    },
    { camada: "B", rotulo: "Crescimento anual", campo: "crescimentoAnualPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Produção de Brasil, Noruega e Canadá (A) e a média de 3 meses do total contra um ano antes (B)",
    unidade: "mil barris/dia",
    casas: 0,
    exigeCampo: "media3MesesAnoAnterior",
    series: [
      { campo: "media3Meses", rotulo: "Média de 3 meses (B)" },
      { campo: "media3MesesAnoAnterior", rotulo: "Um ano antes (B)" },
      { campo: "brasil", rotulo: "Brasil (A)" },
      { campo: "canada", rotulo: "Canadá (A)" },
      { campo: "noruega", rotulo: "Noruega (A)" }
    ]
  },
  graficoC: { titulo: "Crescimento anual (B) e as faixas da decisão (C)", campo: "crescimentoAnualPct", rotulo: "Crescimento anual (B)" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ janela: "meses" }),
  exemplos: { colunaValor: "Crescimento anual" },
  nota:
    "Mensal, não é tempo real: a ANP publica o mês até o fim do mês seguinte e o JODI, com ~2 meses de atraso; o mês " +
    "só entra com os três países. Sem os EUA, que têm fator próprio."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "MENSAL",
  calcular: calcularOfertaNaoOpep,
  explicar: explicarOferta,
  exemplos: exemplosOferta,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIES,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  derivarOfertaNaoOpep,
  calcularOfertaNaoOpep,
  explicarOferta,
  exemplosOferta
};
