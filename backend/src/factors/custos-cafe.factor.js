"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const observationRepository = require("../repositories/observation.repository");
const marketQuoteRepository = require("../repositories/market-quote.repository");
const faixa = require("./base/decisao-por-faixa");
const { sextaDaSemana } = require("./base/semana-de-dias");
const { arredondar, percentil } = require("./modelos/posicao-historica");

// FATOR (PROPOSTA, ADR 0060): custos de produção e margem, fator "Custo de produção e preço mínimo" do FEL 1 para o
// café, como o F5 do Motor do Café v1 (2026-10-04). Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR:
//   observáveis:
//     B3.ICF.<VENCIMENTO>.SETTLE (observation) - o ajuste do futuro de café arábica da B3, US$/saca (ADR 0028)
//     USD_BRL venda (market_quote) - a PTAX de venda, para levar o preço a reais
//     CONAB.CAFE_CUSTO.ARABICA.<MUNICIPIO>.OPERACIONAL_SACA / TOTAL_SACA (observation) - o custo operacional e o total
//       por saca do arábica, por município de referência da Conab, R$/saca, por ano (ADR 0043)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por semana (o último pregão dela):
//     A. o ICF no vencimento mais próximo negociado (sem emendar contratos), em US$/saca e em R$/saca (pela PTAX do
//        dia); a MEDIANA do custo operacional e do total entre os municípios de arábica, no ano mais novo que a Conab
//        tinha publicado (as "praças produtoras padrão" do estudo)
//     B. a margem do preço sobre o custo operacional e sobre o total, em %; o percentil da margem total nas 260
//        semanas anteriores (mínimo de 104)
//     C. as regras candidatas do estudo: preço abaixo do custo operacional "por período prolongado" pesa para ALTA
//        (margem comprimida, menos adubação e safras menores depois); margem em nível historicamente alto, para BAIXA.
//        Calibração do FinMind: o "prolongado" = {semanasSeguidas} semanas seguidas com a margem no limiar ou abaixo
//        (moderada sobre o custo total, forte sobre o operacional); o "historicamente alto" = margem total no percentil
//        {percentilBaixa} ou acima do próprio histórico
//
// O custo da Conab só é conhecido na base desde a 1ª coleta (2026-10-01; a fonte não informa a publicação): antes, o
// fator não tem dado (point-in-time), e a regra de baixa só decide com 2 anos de margem. O estudo diz: o cafeicultor não
// deixa de colher com o preço baixo (cultura perene); o efeito é lento (1 a 3 safras), horizonte acima de 90 dias, e o
// custo de insumos importados não pode repetir o câmbio do F4. Propriedades: determinístico, versionado, point-in-time,
// sem IA.

const FACTOR_ID = "custos_cafe_conab_icf";
const FACTOR_VERSION = 1;

const PREFIXO_ICF = "B3.ICF";
const PREFIXO_CUSTO = "CONAB.CAFE_CUSTO.ARABICA";
const SEMANAS_JANELA = 260;
const SEMANAS_MINIMAS = 104;
const INICIO_PTAX = "2021-01-01";

const PARAMETROS_PADRAO = Object.freeze({
  limiarMargemPct: 0,
  semanasSeguidas: 4,
  percentilBaixa: 80,
  semanasTendencia: 4,
  limiarTendenciaPp: 10
});

const ROTULOS_TENDENCIA = { SUBINDO: "Margem melhorando", CAINDO: "Margem piorando", ESTAVEL: "Estável" };
const LETRAS = "FGHJKMNQUVXZ";

// "ICFZ26" -> "2026-12": a ordem dos vencimentos.
function vencimento(codigo) {
  const letra = codigo.at(-3);
  const mes = LETRAS.indexOf(letra) + 1;
  return `20${codigo.slice(-2)}-${String(mes).padStart(2, "0")}`;
}

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// O custo mais novo que a Conab tinha publicado até `ate`: a mediana entre os municípios do ano mais novo.
function custoAte(linhasCusto, campo, ate) {
  const doCampo = linhasCusto.filter((l) => l.seriesCode.endsWith(`.${campo}`) && l.disponivelEm <= ate);
  if (doCampo.length === 0) return null;
  const ano = doCampo.map((l) => l.observedAt).sort().at(-1);
  return { ano: Number(ano.slice(0, 4)), valor: mediana(doCampo.filter((l) => l.observedAt === ano).map((l) => l.value)), municipios: doCampo.filter((l) => l.observedAt === ano).length };
}

// Camada C (função pura). `historico`: as margens totais das semanas anteriores (para o percentil); `seguidas`: quantas
// semanas seguidas, até esta, a margem operacional e a total ficaram no limiar ou abaixo.
function decidirCustos({ margemTotalPct, seguidasTotal, seguidasOperacional, historico, margemAnterior }, parametros = PARAMETROS_PADRAO) {
  if (margemTotalPct === null || margemTotalPct === undefined) return null;
  let tendencia = null;
  let mudancaPp = null;
  if (margemAnterior !== null && margemAnterior !== undefined) {
    mudancaPp = arredondar(margemTotalPct - margemAnterior, 2);
    if (Math.abs(mudancaPp) < parametros.limiarTendenciaPp) tendencia = faixa.TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.SUBINDO;
  }
  if (seguidasOperacional >= parametros.semanasSeguidas) return { direcao: faixa.DIRECAO.ALTA, intensidade: faixa.INTENSIDADE.FORTE, tendencia, mudancaPp };
  if (seguidasTotal >= parametros.semanasSeguidas) return { direcao: faixa.DIRECAO.ALTA, intensidade: faixa.INTENSIDADE.MODERADA, tendencia, mudancaPp };
  if (historico.length >= SEMANAS_MINIMAS && percentil(margemTotalPct, historico) >= parametros.percentilBaixa) {
    return { direcao: faixa.DIRECAO.BAIXA, intensidade: faixa.INTENSIDADE.MODERADA, tendencia, mudancaPp };
  }
  return { direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, tendencia, mudancaPp };
}

// Função PURA: os ajustes do ICF (obterAsOf), o custo (obterAsOf) e a PTAX ({ data, valor }) -> um ponto por semana.
function derivarCustosCafe({ linhasIcf, linhasCusto, ptax }, { parametros = PARAMETROS_PADRAO } = {}) {
  const custos = linhasCusto.map((l) => ({ ...l, disponivelEm: new Date(l.publishedAt).toISOString() }));
  const ptaxPorDia = new Map(ptax.map((p) => [p.data, p.valor]));
  const diasPtax = ptax.map((p) => p.data).sort();
  const ptaxAte = (dia) => {
    if (ptaxPorDia.has(dia)) return ptaxPorDia.get(dia);
    const anterior = diasPtax.filter((d) => d <= dia).at(-1);
    return anterior ? ptaxPorDia.get(anterior) : null;
  };

  // O vencimento mais próximo negociado em cada dia.
  const porDia = new Map();
  for (const l of linhasIcf) {
    const codigo = l.seriesCode.split(".")[2];
    const atual = porDia.get(l.observedAt);
    if (!atual || vencimento(codigo) < vencimento(atual.codigo)) porDia.set(l.observedAt, { codigo, valor: l.value, publishedAt: l.publishedAt, estimado: l.publishedAtIsEstimated });
  }
  const porSemana = new Map();
  for (const dia of [...porDia.keys()].sort()) porSemana.set(sextaDaSemana(dia), { dia, ...porDia.get(dia) });

  const margens = [];
  const pontos = [];
  let seguidasTotal = 0;
  let seguidasOperacional = 0;
  for (const sexta of [...porSemana.keys()].sort()) {
    const s = porSemana.get(sexta);
    const disponivelEm = new Date(s.publishedAt).toISOString();
    const dolar = ptaxAte(s.dia);
    const operacional = custoAte(custos, "OPERACIONAL_SACA", disponivelEm);
    const total = custoAte(custos, "TOTAL_SACA", disponivelEm);
    const precoBrl = dolar ? s.valor * dolar : null;
    const margemOperacionalPct = precoBrl && operacional?.valor ? arredondar((precoBrl / operacional.valor - 1) * 100, 2) : null;
    const margemTotalPct = precoBrl && total?.valor ? arredondar((precoBrl / total.valor - 1) * 100, 2) : null;
    seguidasTotal = margemTotalPct !== null && margemTotalPct <= parametros.limiarMargemPct ? seguidasTotal + 1 : 0;
    seguidasOperacional = margemOperacionalPct !== null && margemOperacionalPct <= parametros.limiarMargemPct ? seguidasOperacional + 1 : 0;
    const historico = margens.filter((m) => m !== null).slice(-SEMANAS_JANELA);
    const margemAnterior = margens.length >= parametros.semanasTendencia ? margens.at(-parametros.semanasTendencia) : null;
    margens.push(margemTotalPct);
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: sexta,
      ultimoPregao: s.dia,
      vencimento: s.codigo,
      precoUsd: s.valor,
      dolar,
      precoBrl: precoBrl === null ? null : arredondar(precoBrl, 2),
      anoCusto: total?.ano ?? null,
      custoOperacionalSaca: operacional ? arredondar(operacional.valor, 2) : null,
      custoTotalSaca: total ? arredondar(total.valor, 2) : null,
      municipiosCusto: total?.municipios ?? null,
      margemOperacionalPct,
      margemTotalPct,
      percentilMargem: historico.length >= SEMANAS_MINIMAS && margemTotalPct !== null ? arredondar(percentil(margemTotalPct, historico), 1) : null,
      decisao: decidirCustos({ margemTotalPct, seguidasTotal, seguidasOperacional, historico, margemAnterior }, parametros),
      disponivelEm: total && total.disponivelEm > disponivelEm ? total.disponivelEm : disponivelEm,
      disponivelEmEhEstimado: Boolean(s.estimado)
    });
  }
  return pontos;
}

async function lerPtax(asOf, deps = {}) {
  const repo = deps.marketQuoteRepository || marketQuoteRepository;
  const { registros } = await repo.buscarHistorico({
    instrumentCode: "USD_BRL",
    modality: "venda",
    dataInicio: INICIO_PTAX,
    dataFim: asOf.toISOString().slice(0, 10),
    pagina: 1,
    tamanhoPagina: 100000,
    ordem: "ASC"
  });
  return registros.map((r) => ({ data: String(r.reference_date).slice(0, 10), valor: Number(r.value) }));
}

async function calcularCustosCafe({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const repo = deps.observationRepository || observationRepository;
  const [contratos, municipios] = await Promise.all([
    repo.listarItens({ prefixoSerie: PREFIXO_ICF, campoReferencia: "SETTLE" }),
    repo.listarItens({ prefixoSerie: PREFIXO_CUSTO, campoReferencia: "TOTAL_SACA" })
  ]);
  if (contratos.length === 0) return [];
  const seriesCusto = municipios.flatMap((m) => [`${PREFIXO_CUSTO}.${m.codigo}.OPERACIONAL_SACA`, `${PREFIXO_CUSTO}.${m.codigo}.TOTAL_SACA`]);
  const [linhasIcf, linhasCusto, ptax] = await Promise.all([
    servico.obterAsOf({ seriesCodes: contratos.map((c) => `${PREFIXO_ICF}.${c.codigo}.SETTLE`), asOf }, deps),
    seriesCusto.length ? servico.obterAsOf({ seriesCodes: seriesCusto, asOf }, deps) : [],
    lerPtax(asOf, deps)
  ]);
  return derivarCustosCafe({ linhasIcf, linhasCusto, ptax }, { parametros });
}

function explicarCustos(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  const passos = [
    `O ICF (${ponto.vencimento}) fechou a semana em US$ ${faixa.fmt(ponto.precoUsd)}/saca; pela PTAX de R$ ${faixa.fmt(ponto.dolar, 4)}, ` +
      `R$ ${faixa.fmt(ponto.precoBrl)}/saca (A).`,
    `O custo do arábica na Conab (${ponto.anoCusto}, mediana de ${ponto.municipiosCusto} municípios): operacional de ` +
      `R$ ${faixa.fmt(ponto.custoOperacionalSaca)} e total de R$ ${faixa.fmt(ponto.custoTotalSaca)} por saca. Margem de ` +
      `${faixa.comSinal(ponto.margemOperacionalPct)}% sobre o operacional e ${faixa.comSinal(ponto.margemTotalPct)}% sobre o total (B).`
  ];
  const limiar = `${faixa.fmt(parametros.limiarMargemPct, 1)}%`;
  if (d.direcao === faixa.DIRECAO.ALTA) {
    const custo = d.intensidade === faixa.INTENSIDADE.FORTE ? "operacional" : "total";
    passos.push(`Direção: a margem sobre o custo ${custo} está em ${limiar} ou abaixo há ${parametros.semanasSeguidas} semanas ou mais: margem comprimida, menos trato da lavoura e safras menores depois → Pressão de alta.`);
  } else if (d.direcao === faixa.DIRECAO.BAIXA) {
    passos.push(`Direção: a margem total está no percentil ${faixa.fmt(ponto.percentilMargem, 1)} do histórico, no ${parametros.percentilBaixa} ou acima: margem alta estimula trato e produtividade nas safras seguintes → Pressão de baixa.`);
  } else {
    const baixa = ponto.percentilMargem === null ? "sem 2 anos de margem, a regra de baixa ainda não decide" : `percentil ${faixa.fmt(ponto.percentilMargem, 1)}, abaixo do ${parametros.percentilBaixa}`;
    passos.push(`Direção: a margem não está no limiar de ${limiar} por ${parametros.semanasSeguidas} semanas seguidas, e ${baixa} → Neutra.`);
  }
  if (d.tendencia === null) passos.push(`Tendência: sem a margem de ${parametros.semanasTendencia} semanas antes, não calculada.`);
  else passos.push(`Tendência: a margem total mudou ${faixa.comSinal(d.mudancaPp)} p.p. em ${parametros.semanasTendencia} semanas → ${ROTULOS_TENDENCIA[d.tendencia]}.`);
  return passos;
}

const CENARIOS = [
  { rotulo: "Preço abaixo do custo operacional há 4 semanas", entrada: { margemTotalPct: -20, seguidasTotal: 4, seguidasOperacional: 4, historico: [] } },
  { rotulo: "Preço abaixo do custo total há 4 semanas, acima do operacional", entrada: { margemTotalPct: -5, seguidasTotal: 4, seguidasOperacional: 0, historico: [] } },
  { rotulo: "Preço abaixo do custo há só 2 semanas", entrada: { margemTotalPct: -5, seguidasTotal: 2, seguidasOperacional: 2, historico: [] } },
  { rotulo: "Margem confortável, sem 2 anos de histórico", entrada: { margemTotalPct: 120, seguidasTotal: 0, seguidasOperacional: 0, historico: [] } }
];

function exemplosCustos(_pontosTodos, parametros = PARAMETROS_PADRAO) {
  // Sem episódios: o custo só é conhecido (point-in-time) a partir da 1ª coleta, em 2026-10-01.
  return {
    episodios: [],
    cenarios: CENARIOS.map(({ rotulo, entrada }) => ({ rotulo, valor: entrada.margemTotalPct, valorAnterior: null, decisao: decidirCustos(entrada, parametros) }))
  };
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "ICF, vencimento mais próximo", campo: "precoUsd", casas: 2, sufixo: "US$/saca" },
    { camada: "A", rotulo: "ICF em reais (pela PTAX)", campo: "precoBrl", casas: 2, sufixo: "R$/saca" },
    { camada: "A", rotulo: "Custo operacional do arábica (Conab, mediana)", campo: "custoOperacionalSaca", casas: 2, sufixo: "R$/saca" },
    { camada: "A", rotulo: "Custo total do arábica (Conab, mediana)", campo: "custoTotalSaca", casas: 2, secundario: { prefixo: "R$/saca, ano", campo: "anoCusto", agrupar: false } },
    { camada: "B", rotulo: "Margem sobre o custo operacional", campo: "margemOperacionalPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Margem sobre o custo total", campo: "margemTotalPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Percentil da margem total (5 anos)", campo: "percentilMargem", casas: 1 }
  ],
  graficoAB: {
    titulo: "ICF em reais (A) × o custo operacional e o total do arábica (A), em R$/saca",
    unidade: "R$/saca",
    casas: 2,
    exigeCampo: "custoTotalSaca",
    series: [
      { campo: "precoBrl", rotulo: "ICF em reais (A)" },
      { campo: "custoTotalSaca", rotulo: "Custo total (A)" },
      { campo: "custoOperacionalSaca", rotulo: "Custo operacional (A)" }
    ]
  },
  graficoC: {
    titulo: "Margem sobre o custo total (B) e o limiar da regra (C)",
    campo: "margemTotalPct",
    rotulo: "Margem (B)",
    limiares: [{ chave: "limiarMargemPct", sinal: 1, rotulo: "Limiar da margem (alta abaixo dele)" }]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarMargemPct", rotulo: "Limiar da margem", unidade: "%", explicacao: "Margem igual ou abaixo deste valor conta para a regra de alta (0: o preço no custo)." },
    { chave: "semanasSeguidas", rotulo: "Período prolongado", unidade: "semanas", explicacao: "Quantas semanas seguidas a margem precisa ficar no limiar ou abaixo para pesar para alta (o \"período prolongado\" do estudo)." },
    { chave: "percentilBaixa", rotulo: "Margem historicamente alta", unidade: "percentil", explicacao: "A margem total neste percentil do histórico, ou acima, pesa para baixa (com 2 anos de histórico ou mais)." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: "semanas", explicacao: "Contra quantas semanas atrás a margem é comparada para dizer se está melhorando ou piorando." },
    { chave: "limiarTendenciaPp", rotulo: "Mudança mínima da tendência", unidade: "p.p.", explicacao: "Quanto a margem precisa mudar na janela para não ser considerada estável." }
  ],
  regra:
    "pressão de alta com a margem do ICF (em reais) sobre o custo do arábica da Conab em {limiarMargemPct}% ou menos por {semanasSeguidas} semanas seguidas (moderada sobre o custo total, forte sobre o operacional); de baixa com a margem total no percentil {percentilBaixa} ou acima do histórico (com 2 anos ou mais); tendência pela margem de {semanasTendencia} semanas antes, mudança mínima de {limiarTendenciaPp} p.p.; fator lento, horizonte acima de 90 dias",
  exemplos: { colunaValor: "Margem" },
  nota:
    "Semanal (o último pregão da semana), não é tempo real. O custo do arábica da Conab é conhecido na base desde a 1ª " +
    "coleta, em 2026-10-01: antes, o fator não tem dado (point-in-time). Fator lento: age nas safras seguintes."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularCustosCafe,
  explicar: explicarCustos,
  exemplos: exemplosCustos,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, PARAMETROS_PADRAO, METODOLOGIA, vencimento, decidirCustos, derivarCustosCafe };
