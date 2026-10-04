"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");

// FATOR (PROPOSTA, ADR 0056): custo de insumos, fator "Custo de insumos (fertilizantes, diesel)" do FEL 1 para o milho,
// na versão que o David confirmou para a v1 (§5, ADR 0055): o custo agregado do IMEA, sem o preço de fertilizante ou
// diesel. A regra é a parte da margem da R-INS v0 do David ("Motor do Milho", 2026-10-02): o preço igual ou abaixo do
// custo total por saca funciona como piso. Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation):
//     IMEA.CUSTO.MILHO.SAFRA.MEDIA_MATO_GROSSO.CT / COE / PRODUTIVIDADE_MODAL - o custo total e o operacional efetivo
//       (R$/ha) e a produtividade modal (sc/ha) da média de Mato Grosso, por safra (ADR 0024)
//     B3.MILHO_ESALQ.AVISTA_BRL - o Indicador do Milho CEPEA/ESALQ, Campinas, R$/saca (ADR 0021)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por semana (o último pregão dela):
//     A. o custo total e o operacional efetivo por saca da safra mais nova que o IMEA tinha publicado até a semana
//        (R$/ha ÷ sc/ha); o Indicador ESALQ
//     B. margemPct = indicador ÷ custo total por saca - 1, em %
//     C. R-INS-01 v0, a parte da margem: margem de 0% ou menos (preço igual ou abaixo do custo) -> pressão de ALTA (piso:
//        retenção de oferta e menos área depois). A relação de troca (o resto da regra de alta) e a R-INS-02 (a de baixa,
//        com o adubo barato) pedem o preço do fertilizante, que não é coletado: sem direção de baixa. Acréscimos do
//        FinMind: forte com o preço igual ou abaixo do custo OPERACIONAL efetivo (o caixa); tendência pela margem de 4
//        semanas antes
//
// RESSALVA (a da proposta): o custo é de Mato Grosso, o preço é de Campinas, onde o milho vale mais (o frete). A margem
// assim fica maior que a do produtor de MT. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "insumos_milho_imea";
const FACTOR_VERSION = 1;

const PREFIXO_CUSTO = "IMEA.CUSTO.MILHO.SAFRA.MEDIA_MATO_GROSSO";
const SERIES = Object.freeze({
  custoTotal: `${PREFIXO_CUSTO}.CT`,
  custoOperacional: `${PREFIXO_CUSTO}.COE`,
  produtividade: `${PREFIXO_CUSTO}.PRODUTIVIDADE_MODAL`,
  preco: "B3.MILHO_ESALQ.AVISTA_BRL"
});
const SERIES_CUSTO = [SERIES.custoTotal, SERIES.custoOperacional, SERIES.produtividade];

// Do David (R-INS-01 v0): margem de 0% ou menos. Do FinMind: a tendência (4 semanas, 5 p.p.). O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarMargemPct: 0,
  semanasTendencia: 4,
  limiarTendenciaPp: 5
});

const ROTULOS_TENDENCIA = { SUBINDO: "Margem melhorando", CAINDO: "Margem piorando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f + 0;
}

// A semana de uma data: o domingo em que ela termina (AAAA-MM-DD).
function fimDaSemana(dataIso) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

// Camada C (função pura).
function decidirInsumos({ margemPct, precoAbaixoDoOperacional = false, margemAnterior = null }, parametros = PARAMETROS_PADRAO) {
  if (margemPct === null || margemPct === undefined) return null;
  let tendencia = null;
  let mudancaPp = null;
  if (margemAnterior !== null && margemAnterior !== undefined) {
    mudancaPp = arredondar(margemPct - margemAnterior, 2);
    if (Math.abs(mudancaPp) < parametros.limiarTendenciaPp) tendencia = faixa.TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.SUBINDO;
  }
  if (margemPct <= parametros.limiarMargemPct) {
    const intensidade = precoAbaixoDoOperacional ? faixa.INTENSIDADE.FORTE : faixa.INTENSIDADE.MODERADA;
    return { direcao: faixa.DIRECAO.ALTA, intensidade, tendencia, mudancaPp };
  }
  return { direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, tendencia, mudancaPp };
}

// Função PURA: `versoesCusto` (obterVersoesAsOf das séries de custo) e `linhasPreco` (obterAsOf do indicador) -> um
// ponto por semana em que o IMEA já tinha publicado algum custo.
function derivarInsumosMilho(versoesCusto, linhasPreco, { parametros = PARAMETROS_PADRAO } = {}) {
  const versoes = [...versoesCusto].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  const ultimoPregao = new Map();
  for (const linha of linhasPreco) {
    if (linha.seriesCode !== SERIES.preco) continue;
    const semana = fimDaSemana(linha.observedAt);
    const atual = ultimoPregao.get(semana);
    if (!atual || linha.observedAt > atual.observedAt) ultimoPregao.set(semana, linha);
  }

  const margens = new Map();
  const pontos = [];
  for (const semana of [...ultimoPregao.keys()].sort()) {
    const pregao = ultimoPregao.get(semana);
    // O custo que o IMEA tinha publicado até o fim do dia do pregão: série -> safra -> valor.
    const limite = new Date(`${pregao.observedAt}T23:59:59.999-03:00`);
    const custo = new Map(SERIES_CUSTO.map((s) => [s, new Map()]));
    for (const v of versoes) {
      if (new Date(v.publishedAt) > limite) break;
      custo.get(v.seriesCode)?.set(v.observedAt, v.value);
    }
    const safras = [...custo.get(SERIES.custoTotal).keys()].sort();
    const safra = safras.at(-1);
    const produtividade = safra ? custo.get(SERIES.produtividade).get(safra) : undefined;
    if (!safra || !produtividade) continue;

    const custoTotalSaca = custo.get(SERIES.custoTotal).get(safra) / produtividade;
    const operacional = custo.get(SERIES.custoOperacional).get(safra);
    const custoOperacionalSaca = operacional === undefined ? null : operacional / produtividade;
    const margem = arredondar((pregao.value / custoTotalSaca - 1) * 100, 2);
    margens.set(semana, margem);
    const anterior = new Date(`${semana}T00:00:00Z`);
    anterior.setUTCDate(anterior.getUTCDate() - 7 * parametros.semanasTendencia);
    const ano = Number(safra.slice(0, 4));

    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: pregao.observedAt,
      safraCusto: `${ano}/${String((ano + 1) % 100).padStart(2, "0")}`,
      precoSaca: pregao.value,
      custoTotalSaca: arredondar(custoTotalSaca, 2),
      custoOperacionalSaca: custoOperacionalSaca === null ? null : arredondar(custoOperacionalSaca, 2),
      margemSaca: arredondar(pregao.value - custoTotalSaca, 2),
      margemPct: margem,
      decisao: decidirInsumos(
        {
          margemPct: margem,
          precoAbaixoDoOperacional: custoOperacionalSaca !== null && pregao.value <= custoOperacionalSaca,
          margemAnterior: margens.get(anterior.toISOString().slice(0, 10)) ?? null
        },
        parametros
      ),
      disponivelEm: pregao.publishedAt,
      disponivelEmEhEstimado: pregao.publishedAtIsEstimated
    });
  }
  return pontos;
}

async function calcularInsumosMilho({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [versoesCusto, linhasPreco] = await Promise.all([
    servico.obterVersoesAsOf({ seriesCodes: SERIES_CUSTO, asOf }, deps),
    servico.obterAsOf({ seriesCodes: [SERIES.preco], asOf }, deps)
  ]);
  return derivarInsumosMilho(versoesCusto, linhasPreco, { parametros });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

const reais = (n) => `R$ ${faixa.fmt(n, 2)}`;

function explicarInsumos(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  const passos = [
    `Indicador ESALQ (Campinas) de ${reais(ponto.precoSaca)} por saca em ${ponto.observedAt.split("-").reverse().join("/")}, ` +
      `contra o custo total de ${reais(ponto.custoTotalSaca)} por saca em Mato Grosso (IMEA, safra ${ponto.safraCusto}) (A): ` +
      `margem de ${faixa.comSinal(ponto.margemPct)}% (B).`
  ];
  if (d.direcao === faixa.DIRECAO.ALTA) {
    passos.push(
      `Direção: a margem está em ${faixa.fmt(parametros.limiarMargemPct, 1)}% ou menos: o preço chegou ao custo, um piso → Pressão de alta, ` +
        `${d.intensidade === faixa.INTENSIDADE.FORTE ? "forte (abaixo do custo operacional efetivo, o caixa)" : "moderada"}.`
    );
  } else {
    passos.push(`Direção: a margem está acima de ${faixa.fmt(parametros.limiarMargemPct, 1)}%: sem piso → Neutra.`);
  }
  passos.push("Sem direção de baixa: a regra de baixa do especialista pede o preço do fertilizante (a relação de troca), que não é coletado.");
  passos.push("Ressalva: o custo é de Mato Grosso e o preço é de Campinas, onde o milho vale mais (o frete); a margem do produtor de MT é menor.");
  if (d.tendencia) passos.push(`Tendência: há ${parametros.semanasTendencia} semanas a margem era ${faixa.comSinal(ponto.margemPct - d.mudancaPp)}% → ${ROTULOS_TENDENCIA[d.tendencia]}.`);
  return passos;
}

const CENARIOS = [
  { rotulo: "Preço 15% acima do custo total", margemPct: 15 },
  { rotulo: "Preço 2% acima do custo total", margemPct: 2 },
  { rotulo: "Preço igual ao custo total", margemPct: 0 },
  { rotulo: "Preço 8% abaixo do custo total, acima do operacional", margemPct: -8 },
  { rotulo: "Preço abaixo do custo operacional efetivo", margemPct: -25, precoAbaixoDoOperacional: true }
];

function exemplosInsumos(_pontosTodos, parametros = PARAMETROS_PADRAO) {
  // Sem episódios: o custo só é conhecido (point-in-time) a partir da 1ª coleta, em 2026-09-15.
  return {
    episodios: [],
    cenarios: CENARIOS.map(({ rotulo, ...entrada }) => ({ rotulo, valor: entrada.margemPct, valorAnterior: null, decisao: decidirInsumos(entrada, parametros) }))
  };
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "Indicador CEPEA/ESALQ (Campinas)", campo: "precoSaca", casas: 2, sufixo: "R$/saca" },
    {
      camada: "A",
      rotulo: "Custo total por saca em MT (IMEA)",
      campo: "custoTotalSaca",
      casas: 2,
      secundario: { prefixo: "R$/saca, safra", campo: "safraCusto" }
    },
    { camada: "A", rotulo: "Custo operacional efetivo por saca em MT", campo: "custoOperacionalSaca", casas: 2, sufixo: "R$/saca" },
    { camada: "B", rotulo: "Margem por saca", campo: "margemSaca", casas: 2, sinal: true, sufixo: "R$/saca" },
    { camada: "B", rotulo: "Margem sobre o custo total", campo: "margemPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Indicador ESALQ (A) × o custo total e o operacional efetivo por saca em MT (A), em R$/saca",
    unidade: "R$/saca",
    casas: 2,
    exigeCampo: "custoTotalSaca",
    series: [
      { campo: "precoSaca", rotulo: "Indicador ESALQ (A)" },
      { campo: "custoTotalSaca", rotulo: "Custo total (A)" },
      { campo: "custoOperacionalSaca", rotulo: "Custo operacional efetivo (A)" }
    ]
  },
  graficoC: {
    titulo: "Margem sobre o custo total (B) e o limiar da regra (C)",
    campo: "margemPct",
    rotulo: "Margem (B)",
    limiares: [{ chave: "limiarMargemPct", sinal: 1, rotulo: "Limiar do piso (alta abaixo dele)" }]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarMargemPct", rotulo: "Limiar do piso", unidade: "%", explicacao: "Margem sobre o custo total igual ou abaixo deste valor pesa para alta (R-INS-01 v0: 0, o preço no custo)." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: "semanas", explicacao: "Contra quantas semanas atrás a margem é comparada para dizer se está melhorando ou piorando." },
    { chave: "limiarTendenciaPp", rotulo: "Mudança mínima da tendência", unidade: "p.p.", explicacao: "Quanto a margem precisa mudar na janela para não ser considerada estável." }
  ],
  regra:
    "pressão de alta com a margem do Indicador ESALQ sobre o custo total por saca do IMEA (MT) em {limiarMargemPct}% ou menos (o preço no custo, um piso), forte com o preço no custo operacional efetivo ou abaixo; sem direção de baixa (a regra de baixa do especialista pede o preço do fertilizante, que não é coletado); tendência pela margem de {semanasTendencia} semanas antes, mudança mínima de {limiarTendenciaPp} p.p.; ressalva: o custo é de MT e o preço é de Campinas, onde o milho vale mais",
  exemplos: { colunaValor: "Margem" },
  nota:
    "Semanal (o último pregão da semana), não é tempo real. O custo por safra do IMEA (média de MT) é conhecido na base " +
    "desde a 1ª coleta, em 2026-09-15: antes, o fator não tem dado (point-in-time). O preço é de Campinas; o custo, de MT."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularInsumosMilho,
  explicar: explicarInsumos,
  exemplos: exemplosInsumos,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, decidirInsumos, derivarInsumosMilho, calcularInsumosMilho };
