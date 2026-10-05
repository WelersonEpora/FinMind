"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const { lerPtax: lerPtaxBase } = require("./base/ptax");
const faixa = require("./base/decisao-por-faixa");

// FATOR (PROPOSTA, ADR 0056): dólar e paridade de exportação, fator "Dólar (USDBRL) e paridade de exportação" do FEL 1
// para o milho. As regras são a R-CAM-01 v0 e a R-CAM-02 v0 do David ("Motor do Milho", 2026-10-02), com a paridade
// pronta do IMEA que ele escolheu na pergunta 16 (ADRs 0055 e 0057). Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis:
//     IMEA.MILHO.PARIDADE_EXPORTACAO - a paridade de exportação de MT (R$/saca), diária, publicada toda segunda com os
//       dias da semana anterior (observation; o contrato de referência vem na metadata)
//     USD_BRL venda - a PTAX de venda (market_quote; sai à tarde do próprio dia)
//     B3.MILHO_ESALQ.AVISTA_BRL - o Indicador CEPEA/ESALQ (Campinas), o preço interno da regra (observation)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por semana, no último dia com paridade:
//     A. a paridade, a PTAX e o Indicador ESALQ do dia
//     B. a variação da paridade em 10 pregões (os dias com paridade); a do dólar nos mesmos 10 pregões; a parte do
//        câmbio = a variação do dólar ÷ a da paridade (aproximação do FinMind, ver abaixo); a base = ESALQ − paridade
//     C. R-CAM-01 v0: paridade subindo 3% ou mais em 10 pregões, com 50% ou mais da alta vinda do câmbio, e o preço
//        interno abaixo dela (base negativa) → ALTA. R-CAM-02 v0: paridade caindo 3% ou mais e o preço interno acima
//        dela (base positiva) → BAIXA. Acréscimos do FinMind: forte com a variação de 6% ou mais; sem decisão quando
//        os 10 pregões cruzam a troca do contrato de referência ou quando a variação é de 30% ou mais (quebra da
//        série, ver abaixo); tendência pela variação de 2 semanas antes.
//        A base da regra (v2, ADR 0072, decisão do usuário): a praça é Campinas (onde o CCM liquida); como a paridade é
//        de MT, a base (ESALQ − paridade) carrega o frete entre as duas e é quase sempre positiva. "Preço interno abaixo
//        da paridade" passa a ser a base ABAIXO DA MEDIANA DELA nas 52 semanas anteriores (e "acima", acima dela):
//        o desvio da base contra a própria mediana. A janela é do FinMind.
//
// LIMITES (declarados na tela):
//   - A parte do câmbio é aproximada: sem o ZC (pago), a paridade não se decompõe. A conta usa a variação do dólar
//     contra a da paridade; como a paridade desconta o frete e o porto em reais, a parte do câmbio sai subestimada.
//   - A base mistura praças: o ESALQ é de Campinas e a paridade é de MT. Na prática a base é quase sempre positiva
//     (1.180 de 1.185 dias de 2021 a 2026, mediana de R$ 26/saca): contra zero, a regra de alta nunca disparava. Por
//     isso a regra usa o desvio da base contra a mediana dela (ADR 0072).
//   - O contrato de referência vem do rótulo da tabela, que pode estar atrasado (ADR 0057). Achados reais: o rótulo
//     mudou para jul/26 em 2025-07-21, mas o salto de nível (R$ 28 → R$ 39) veio em 2025-08-11; e a semana de 18 a
//     22/07/2022 sai em ~R$ 85 entre semanas em ~R$ 60. Por isso a trava de qualidade: variação de 30% ou mais em 10
//     pregões é tratada como quebra da série, sem decisão (a alta real de mar/2022, a guerra na Ucrânia, foi de 27%).
//
// Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "dolar_paridade_milho";
// v2 (2026-10-05): a base contra a própria mediana de 52 semanas (ADR 0072).
const FACTOR_VERSION = 2;

const SERIES = Object.freeze({
  paridade: "IMEA.MILHO.PARIDADE_EXPORTACAO",
  preco: "B3.MILHO_ESALQ.AVISTA_BRL"
});
const PREGOES = 10;
const DIAS_MAX_PRECO = 4;
const INICIO_DOLAR = "2021-01-01";

// Do David (R-CAM-01/02 v0): 3% em 10 pregões, 50% do câmbio, base contra zero. Do FinMind: o forte (6%) e a
// tendência (2 semanas, 3 p.p.). O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarVariacaoPct: 3,
  limiarParteCambioPct: 50,
  limiarBaseRs: 0,
  limiarFortePct: 6,
  limiarQuebraPct: 30,
  semanasTendencia: 2,
  limiarTendenciaPp: 3,
  // Do FinMind (ADR 0072): a janela da mediana da base, em semanas. O limiar da base vale sobre o desvio contra ela.
  semanasBase: 52
});

// A mediana da base precisa de pelo menos metade da janela.
function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = ordenados.length >> 1;
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

const ROTULOS_TENDENCIA = { SUBINDO: "Paridade acelerando", CAINDO: "Paridade desacelerando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f + 0;
}

function fimDaSemana(dataIso) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// O valor do dia ou do último dia antes dele, até `diasMax` dias atrás.
function valorAte(mapa, dataIso, diasMax) {
  for (let k = 0; k <= diasMax; k += 1) {
    const v = mapa.get(somarDias(dataIso, -k));
    if (v !== undefined) return v;
  }
  return null;
}

// Camada C (função pura).
function ehQuebra(variacaoPct, parametros) {
  return variacaoPct !== null && variacaoPct !== undefined && Math.abs(variacaoPct) >= parametros.limiarQuebraPct;
}

// `desvioBaseRs`: a base (ESALQ − paridade) menos a mediana dela nas semanas anteriores (ADR 0072).
function decidirParidade({ variacaoPct, parteCambioPct = null, desvioBaseRs = null, cruzaTroca = false, variacaoAnterior = null }, parametros = PARAMETROS_PADRAO) {
  if (variacaoPct === null || variacaoPct === undefined || cruzaTroca || ehQuebra(variacaoPct, parametros)) return null;
  let tendencia = null;
  let mudancaPp = null;
  if (variacaoAnterior !== null && variacaoAnterior !== undefined) {
    mudancaPp = arredondar(variacaoPct - variacaoAnterior, 2);
    if (Math.abs(mudancaPp) < parametros.limiarTendenciaPp) tendencia = faixa.TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.SUBINDO;
  }
  const intensidade = Math.abs(variacaoPct) >= parametros.limiarFortePct ? faixa.INTENSIDADE.FORTE : faixa.INTENSIDADE.MODERADA;
  const temBase = desvioBaseRs !== null && desvioBaseRs !== undefined;
  if (variacaoPct >= parametros.limiarVariacaoPct && parteCambioPct !== null && parteCambioPct >= parametros.limiarParteCambioPct && temBase && desvioBaseRs < parametros.limiarBaseRs) {
    return { direcao: faixa.DIRECAO.ALTA, intensidade, tendencia, mudancaPp };
  }
  if (variacaoPct <= -parametros.limiarVariacaoPct && temBase && desvioBaseRs > parametros.limiarBaseRs) {
    return { direcao: faixa.DIRECAO.BAIXA, intensidade, tendencia, mudancaPp };
  }
  return { direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, tendencia, mudancaPp };
}

// Função PURA: as linhas de obterAsOf() (paridade com metadata e o ESALQ) e a PTAX ({ data, valor }) → um ponto por semana.
function derivarParidadeMilho(linhasAsOf, ptax, { parametros = PARAMETROS_PADRAO } = {}) {
  const paridade = linhasAsOf.filter((l) => l.seriesCode === SERIES.paridade).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const preco = new Map(linhasAsOf.filter((l) => l.seriesCode === SERIES.preco).map((l) => [l.observedAt, l.value]));
  const dolar = new Map(ptax.map((p) => [p.data, p.valor]));

  // Um cálculo por dia com paridade; o ponto da semana é o último dia dela.
  const ultimoDaSemana = new Map();
  paridade.forEach((linha, i) => ultimoDaSemana.set(fimDaSemana(linha.observedAt), i));

  const variacoes = new Map();
  const bases = [];
  const janelaBase = Math.max(4, Math.round(parametros.semanasBase));
  const pontos = [];
  for (const semana of [...ultimoDaSemana.keys()].sort()) {
    const i = ultimoDaSemana.get(semana);
    const hoje = paridade[i];
    const antes = i >= PREGOES ? paridade[i - PREGOES] : null;
    const contrato = hoje.metadata?.contratoReferencia ?? null;
    const cruzaTroca = Boolean(antes && (antes.metadata?.contratoReferencia ?? null) !== contrato);
    const variacaoPct = antes && antes.value > 0 ? arredondar((hoje.value / antes.value - 1) * 100, 2) : null;
    const dolarHoje = valorAte(dolar, hoje.observedAt, DIAS_MAX_PRECO);
    const dolarAntes = antes ? valorAte(dolar, antes.observedAt, DIAS_MAX_PRECO) : null;
    const variacaoDolarPct = dolarHoje && dolarAntes ? arredondar((dolarHoje / dolarAntes - 1) * 100, 2) : null;
    const parteCambioPct = variacaoPct && variacaoDolarPct !== null ? arredondar((variacaoDolarPct / variacaoPct) * 100, 0) : null;
    const precoHoje = valorAte(preco, hoje.observedAt, DIAS_MAX_PRECO);
    const baseRs = precoHoje === null ? null : arredondar(precoHoje - hoje.value, 2);
    const anteriores = bases.slice(-janelaBase);
    const medianaBase = anteriores.length >= janelaBase / 2 ? arredondar(mediana(anteriores), 2) : null;
    const desvioBaseRs = baseRs === null || medianaBase === null ? null : arredondar(baseRs - medianaBase, 2);
    if (baseRs !== null) bases.push(baseRs);
    variacoes.set(semana, cruzaTroca || ehQuebra(variacaoPct, parametros) ? null : variacaoPct);

    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: hoje.observedAt,
      contratoReferencia: contrato,
      paridadeSaca: hoje.value,
      dolar: dolarHoje,
      precoSaca: precoHoje,
      variacaoParidadePct: variacaoPct,
      variacaoDolarPct,
      parteCambioPct,
      baseSaca: baseRs,
      medianaBaseSaca: medianaBase,
      desvioBaseSaca: desvioBaseRs,
      cruzaTroca,
      decisao: decidirParidade(
        { variacaoPct, parteCambioPct, desvioBaseRs, cruzaTroca, variacaoAnterior: variacoes.get(somarDias(semana, -7 * parametros.semanasTendencia)) ?? null },
        parametros
      ),
      disponivelEm: hoje.publishedAt,
      disponivelEmEhEstimado: hoje.publishedAtIsEstimated
    });
  }
  return pontos;
}

// A PTAX de venda até o dia de `asOf` (sai à tarde do próprio dia; o market_quote não guarda a publicação).
function lerPtax(asOf, deps = {}) {
  return lerPtaxBase({ desde: INICIO_DOLAR, asOf }, deps);
}

async function calcularParidadeMilho({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [linhasParidade, linhasPreco, ptax] = await Promise.all([
    servico.obterAsOf({ seriesCodes: [SERIES.paridade], asOf, comMetadata: true }, deps),
    servico.obterAsOf({ seriesCodes: [SERIES.preco], asOf }, deps),
    lerPtax(asOf, deps)
  ]);
  return derivarParidadeMilho([...linhasParidade, ...linhasPreco], ptax, { parametros });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

function explicarParidade(ponto, parametros = PARAMETROS_PADRAO) {
  if (!ponto) return [];
  const dia = ponto.observedAt.split("-").reverse().join("/");
  const passos = [
    `${dia}: paridade de exportação de MT em R$ ${faixa.fmt(ponto.paridadeSaca, 2)}/saca` +
      `${ponto.contratoReferencia ? ` (contrato ${ponto.contratoReferencia}, como a tabela do IMEA escreve)` : ""}, ` +
      `dólar a R$ ${faixa.fmt(ponto.dolar, 4)} e Indicador ESALQ a R$ ${faixa.fmt(ponto.precoSaca, 2)}/saca (A).`
  ];
  if (ponto.cruzaTroca) {
    passos.push(`Os ${PREGOES} pregões cruzam a troca do contrato de referência: a variação mistura dois contratos e não é usada → sem decisão.`);
    return passos;
  }
  if (ehQuebra(ponto.variacaoParidadePct, parametros)) {
    passos.push(
      `A paridade variou ${faixa.comSinal(ponto.variacaoParidadePct)}% em ${PREGOES} pregões, ${faixa.fmt(parametros.limiarQuebraPct, 0)}% ou mais: ` +
        "tratado como quebra da série (troca de contrato fora do rótulo ou erro da fonte) → sem decisão."
    );
    return passos;
  }
  if (ponto.variacaoParidadePct === null) {
    passos.push(`Ainda não há ${PREGOES} pregões de paridade antes deste dia → sem decisão.`);
    return passos;
  }
  passos.push(
    `Em ${PREGOES} pregões, a paridade variou ${faixa.comSinal(ponto.variacaoParidadePct)}% e o dólar ${faixa.comSinal(ponto.variacaoDolarPct)}% ` +
      `(parte do câmbio ≈ ${ponto.parteCambioPct === null ? "sem dado" : `${faixa.fmt(ponto.parteCambioPct, 0)}%`}); ` +
      `base (ESALQ − paridade) de R$ ${faixa.comSinal(ponto.baseSaca)}/saca, ` +
      (ponto.desvioBaseSaca === null
        ? "sem a mediana das semanas anteriores (B)."
        : `R$ ${faixa.comSinal(ponto.desvioBaseSaca)} contra a mediana dela nas ${Math.round(parametros.semanasBase)} semanas anteriores (R$ ${faixa.fmt(ponto.medianaBaseSaca, 2)}) (B).`)
  );
  const d = ponto.decisao;
  const limiar = faixa.fmt(parametros.limiarVariacaoPct, 1);
  const forca = d?.intensidade === faixa.INTENSIDADE.FORTE ? `forte (${faixa.fmt(parametros.limiarFortePct, 1)}% ou mais)` : "moderada";
  if (d?.direcao === faixa.DIRECAO.ALTA) {
    passos.push(`Direção: a paridade subiu ${limiar}% ou mais, puxada pelo câmbio, com a base abaixo da mediana dela → Pressão de alta, ${forca}.`);
  } else if (d?.direcao === faixa.DIRECAO.BAIXA) {
    passos.push(`Direção: a paridade caiu ${limiar}% ou mais, com a base acima da mediana dela → Pressão de baixa, ${forca}.`);
  } else if (ponto.variacaoParidadePct >= parametros.limiarVariacaoPct) {
    const motivo =
      ponto.parteCambioPct === null || ponto.parteCambioPct < parametros.limiarParteCambioPct
        ? "a parte do câmbio ficou abaixo do limiar"
        : ponto.desvioBaseSaca === null
          ? "ainda não há a mediana da base"
          : "a base não está abaixo da mediana dela";
    passos.push(`Direção: a paridade subiu ${limiar}% ou mais, mas ${motivo} → Neutra.`);
  } else if (ponto.variacaoParidadePct <= -parametros.limiarVariacaoPct) {
    passos.push(`Direção: a paridade caiu ${limiar}% ou mais, mas a base não está acima da mediana dela → Neutra.`);
  } else {
    passos.push(`Direção: a paridade não mudou ${limiar}% ou mais nos ${PREGOES} pregões → Neutra.`);
  }
  if (d?.tendencia) passos.push(`Tendência: há ${parametros.semanasTendencia} semanas a variação era ${faixa.comSinal(ponto.variacaoParidadePct - d.mudancaPp)}% → ${ROTULOS_TENDENCIA[d.tendencia]}.`);
  return passos;
}

const EPISODIOS = [
  { data: "2022-03-04", rotulo: "Guerra na Ucrânia: Chicago dispara" },
  { data: "2023-06-30", rotulo: "Safra recorde, paridade em queda" },
  { data: "2024-12-06", rotulo: "Dólar passa de R$ 6" },
  { data: "2022-07-22", rotulo: "Semana fora da série (R$ 85 entre R$ 60)" }
];
const CENARIOS = [
  { rotulo: "Paridade +5%, 60% do câmbio, base R$ 4 abaixo da mediana", variacaoPct: 5, parteCambioPct: 60, desvioBaseRs: -4 },
  { rotulo: "Paridade +5%, 60% do câmbio, base R$ 3 acima da mediana", variacaoPct: 5, parteCambioPct: 60, desvioBaseRs: 3 },
  { rotulo: "Paridade +5%, 20% do câmbio, base R$ 4 abaixo da mediana", variacaoPct: 5, parteCambioPct: 20, desvioBaseRs: -4 },
  { rotulo: "Paridade −7%, base R$ 5 acima da mediana", variacaoPct: -7, parteCambioPct: 10, desvioBaseRs: 5 },
  { rotulo: "Paridade −2%", variacaoPct: -2, parteCambioPct: 30, desvioBaseRs: 5 }
];

function exemplosParidade(pontosTodos, parametros = PARAMETROS_PADRAO) {
  const porSemana = new Map(pontosTodos.map((ponto) => [fimDaSemana(ponto.observedAt), ponto]));
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      const ponto = porSemana.get(fimDaSemana(data));
      return { data: ponto?.observedAt ?? data, rotulo, valor: ponto?.variacaoParidadePct ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map(({ rotulo, ...entrada }) => ({ rotulo, valor: entrada.variacaoPct, valorAnterior: null, decisao: decidirParidade(entrada, parametros) }))
  };
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "Paridade de exportação de MT (IMEA)", campo: "paridadeSaca", casas: 2, sufixo: "R$/saca" },
    { camada: "A", rotulo: "Dólar (PTAX de venda)", campo: "dolar", casas: 4, sufixo: "R$/US$" },
    { camada: "A", rotulo: "Indicador CEPEA/ESALQ (Campinas)", campo: "precoSaca", casas: 2, sufixo: "R$/saca" },
    { camada: "B", rotulo: "Variação da paridade em 10 pregões", campo: "variacaoParidadePct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Variação do dólar nos mesmos pregões", campo: "variacaoDolarPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Parte do câmbio (aproximada)", campo: "parteCambioPct", casas: 0, unidadeValor: "%" },
    { camada: "B", rotulo: "Base: ESALQ − paridade", campo: "baseSaca", casas: 2, sinal: true, sufixo: "R$/saca" },
    {
      camada: "B",
      rotulo: "Base contra a mediana dela nas 52 semanas anteriores",
      campo: "desvioBaseSaca",
      casas: 2,
      sinal: true,
      secundario: { prefixo: "mediana de", campo: "medianaBaseSaca", casas: 2, sufixo: "R$/saca" }
    }
  ],
  graficoAB: {
    titulo: "Paridade de exportação de MT (A) × Indicador ESALQ de Campinas (A), em R$ por saca",
    unidade: "R$/saca",
    casas: 2,
    exigeCampo: "paridadeSaca",
    series: [
      { campo: "paridadeSaca", rotulo: "Paridade MT (A)" },
      { campo: "precoSaca", rotulo: "ESALQ Campinas (A)" }
    ]
  },
  graficoC: {
    titulo: "Variação da paridade em 10 pregões (B) e os limiares da regra (C)",
    campo: "variacaoParidadePct",
    rotulo: "Variação (B)",
    limiares: [
      { chave: "limiarVariacaoPct", sinal: 1, rotulo: "Limiar de alta" },
      { chave: "limiarVariacaoPct", sinal: -1, rotulo: "Limiar de baixa" }
    ]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarVariacaoPct", rotulo: "Limiar da variação", unidade: "%", explicacao: "Quanto a paridade precisa subir ou cair em 10 pregões para pesar (R-CAM-01/02 v0: 3)." },
    { chave: "limiarParteCambioPct", rotulo: "Parte mínima do câmbio", unidade: "%", explicacao: "Na alta, a parte da variação que precisa vir do dólar (R-CAM-01 v0: 50). Aproximada: variação do dólar ÷ variação da paridade." },
    { chave: "limiarBaseRs", rotulo: "Limiar da base", unidade: "R$/saca", explicacao: "Alta só com a base (ESALQ − paridade) abaixo da mediana dela mais este valor; baixa só acima (regra do David: o preço interno abaixo ou acima da paridade, 0). Contra a mediana porque Campinas contra MT deixa a base quase sempre positiva (ADR 0072)." },
    { chave: "semanasBase", rotulo: "Janela da mediana da base", unidade: "semanas", explicacao: "Quantas semanas anteriores entram na mediana da base (do FinMind, ADR 0072: 52, um ano)." },
    { chave: "limiarFortePct", rotulo: "Limiar do forte", unidade: "%", explicacao: "Variação a partir da qual a pressão é forte (acréscimo do FinMind)." },
    { chave: "limiarQuebraPct", rotulo: "Limiar da quebra da série", unidade: "%", explicacao: "Variação em 10 pregões tratada como quebra da série (troca de contrato fora do rótulo ou erro da fonte), sem decisão. Trava de qualidade do dado, do FinMind." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: "semanas", explicacao: "Contra quantas semanas atrás a variação é comparada para dizer se a paridade acelera ou desacelera." },
    { chave: "limiarTendenciaPp", rotulo: "Mudança mínima da tendência", unidade: "p.p.", explicacao: "Quanto a variação precisa mudar na janela para não ser considerada estável." }
  ],
  regra:
    "pressão de alta com a paridade subindo {limiarVariacaoPct}% ou mais em 10 pregões, {limiarParteCambioPct}% ou mais da alta vinda do câmbio (aproximado) e a base (ESALQ − paridade) abaixo da mediana dela nas {semanasBase} semanas anteriores (desvio abaixo de R$ {limiarBaseRs}); pressão de baixa com a paridade caindo {limiarVariacaoPct}% ou mais e a base acima da mediana (desvio acima de R$ {limiarBaseRs}); forte com {limiarFortePct}% ou mais; sem decisão quando os 10 pregões cruzam a troca do contrato de referência ou a variação chega a {limiarQuebraPct}% (quebra da série); tendência pela variação de {semanasTendencia} semanas antes, mudança mínima de {limiarTendenciaPp} p.p.",
  exemplos: { colunaValor: "Variação" },
  nota:
    "Um ponto por semana, no último dia com paridade: o IMEA publica na segunda os dias da semana anterior, então não é " +
    "tempo real. A paridade é a de Mato Grosso e o ESALQ é de Campinas (a praça do CCM): a base carrega o frete e é quase " +
    "sempre positiva, por isso a regra a compara com a mediana dela. " +
    "A parte do câmbio é aproximada, porque o ZC (Chicago) não é coletado. O contrato de referência vem do rótulo da " +
    "tabela do IMEA, que pode estar atrasado."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularParidadeMilho,
  explicar: explicarParidade,
  exemplos: exemplosParidade,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, decidirParidade, derivarParidadeMilho, calcularParidadeMilho };
