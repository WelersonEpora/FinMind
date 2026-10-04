"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");

// FATOR (PROPOSTA, ADR 0056): demanda de etanol, fator "Demanda de etanol e milho para biocombustível" do FEL 1 para o
// milho, só a parte dos EUA (a EIA). A regra é a parte de baixa da R-ETA-02 v0 do David ("Motor do Milho", 2026-10-02):
// a moagem semanal 3% ou mais abaixo da média de 4 semanas. A regra de alta (R-ETA-01) e o resto da de baixa pedem a
// margem do etanol de milho e a moagem do Brasil (UNEM, ANP, Cepea), que não são coletadas. Camadas A e B calculadas,
// C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (observation), EIA, semanal (a sexta do fim da semana, publicada na quarta seguinte, ADR 0017):
//     EIA.ETANOL.PRODUCAO - a produção de etanol dos EUA, em mil barris por dia
//   fator (calculado sob demanda, NUNCA gravado):
//     A. producaoMilBarrisDia; a moagem implícita de milho = produção × 42 galões ÷ 2,8 galões por bushel (o rendimento
//        da proposta, "a validar"), em milhões de bushels por dia
//     B. desvio4SemanasPct = a produção contra a média das 4 semanas anteriores; anoAnteriorPct = contra a mesma semana
//        52 semanas antes (contexto, "moagem contra o mesmo período do ano anterior")
//     C. R-ETA-02 v0, a parte da EIA: desvio de -3% ou pior -> pressão de BAIXA (demanda de milho para etanol caindo).
//        Sem direção de alta (a regra de alta pede a margem). Acréscimos do FinMind: forte com a semana também 3% ou
//        mais abaixo do ano anterior (queda que não é só da semana); tendência pelo desvio de 4 semanas antes
//
// Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "etanol_milho_eia";
const FACTOR_VERSION = 1;

const SERIE_PRODUCAO = "EIA.ETANOL.PRODUCAO";
const GALOES_POR_BARRIL = 42;
const GALOES_POR_BUSHEL = 2.8;
const SEMANAS_MEDIA = 4;
const DIAS_SEMANA = 7;
const SEMANAS_ANO = 52;

// Do David (R-ETA-02 v0): 3% abaixo da média de 4 semanas. Do FinMind: a tendência (4 semanas, 3 p.p.). O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarQuedaPct: 3,
  semanasTendencia: 4,
  limiarTendenciaPp: 3
});

const ROTULOS_TENDENCIA = { SUBINDO: "Moagem acelerando", CAINDO: "Moagem desacelerando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f + 0;
}

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Camada C (função pura).
function decidirEtanol({ desvio4SemanasPct, anoAnteriorPct = null, desvioAnterior = null }, parametros = PARAMETROS_PADRAO) {
  if (desvio4SemanasPct === null || desvio4SemanasPct === undefined) return null;
  let tendencia = null;
  let mudancaPp = null;
  if (desvioAnterior !== null && desvioAnterior !== undefined) {
    mudancaPp = arredondar(desvio4SemanasPct - desvioAnterior, 2);
    if (Math.abs(mudancaPp) < parametros.limiarTendenciaPp) tendencia = faixa.TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.SUBINDO;
  }
  if (desvio4SemanasPct <= -parametros.limiarQuedaPct) {
    const forte = anoAnteriorPct !== null && anoAnteriorPct <= -parametros.limiarQuedaPct;
    return { direcao: faixa.DIRECAO.BAIXA, intensidade: forte ? faixa.INTENSIDADE.FORTE : faixa.INTENSIDADE.MODERADA, tendencia, mudancaPp };
  }
  return { direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, tendencia, mudancaPp };
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana.
function derivarEtanolMilho(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const producao = new Map();
  const disponivel = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode !== SERIE_PRODUCAO) continue;
    producao.set(linha.observedAt, linha.value);
    disponivel.set(linha.observedAt, { em: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
  }
  const desvios = new Map();
  const pontos = [];
  for (const observedAt of [...producao.keys()].sort()) {
    const valor = producao.get(observedAt);
    const anteriores = [];
    for (let k = 1; k <= SEMANAS_MEDIA; k += 1) {
      const v = producao.get(somarDias(observedAt, -DIAS_SEMANA * k));
      if (v !== undefined) anteriores.push(v);
    }
    const media = anteriores.length === SEMANAS_MEDIA ? anteriores.reduce((s, v) => s + v, 0) / SEMANAS_MEDIA : null;
    const desvio = media ? arredondar((valor / media - 1) * 100, 2) : null;
    desvios.set(observedAt, desvio);
    const anoAntes = producao.get(somarDias(observedAt, -DIAS_SEMANA * SEMANAS_ANO));
    const anoAnteriorPct = anoAntes ? arredondar((valor / anoAntes - 1) * 100, 2) : null;
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      producaoMilBarrisDia: valor,
      moagemMilhoesBuDia: arredondar((valor * 1000 * GALOES_POR_BARRIL) / GALOES_POR_BUSHEL / 1e6, 2),
      media4SemanasMilBarrisDia: media === null ? null : arredondar(media, 1),
      desvio4SemanasPct: desvio,
      anoAnteriorPct,
      decisao: decidirEtanol(
        { desvio4SemanasPct: desvio, anoAnteriorPct, desvioAnterior: desvios.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia)) ?? null },
        parametros
      ),
      disponivelEm: disponivel.get(observedAt).em,
      disponivelEmEhEstimado: disponivel.get(observedAt).estimado
    });
  }
  return pontos;
}

async function calcularEtanolMilho({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: [SERIE_PRODUCAO], asOf }, deps);
  return derivarEtanolMilho(linhas, { parametros });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

function explicarEtanol(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  const passos = [
    `Semana até ${ponto.observedAt.split("-").reverse().join("/")}: os EUA produziram ${faixa.fmt(ponto.producaoMilBarrisDia, 0)} mil barris ` +
      `de etanol por dia (~${faixa.fmt(ponto.moagemMilhoesBuDia, 2)} milhões de bushels de milho por dia) (A), ` +
      `${faixa.comSinal(ponto.desvio4SemanasPct)}% contra a média das 4 semanas anteriores (B).`
  ];
  const limiar = faixa.fmt(parametros.limiarQuedaPct, 1);
  if (d.direcao === faixa.DIRECAO.BAIXA) {
    passos.push(
      `Direção: ${limiar}% ou mais abaixo da média de 4 semanas: a demanda de milho para etanol está caindo → Pressão de baixa, ` +
        `${d.intensidade === faixa.INTENSIDADE.FORTE ? "forte (também abaixo da mesma semana do ano anterior)" : "moderada"}.`
    );
  } else {
    passos.push(`Direção: não está ${limiar}% ou mais abaixo da média de 4 semanas → Neutra.`);
  }
  passos.push("Sem direção de alta: a regra de alta do especialista pede a margem do etanol de milho, que não é coletada; o Brasil (UNEM, ANP) também fica de fora.");
  if (ponto.anoAnteriorPct !== null) passos.push(`Contexto: ${faixa.comSinal(ponto.anoAnteriorPct)}% contra a mesma semana do ano anterior.`);
  if (d.tendencia) passos.push(`Tendência: há ${parametros.semanasTendencia} semanas o desvio era ${faixa.comSinal(ponto.desvio4SemanasPct - d.mudancaPp)}% → ${ROTULOS_TENDENCIA[d.tendencia]}.`);
  return passos;
}

const EPISODIOS = [
  { data: "2020-04-24", rotulo: "Usinas paradas na pandemia" },
  { data: "2021-02-19", rotulo: "Frio extremo no Texas" },
  { data: "2024-12-27", rotulo: "Produção recorde no fim de 2024" }
];
const CENARIOS = [
  { rotulo: "Queda de 8% na semana, abaixo do ano anterior", desvio4SemanasPct: -8, anoAnteriorPct: -5 },
  { rotulo: "Queda de 4% na semana, acima do ano anterior", desvio4SemanasPct: -4, anoAnteriorPct: 2 },
  { rotulo: "Queda de 2% na semana", desvio4SemanasPct: -2, anoAnteriorPct: -1 },
  { rotulo: "Alta de 5% na semana", desvio4SemanasPct: 5, anoAnteriorPct: 4 }
];

function exemplosEtanol(pontosTodos, parametros = PARAMETROS_PADRAO) {
  const porData = new Map(pontosTodos.map((ponto) => [ponto.observedAt, ponto]));
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      const ponto = porData.get(data);
      return { data, rotulo, valor: ponto?.desvio4SemanasPct ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map(({ rotulo, ...entrada }) => ({ rotulo, valor: entrada.desvio4SemanasPct, valorAnterior: null, decisao: decidirEtanol(entrada, parametros) }))
  };
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    {
      camada: "A",
      rotulo: "Produção de etanol dos EUA",
      campo: "producaoMilBarrisDia",
      casas: 0,
      sufixo: "mil barris/dia"
    },
    { camada: "A", rotulo: "Moagem implícita de milho (2,8 galões por bushel)", campo: "moagemMilhoesBuDia", casas: 2, sufixo: "milhões de bushels/dia" },
    { camada: "B", rotulo: "Média das 4 semanas anteriores", campo: "media4SemanasMilBarrisDia", casas: 1, sufixo: "mil barris/dia" },
    { camada: "B", rotulo: "Desvio contra a média de 4 semanas", campo: "desvio4SemanasPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Contra a mesma semana do ano anterior (contexto)", campo: "anoAnteriorPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Produção de etanol dos EUA (A) × a média das 4 semanas anteriores (B), em mil barris por dia",
    unidade: "mil barris/dia",
    casas: 0,
    exigeCampo: "media4SemanasMilBarrisDia",
    series: [
      { campo: "producaoMilBarrisDia", rotulo: "Produção (A)" },
      { campo: "media4SemanasMilBarrisDia", rotulo: "Média de 4 semanas (B)" }
    ]
  },
  graficoC: {
    titulo: "Desvio contra a média de 4 semanas (B) e o limiar da regra (C)",
    campo: "desvio4SemanasPct",
    rotulo: "Desvio (B)",
    limiares: [{ chave: "limiarQuedaPct", sinal: -1, rotulo: "Limiar de baixa (queda)" }]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarQuedaPct", rotulo: "Limiar da queda", unidade: "%", explicacao: "Produção semanal esse tanto ou mais abaixo da média das 4 semanas anteriores pesa para baixa (R-ETA-02 v0: 3)." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: "semanas", explicacao: "Contra quantas semanas atrás o desvio é comparado para dizer se a moagem está acelerando ou desacelerando." },
    { chave: "limiarTendenciaPp", rotulo: "Mudança mínima da tendência", unidade: "p.p.", explicacao: "Quanto o desvio precisa mudar na janela para não ser considerado estável." }
  ],
  regra:
    "pressão de baixa com a produção semanal de etanol dos EUA {limiarQuedaPct}% ou mais abaixo da média das 4 semanas anteriores, forte com ela também {limiarQuedaPct}% ou mais abaixo da mesma semana do ano anterior; sem direção de alta (a regra de alta do especialista pede a margem do etanol de milho, que não é coletada); tendência pelo desvio de {semanasTendencia} semanas antes, mudança mínima de {limiarTendenciaPp} p.p.; só os EUA (o etanol de milho do Brasil não é coletado)",
  exemplos: { colunaValor: "Desvio" },
  nota:
    "Semanal, não é tempo real: a EIA publica a produção da semana (até sexta) na quarta seguinte, no Weekly Petroleum " +
    "Status Report. Só os EUA. A moagem implícita usa o rendimento de ~2,8 galões por bushel, a validar."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularEtanolMilho,
  explicar: explicarEtanol,
  exemplos: exemplosEtanol,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIE_PRODUCAO, PARAMETROS_PADRAO, METODOLOGIA, decidirEtanol, derivarEtanolMilho, calcularEtanolMilho };
