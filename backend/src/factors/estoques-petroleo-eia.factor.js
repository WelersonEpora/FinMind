"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { mediaMesmaSemana, ANOS: ANOS_MEDIA, DIAS_SEMANA, SEMANAS_ANO } = require("./base/mesma-semana-5-anos");

// FATOR (PROPOSTA, ADR 0050): estoques de petróleo dos EUA (EIA), fator "Estoques de petróleo dos EUA (EIA)" do FEL 1.
// A proposta do catálogo `shared/metodologia-petroleo.js` calculada, para o David e o Comitê verem como o fator
// ficaria. As três camadas: A (medida), B (comparação) e C (direção, intensidade e tendência) - esta SIMULADA pela
// decisão por faixa (`base/decisao-por-faixa.js`), com parâmetros que o Comitê ajusta (padrões abaixo; os em uso
// ficam no banco, ADR 0050). O peso não é calculado: é o do FEL 1. Não alimenta o motor, o Centro de Decisão nem a
// IA. Só o que entra na conta do fator: o preço fica de fora.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (tabela observation):
//     EIA.PETROLEO_ESTOQUES.PETROLEO_SEM_SPR - estoque de petróleo sem a reserva estratégica, semanal (mil barris)
//     EIA.PETROLEO_ESTOQUES.PETROLEO_CUSHING, .GASOLINA e .DESTILADOS - só como CONTEXTO (v2, decisão do usuário,
//                          ADR 0097): o desvio de cada um contra a mesma média, nos quadros B, fora da regra da camada C
//   fator (calculado sob demanda, NUNCA gravado):
//     A. variacaoSemanal = estoque(t) - estoque(t - 1 semana)
//     B. media5Anos      = média do estoque nas semanas t - 52k semanas, k = 1..5 (a "mesma semana" dos 5 anos
//                          anteriores, como a EIA compara no relatório); nula se faltar qualquer uma das 5
//        desvio          = estoque(t) - media5Anos, e desvioPct = desvio / media5Anos
//     C. decisão por faixa sobre desvioPct: abaixo da faixa (estoque abaixo do normal, aperto) = pressão de alta,
//        a direção do FEL 1 ("alta com estoques abaixo do esperado"); tendência pela mudança do desvio
//
// No histórico do Brent futuro (2011 a 2026, ADR 0097), o desvio descreve a situação (-0,50 com o nível do preço), mas
// não antecipa o preço até 90 dias (perto de zero) e, em 6 meses, aponta o contrário do FEL 1; a direção fica, como
// leitura da situação, por decisão do usuário.
//
// Propriedades: determinístico, versionado (FACTOR_VERSION; os parâmetros vão junto na resposta), point-in-time (só
// o publicado até `asOf`; cada ponto informa `disponivelEm`), sem IA e sem estimativa própria. As semanas anteriores
// entram como conhecidas em `asOf`, não como eram conhecidas na semana t (a EIA quase não revisa estes estoques).

const FACTOR_ID = "estoques_petroleo_eia";
// v2 (2026-10-07, ADR 0097): o desvio de Cushing, da gasolina e dos destilados como contexto, sem mudar a decisão.
const FACTOR_VERSION = 2;

const SERIE_ESTOQUE = "EIA.PETROLEO_ESTOQUES.PETROLEO_SEM_SPR";
// Os estoques de contexto: o campo do desvio de cada um no ponto e a série.
const SERIES_CONTEXTO = Object.freeze({
  desvioCushingPct: "EIA.PETROLEO_ESTOQUES.PETROLEO_CUSHING",
  desvioGasolinaPct: "EIA.PETROLEO_ESTOQUES.GASOLINA",
  desvioDestiladosPct: "EIA.PETROLEO_ESTOQUES.DESTILADOS"
});

// Padrões do FinMind (2026-10-02), tirados da distribuição do desvio de 1987 a 2026 no banco de dev: |desvio| tem
// mediana de ~5,5% e 3º quartil de ~10%; a mudança do desvio em 4 semanas tem mediana de ~1,9 p.p. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 3,
  limiarFortePct: 10,
  semanasTendencia: 4,
  limiarTendenciaPp: 2
});

const ROTULOS_TENDENCIA = { SUBINDO: "Afrouxando", CAINDO: "Apertando", ESTAVEL: "Estável" };

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

function decidirEstoques(desvioPct, desvioAnterior, parametros = PARAMETROS_PADRAO) {
  return faixa.decidirPorFaixa(desvioPct, desvioAnterior, parametros);
}

// Função PURA: recebe as linhas de obterAsOf() (uma por período) e devolve os pontos do fator, das semanas
// observadas a partir de `observadoDesde` (as anteriores só servem de base para a média e a tendência).
function derivarEstoquesPetroleoEia(linhasAsOf, { observadoDesde = null, parametros = PARAMETROS_PADRAO } = {}) {
  const estoques = new Map();
  const contexto = new Map(Object.values(SERIES_CONTEXTO).map((serie) => [serie, new Map()]));
  for (const linha of linhasAsOf) {
    if (linha.seriesCode === SERIE_ESTOQUE) estoques.set(linha.observedAt, linha);
    else contexto.get(linha.seriesCode)?.set(linha.observedAt, linha.value);
  }
  // O desvio de um estoque de contexto contra a média da mesma semana nos 5 anos anteriores, em %; nulo sem a média.
  const desvioContexto = (serie, observedAt) => {
    const valores = contexto.get(serie);
    const atual = valores.get(observedAt);
    const media = atual === undefined ? null : mediaMesmaSemana((data) => valores.get(data), observedAt);
    return media === null ? null : arredondar((atual / media - 1) * 100, 2);
  };

  const desvios = new Map();
  const pontos = [];
  for (const observedAt of [...estoques.keys()].sort()) {
    const atual = estoques.get(observedAt);
    const anterior = estoques.get(somarDias(observedAt, -DIAS_SEMANA));

    const media = mediaMesmaSemana((data) => estoques.get(data)?.value, observedAt);
    const media5Anos = media === null ? null : arredondar(media, 1);
    const desvio = media5Anos === null ? null : arredondar(atual.value - media5Anos, 1);
    const desvioPct = desvio === null ? null : arredondar((desvio / media5Anos) * 100, 2);
    desvios.set(observedAt, desvioPct);

    if (observadoDesde && observedAt < observadoDesde) continue;
    const desvioAnterior = desvios.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      estoque: atual.value,
      variacaoSemanal: anterior ? arredondar(atual.value - anterior.value, 1) : null,
      media5Anos,
      desvio,
      desvioPct,
      ...Object.fromEntries(Object.entries(SERIES_CONTEXTO).map(([campo, serie]) => [campo, desvioContexto(serie, observedAt)])),
      decisao: decidirEstoques(desvioPct, desvioAnterior ?? null, parametros),
      disponivelEm: atual.publishedAt,
      disponivelEmEhEstimado: atual.publishedAtIsEstimated
    });
  }
  return pontos;
}

async function calcularEstoquesPetroleoEia({ asOf, observadoDesde, observadoAte, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  // A média de 5 anos precisa das 5 "mesmas semanas" antes do 1º ponto pedido, e a tendência, do desvio de
  // `semanasTendencia` semanas antes (que por sua vez precisa da média dele): folga de 5 anos + a tendência + 1 semana.
  const semanasFolga = SEMANAS_ANO * ANOS_MEDIA + parametros.semanasTendencia + 1;
  const baseDesde = observadoDesde ? somarDias(observadoDesde, -DIAS_SEMANA * semanasFolga) : undefined;
  const seriesCodes = [SERIE_ESTOQUE, ...Object.values(SERIES_CONTEXTO)];
  const linhas = await servico.obterAsOf({ seriesCodes, asOf, observadoDesde: baseDesde, observadoAte }, deps);
  return derivarEstoquesPetroleoEia(linhas, { observadoDesde, parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "desvioPct",
  primeiroPasso: (p) => `O estoque está ${faixa.comSinal(p.desvioPct)}% contra a média da mesma semana nos 5 anos anteriores (B).`,
  nomeValor: "o desvio",
  abaixo: "estoque abaixo do normal é aperto",
  acima: "estoque acima do normal é sobra",
  subindo: "o estoque está indo para cima do normal",
  caindo: "o estoque está indo para baixo do normal",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const EPISODIOS = [
  { data: "2016-04-29", rotulo: "Excesso de oferta depois da queda do petróleo de 2014-2016" },
  { data: "2020-06-26", rotulo: "Excesso na pandemia" },
  { data: "2022-06-24", rotulo: "Aperto depois da invasão da Ucrânia" },
  { data: "2024-06-28", rotulo: "Estoque um pouco abaixo do normal" }
];
const CENARIOS = [
  { valor: -14, valorAnterior: -9, rotulo: "Bem abaixo do normal e caindo" },
  { valor: -5, valorAnterior: -5.5, rotulo: "Abaixo do normal e parado" },
  { valor: 1, valorAnterior: -2, rotulo: "Perto do normal, voltando de baixo" },
  { valor: 6, valorAnterior: 9, rotulo: "Acima do normal e diminuindo" },
  { valor: 12, valorAnterior: 12.5, rotulo: "Bem acima do normal e parado" }
];

function explicarEstoques(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosEstoques(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, { campo: TEXTOS.campo, episodios: EPISODIOS, cenarios: CENARIOS });
}

// O que a tela genérica de cálculo desenha (ADR 0050): os quadros das camadas A e B da última semana, o gráfico das
// duas, o gráfico da medida com as faixas da C, os rótulos e os parâmetros.
const APRESENTACAO = {
  unidade: "mil barris",
  quadros: [
    { camada: "A", rotulo: "Estoque sem a SPR", campo: "estoque", casas: 0, sufixo: "mil barris" },
    { camada: "A", rotulo: "Contra a semana anterior", campo: "variacaoSemanal", casas: 0, sinal: true, sufixo: "mil barris" },
    { camada: "B", rotulo: "Média de 5 anos (mesma semana)", campo: "media5Anos", casas: 0, sufixo: "mil barris" },
    {
      camada: "B",
      rotulo: "Desvio contra a média",
      campo: "desvioPct",
      casas: 2,
      sinal: true,
      unidadeValor: "%",
      secundario: { campo: "desvio", casas: 0, sinal: true, sufixo: "mil barris" }
    },
    // Contexto (v2, ADR 0097): a mesma comparação nos outros estoques, fora da regra da camada C.
    ...[
      ["Cushing", "desvioCushingPct"],
      ["Gasolina", "desvioGasolinaPct"],
      ["Destilados", "desvioDestiladosPct"]
    ].map(([nome, campo]) => ({
      camada: "B",
      rotulo: `${nome} contra a média de 5 anos (contexto, fora da regra)`,
      campo,
      casas: 2,
      sinal: true,
      unidadeValor: "%"
    }))
  ],
  graficoAB: {
    titulo: "Estoque sem a SPR (A) × média da mesma semana nos 5 anos anteriores (B)",
    unidade: "mil barris",
    casas: 0,
    exigeCampo: "media5Anos",
    series: [
      { campo: "estoque", rotulo: "Estoque (A)" },
      { campo: "media5Anos", rotulo: "Média de 5 anos (B)" }
    ]
  },
  graficoC: { titulo: "Desvio (B) e as faixas da decisão (C)", campo: "desvioPct", rotulo: "Desvio (B)" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.PARAMETROS_FAIXA,
  exemplos: { colunaValor: "Desvio" },
  nota: "Semanal, não é tempo real: a EIA publica na quarta (quinta com feriado) a semana encerrada na sexta anterior."
};

// O que o service de metodologia precisa para calcular, explicar e mostrar o fator.
const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: ({ asOf, parametros }, deps) => calcularEstoquesPetroleoEia({ asOf, parametros }, deps),
  explicar: explicarEstoques,
  exemplos: exemplosEstoques,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIE_ESTOQUE,
  SERIES_CONTEXTO,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  decidirEstoques,
  explicarEstoques,
  exemplosEstoques,
  derivarEstoquesPetroleoEia,
  calcularEstoquesPetroleoEia
};
