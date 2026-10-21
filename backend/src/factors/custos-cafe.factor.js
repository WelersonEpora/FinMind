"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const observationRepository = require("../repositories/observation.repository");
const { lerPtax: lerPtaxBase } = require("./base/ptax");
const faixa = require("./base/decisao-por-faixa");
const { sextaDaSemana } = require("./base/semana-de-dias");
const { arredondar, percentil } = require("./modelos/posicao-historica");
const { LIBRAS_POR_SACA_CENTAVOS } = require("./basis-icf-kc");

// FATOR (PROPOSTA, ADR 0060): custos de produção e margem, fator "Custo de produção e preço mínimo" do FEL 1 para o
// café, como o F5 do Motor do Café v1 (2026-10-04). Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR:
//   observáveis:
//     YAHOO.KC_CONTINUO.SETTLE (observation) - o café arábica de Nova York, 1º vencimento contínuo, US¢/lb (Yahoo, fonte
//       não oficial e provisória, ADR 0129)
//     USD_BRL venda (market_quote) - a PTAX de venda, para levar o preço a reais
//     CONAB.CAFE_CUSTO.ARABICA.<MUNICIPIO>.OPERACIONAL_SACA / TOTAL_SACA (observation) - o custo operacional e o total
//       por saca do arábica, por município de referência da Conab, R$/saca, por ano (ADR 0043)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por semana (o último pregão dela):
//     A. o KC em US$/saca e em R$/saca (pela PTAX do dia); a MEDIANA do custo operacional e do total entre os municípios
//        de arábica, no ano mais novo que a Conab tinha publicado (as "praças produtoras padrão" do estudo)
//     B. a margem do preço sobre o custo operacional e sobre o total, em %; o percentil da margem total nas 260
//        semanas anteriores (mínimo de 104), como contexto
//     C. a regra por faixa de margem (v3, PROPOSTA do FinMind para a sanção do Comitê, ADR 0138), calibrada no
//        histórico de 2004 a 2026 para o horizonte LONGO:
//          margem operacional no limiar ({limiarMargemPct}%) ou abaixo por {semanasSeguidas} semanas -> alta forte
//          margem total no limiar ou abaixo por {semanasSeguidas} semanas                         -> alta moderada
//          margem total de até {margemPertoPct}% (o preço perto do custo)                          -> alta fraca
//          margem total acima de {margemAltaPct}%                                                 -> baixa moderada
//        As duas primeiras são as regras candidatas do estudo, como na v1; as duas últimas trocam a margem no percentil
//        80 do próprio histórico (v1), cujo resultado se inverteu entre antes e depois de 2016. Uma faixa de baixa fraca
//        (de 150% a 200%) foi testada e descartada: depois dela, o KC subiu em 59% das semanas em 62 pregões.
//
// O preço é o KC de Nova York, não o ICF (v1 e v2): o ICF da base só começa em 2022, e a regra foi calibrada com o KC
// desde 2004 (o ICF dá uma margem cerca de 20 p.p. menor). A Conab não informa a publicação do custo: cada município e
// ano conta como conhecido 12 meses depois do mês dos preços da planilha (`mesReferenciaPrecos`; sem ele, dezembro do
// ano), ou na coleta, se for antes, uma data ESTIMADA por regra (ADR 0137). O fator vai ao prompt como INFORMAÇÃO, só no
// LONGO (metodologia-cafe.js), até o Comitê sancionar a regra. O estudo diz: o cafeicultor não deixa de colher com o
// preço baixo (cultura perene); o efeito é lento (1 a 3 safras), horizonte acima de 90 dias, e o custo de insumos
// importados não pode repetir o câmbio do F4. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "custos_cafe_conab_kc";
const FACTOR_VERSION = 3;

const SERIE_KC = "YAHOO.KC_CONTINUO.SETTLE";
const PREFIXO_CUSTO = "CONAB.CAFE_CUSTO.ARABICA";
const SEMANAS_JANELA = 260;
const SEMANAS_MINIMAS = 104;
// O 1º custo da Conab é de 2003; o KC e a PTAX desde então.
const INICIO = "2003-01-01";
// O custo conta como conhecido este número de meses depois do mês dos preços da Conab (ADR 0137).
const MESES_ATE_PUBLICAR = 12;

const PARAMETROS_PADRAO = Object.freeze({
  limiarMargemPct: 0,
  semanasSeguidas: 4,
  margemPertoPct: 15,
  margemAltaPct: 200,
  semanasTendencia: 4,
  limiarTendenciaPp: 10
});

const ROTULOS_TENDENCIA = { SUBINDO: "Margem melhorando", CAINDO: "Margem piorando", ESTAVEL: "Estável" };

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// Quando o custo de uma linha conta como conhecido (ADR 0137): o 1º dia do mês dos preços + 12 meses (sem o mês,
// dezembro do ano do custo), ou a publicação gravada (a coleta), se for antes. -> { disponivelEm (ISO), estimado }.
function disponibilidadeDoCusto(linha) {
  const gravada = new Date(linha.publishedAt).toISOString();
  const mes = linha.metadata?.mesReferenciaPrecos || `${String(linha.observedAt).slice(0, 4)}-12`;
  const [ano, m] = mes.split("-").map(Number);
  const total = ano * 12 + (m - 1) + MESES_ATE_PUBLICAR;
  const pelaRegra = new Date(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01T12:00:00-03:00`).toISOString();
  return pelaRegra < gravada ? { disponivelEm: pelaRegra, estimado: true } : { disponivelEm: gravada, estimado: Boolean(linha.publishedAtIsEstimated) };
}

// O custo mais novo que a Conab tinha publicado até `ate`: a mediana entre os municípios do ano mais novo.
function custoAte(linhasCusto, campo, ate) {
  const doCampo = linhasCusto.filter((l) => l.seriesCode.endsWith(`.${campo}`) && l.disponivelEm <= ate);
  if (doCampo.length === 0) return null;
  const ano = doCampo.map((l) => l.observedAt).sort().at(-1);
  const doAno = doCampo.filter((l) => l.observedAt === ano);
  return {
    ano: Number(ano.slice(0, 4)),
    valor: mediana(doAno.map((l) => l.value)),
    municipios: doAno.length,
    estimado: doAno.some((l) => l.estimado),
    // A data mais antiga em que o custo desse ano passou a contar (o 1º município).
    conhecidoDesde: doAno.map((l) => l.disponivelEm).sort()[0]
  };
}

// Camada C (função pura), a regra por faixa de margem (v3, ADR 0138). `seguidas`: quantas semanas seguidas, até esta, a
// margem operacional e a total ficaram no limiar ou abaixo.
function decidirCustos({ margemTotalPct, seguidasTotal, seguidasOperacional, margemAnterior }, parametros = PARAMETROS_PADRAO) {
  if (margemTotalPct === null || margemTotalPct === undefined) return null;
  let tendencia = null;
  let mudancaPp = null;
  if (margemAnterior !== null && margemAnterior !== undefined) {
    mudancaPp = arredondar(margemTotalPct - margemAnterior, 2);
    if (Math.abs(mudancaPp) < parametros.limiarTendenciaPp) tendencia = faixa.TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.SUBINDO;
  }
  const leitura = (direcao, intensidade) => ({ direcao, intensidade, tendencia, mudancaPp });
  const { ALTA, BAIXA, NEUTRA } = faixa.DIRECAO;
  const { FORTE, MODERADA, FRACA } = faixa.INTENSIDADE;
  if (seguidasOperacional >= parametros.semanasSeguidas) return leitura(ALTA, FORTE);
  if (seguidasTotal >= parametros.semanasSeguidas) return leitura(ALTA, MODERADA);
  if (margemTotalPct <= parametros.margemPertoPct) return leitura(ALTA, FRACA);
  if (margemTotalPct > parametros.margemAltaPct) return leitura(BAIXA, MODERADA);
  return leitura(NEUTRA, FRACA);
}

// Função PURA: o KC contínuo (obterAsOf), o custo (obterAsOf, com os metadados) e a PTAX ({ data, valor }) -> um ponto
// por semana (o último pregão do KC nela).
function derivarCustosCafe({ linhasKc, linhasCusto, ptax }, { parametros = PARAMETROS_PADRAO } = {}) {
  const custos = linhasCusto.map((l) => ({ ...l, observedAt: String(l.observedAt).slice(0, 10), ...disponibilidadeDoCusto(l) }));
  const ptaxOrdenada = [...ptax].sort((a, b) => (a.data < b.data ? -1 : 1));

  const porSemana = new Map();
  for (const l of [...linhasKc].sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1))) {
    const dia = String(l.observedAt).slice(0, 10);
    porSemana.set(sextaDaSemana(dia), { dia, valor: l.value, publishedAt: l.publishedAt, estimado: l.publishedAtIsEstimated });
  }

  const margens = [];
  const pontos = [];
  let seguidasTotal = 0;
  let seguidasOperacional = 0;
  let p = -1;
  for (const sexta of [...porSemana.keys()].sort()) {
    const s = porSemana.get(sexta);
    // A PTAX do dia, ou a do último dia útil antes dele.
    while (p + 1 < ptaxOrdenada.length && ptaxOrdenada[p + 1].data <= s.dia) p += 1;
    const dolar = p >= 0 ? ptaxOrdenada[p].valor : null;
    const disponivelEm = new Date(s.publishedAt).toISOString();
    const operacional = custoAte(custos, "OPERACIONAL_SACA", disponivelEm);
    const total = custoAte(custos, "TOTAL_SACA", disponivelEm);
    const precoUsd = s.valor * LIBRAS_POR_SACA_CENTAVOS;
    const precoBrl = dolar ? precoUsd * dolar : null;
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
      kc: s.valor,
      precoUsd: arredondar(precoUsd, 2),
      dolar,
      precoBrl: precoBrl === null ? null : arredondar(precoBrl, 2),
      anoCusto: total?.ano ?? null,
      custoOperacionalSaca: operacional ? arredondar(operacional.valor, 2) : null,
      custoTotalSaca: total ? arredondar(total.valor, 2) : null,
      municipiosCusto: total?.municipios ?? null,
      custoConhecidoDesde: total ? total.conhecidoDesde.slice(0, 10) : null,
      custoEstimado: total ? total.estimado : null,
      margemOperacionalPct,
      margemTotalPct,
      percentilMargem: historico.length >= SEMANAS_MINIMAS && margemTotalPct !== null ? arredondar(percentil(margemTotalPct, historico), 1) : null,
      decisao: decidirCustos({ margemTotalPct, seguidasTotal, seguidasOperacional, margemAnterior }, parametros),
      disponivelEm,
      disponivelEmEhEstimado: Boolean(s.estimado) || Boolean(total?.estimado)
    });
  }
  return pontos;
}

async function calcularCustosCafe({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const repo = deps.observationRepository || observationRepository;
  const municipios = await repo.listarItens({ prefixoSerie: PREFIXO_CUSTO, campoReferencia: "TOTAL_SACA" });
  const seriesCusto = municipios.flatMap((m) => [`${PREFIXO_CUSTO}.${m.codigo}.OPERACIONAL_SACA`, `${PREFIXO_CUSTO}.${m.codigo}.TOTAL_SACA`]);
  const [linhasKc, linhasCusto, ptax] = await Promise.all([
    servico.obterAsOf({ seriesCodes: [SERIE_KC], asOf, observadoDesde: INICIO }, deps),
    // Com os metadados: o mês dos preços dá a data estimada do custo (ADR 0137).
    seriesCusto.length ? servico.obterAsOf({ seriesCodes: seriesCusto, asOf, comMetadata: true }, deps) : [],
    lerPtaxBase({ desde: INICIO, asOf }, deps)
  ]);
  if (linhasKc.length === 0) return [];
  return derivarCustosCafe({ linhasKc, linhasCusto, ptax }, { parametros });
}

function explicarCustos(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  const passos = [
    `O café de Nova York (KC) fechou a semana em ${faixa.fmt(ponto.kc)} US¢/lb, US$ ${faixa.fmt(ponto.precoUsd)}/saca; pela PTAX de ` +
      `R$ ${faixa.fmt(ponto.dolar, 4)}, R$ ${faixa.fmt(ponto.precoBrl)}/saca (A).`,
    `O custo de ${ponto.anoCusto} conta como conhecido desde ${ponto.custoConhecidoDesde.split("-").reverse().join("/")}` +
      `${ponto.custoEstimado ? " (data estimada: 12 meses depois do mês dos preços da Conab, ADR 0137)" : ""}.`,
    `O custo do arábica na Conab (${ponto.anoCusto}, mediana de ${ponto.municipiosCusto} municípios): operacional de ` +
      `R$ ${faixa.fmt(ponto.custoOperacionalSaca)} e total de R$ ${faixa.fmt(ponto.custoTotalSaca)} por saca. Margem de ` +
      `${faixa.comSinal(ponto.margemOperacionalPct)}% sobre o operacional e ${faixa.comSinal(ponto.margemTotalPct)}% sobre o total (B).`
  ];
  const limiar = `${faixa.fmt(parametros.limiarMargemPct, 1)}%`;
  const total = `${faixa.comSinal(ponto.margemTotalPct)}%`;
  if (d.direcao === faixa.DIRECAO.ALTA && d.intensidade !== faixa.INTENSIDADE.FRACA) {
    const custo = d.intensidade === faixa.INTENSIDADE.FORTE ? "operacional" : "total";
    passos.push(`Direção: a margem sobre o custo ${custo} está em ${limiar} ou abaixo há ${parametros.semanasSeguidas} semanas ou mais: margem comprimida, menos trato da lavoura e safras menores depois → Pressão de alta.`);
  } else if (d.direcao === faixa.DIRECAO.ALTA) {
    passos.push(`Direção: a margem total (${total}) está em ${faixa.fmt(parametros.margemPertoPct, 0)}% ou menos: o preço está perto do custo, um piso para os meses seguintes → Pressão de alta, fraca.`);
  } else if (d.direcao === faixa.DIRECAO.BAIXA) {
    passos.push(
      `Direção: a margem total (${total}) está acima de ${faixa.fmt(parametros.margemAltaPct, 0)}%: margem muito alta estimula ` +
        "trato e produtividade nas safras seguintes → Pressão de baixa, moderada."
    );
  } else {
    passos.push(`Direção: a margem total (${total}) está entre ${faixa.fmt(parametros.margemPertoPct, 0)}% e ${faixa.fmt(parametros.margemAltaPct, 0)}%, sem o preço abaixo do custo por ${parametros.semanasSeguidas} semanas → Neutra.`);
  }
  if (d.tendencia === null) passos.push(`Tendência: sem a margem de ${parametros.semanasTendencia} semanas antes, não calculada.`);
  else passos.push(`Tendência: a margem total mudou ${faixa.comSinal(d.mudancaPp)} p.p. em ${parametros.semanasTendencia} semanas → ${ROTULOS_TENDENCIA[d.tendencia]}.`);
  return passos;
}

// Os episódios do teste do ADR 0138 (uma semana de cada).
const EPISODIOS = [
  { data: "2013-11-15", rotulo: "Crise de margem de 2013: o preço abaixo do custo" },
  { data: "2019-05-17", rotulo: "Margem fina de 2019" },
  { data: "2022-02-11", rotulo: "Margem muito alta de 2021-22" },
  { data: "2025-02-14", rotulo: "Margem muito alta de 2024-25" }
];

const CENARIOS = [
  { rotulo: "Preço abaixo do custo operacional há 4 semanas", entrada: { margemTotalPct: -20, seguidasTotal: 4, seguidasOperacional: 4 } },
  { rotulo: "Preço abaixo do custo total há 4 semanas, acima do operacional", entrada: { margemTotalPct: -5, seguidasTotal: 4, seguidasOperacional: 0 } },
  { rotulo: "Preço 10% acima do custo total", entrada: { margemTotalPct: 10, seguidasTotal: 0, seguidasOperacional: 0 } },
  { rotulo: "Margem confortável (80%)", entrada: { margemTotalPct: 80, seguidasTotal: 0, seguidasOperacional: 0 } },
  { rotulo: "Margem de 170% (alta, mas abaixo do limiar)", entrada: { margemTotalPct: 170, seguidasTotal: 0, seguidasOperacional: 0 } },
  { rotulo: "Margem de 230%", entrada: { margemTotalPct: 230, seguidasTotal: 0, seguidasOperacional: 0 } }
];

function exemplosCustos(pontosTodos, parametros = PARAMETROS_PADRAO) {
  const porData = new Map(pontosTodos.map((ponto) => [ponto.observedAt, ponto]));
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      const ponto = porData.get(data);
      return { data, rotulo, valor: ponto?.margemTotalPct ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map(({ rotulo, entrada }) => ({ rotulo, valor: entrada.margemTotalPct, valorAnterior: null, decisao: decidirCustos(entrada, parametros) }))
  };
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "Café de Nova York (KC), 1º vencimento", campo: "kc", casas: 2, sufixo: "US¢/lb" },
    { camada: "A", rotulo: "KC em reais (pela PTAX)", campo: "precoBrl", casas: 2, sufixo: "R$/saca" },
    { camada: "A", rotulo: "Custo operacional do arábica (Conab, mediana)", campo: "custoOperacionalSaca", casas: 2, sufixo: "R$/saca" },
    { camada: "A", rotulo: "Custo total do arábica (Conab, mediana)", campo: "custoTotalSaca", casas: 2, secundario: { prefixo: "R$/saca, ano", campo: "anoCusto", agrupar: false } },
    { camada: "B", rotulo: "Margem sobre o custo operacional", campo: "margemOperacionalPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Margem sobre o custo total", campo: "margemTotalPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Percentil da margem total (5 anos, contexto)", campo: "percentilMargem", casas: 1 }
  ],
  graficoAB: {
    titulo: "KC em reais (A) × o custo operacional e o total do arábica (A), em R$/saca",
    unidade: "R$/saca",
    casas: 2,
    exigeCampo: "custoTotalSaca",
    series: [
      { campo: "precoBrl", rotulo: "KC em reais (A)" },
      { campo: "custoTotalSaca", rotulo: "Custo total (A)" },
      { campo: "custoOperacionalSaca", rotulo: "Custo operacional (A)" }
    ]
  },
  graficoC: {
    titulo: "Margem sobre o custo total (B) e as faixas da regra (C)",
    campo: "margemTotalPct",
    rotulo: "Margem (B)",
    limiares: [
      { chave: "margemAltaPct", sinal: 1, rotulo: "Baixa moderada acima dele" },
      { chave: "margemPertoPct", sinal: 1, rotulo: "Alta fraca abaixo dele" },
      { chave: "limiarMargemPct", sinal: 1, rotulo: "Limiar da margem (alta moderada ou forte abaixo dele, por semanas seguidas)" }
    ]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarMargemPct", rotulo: "Limiar da margem", unidade: "%", explicacao: "Margem igual ou abaixo deste valor, por semanas seguidas, pesa para alta: moderada sobre o custo total, forte sobre o operacional (0: o preço no custo)." },
    { chave: "semanasSeguidas", rotulo: "Período prolongado", unidade: "semanas", explicacao: "Quantas semanas seguidas a margem precisa ficar no limiar ou abaixo para pesar para alta (o \"período prolongado\" do estudo)." },
    { chave: "margemPertoPct", rotulo: "Preço perto do custo", unidade: "%", explicacao: "Margem total igual ou abaixo deste valor pesa para alta, fraca: o preço perto do piso (proposta, ADR 0138: 15)." },
    { chave: "margemAltaPct", rotulo: "Margem muito alta", unidade: "%", explicacao: "Margem total acima deste valor pesa para baixa, moderada (proposta, ADR 0138: 200)." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: "semanas", explicacao: "Contra quantas semanas atrás a margem é comparada para dizer se está melhorando ou piorando." },
    { chave: "limiarTendenciaPp", rotulo: "Mudança mínima da tendência", unidade: "p.p.", explicacao: "Quanto a margem precisa mudar na janela para não ser considerada estável." }
  ],
  regra:
    "proposta do FinMind, aguardando a sanção do Comitê (ADR 0138): pressão de alta com a margem do KC (em reais) sobre o custo do arábica da Conab em {limiarMargemPct}% ou menos por {semanasSeguidas} semanas seguidas (moderada sobre o custo total, forte sobre o operacional) e, fraca, com a margem total de até {margemPertoPct}%; de baixa, moderada, com a margem total acima de {margemAltaPct}%; tendência pela margem de {semanasTendencia} semanas antes, mudança mínima de {limiarTendenciaPp} p.p.; fator lento, só no horizonte LONGO",
  exemplos: { colunaValor: "Margem" },
  nota:
    "Semanal (o último pregão da semana), não é tempo real. O preço é o KC de Nova York (Yahoo, fonte não oficial) em " +
    "reais pela PTAX, sem o diferencial do físico. A Conab não informa a publicação do custo: cada ano conta como " +
    "conhecido 12 meses depois do mês dos preços da planilha (data estimada, ADR 0137). Fator lento: age nas safras seguintes."
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

module.exports = { FACTOR_ID, FACTOR_VERSION, PARAMETROS_PADRAO, METODOLOGIA, decidirCustos, derivarCustosCafe };
