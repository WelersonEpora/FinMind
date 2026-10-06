"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const observationRepository = require("../repositories/observation.repository");
const faixa = require("./base/decisao-por-faixa");
const { arredondar } = require("./modelos/posicao-historica");

// FATOR (PROPOSTA, ADR 0060): demanda mundial, fator "Demanda global e consumo" do FEL 1 para o café, como o F6 do Motor
// do Café v1 (2026-10-04). Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation):
//     USDA.PSD.CAFE.<PAIS>.CONSUMO - o consumo de café de cada país no balanço do USDA (PSD), mil sacas, por safra, com
//       as versões desde a 1ª coleta (publicação estimada: o PSD do café sai em junho e dezembro)
//     FRED.PCOFFOTMUSDM / FRED.PCOFFROBUSDM - o preço mensal do arábica e do robusta (FMI, pelo ALFRED), contexto
//   fator (calculado sob demanda, NUNCA gravado), um ponto por PUBLICAÇÃO do PSD:
//     A. o consumo mundial da safra mais nova (a soma dos países); arábica ÷ robusta no último mês conhecido (contexto:
//        a substituição de arábica por robusta na indústria, que o estudo cita)
//        (sem decisão com menos de 60 países nas duas safras: as versões antigas do PSD são parciais, ver MINIMO_PAISES)
//     B. o crescimento do consumo contra a safra anterior, só com os países presentes nas duas (a cobertura do PSD muda);
//        medida = crescimento - 1,5 p.p.: o desvio do meio da faixa neutra do estudo
//     C. as regras candidatas do estudo: crescimento "alinhado à taxa tendencial de 1% a 2% a.a." é neutro, com o
//        centro do estudo (1,5%) e a faixa calibrada (ADR 0088): 2 p.p. em torno dele, de -0,5% a 3,5% (perto dos
//        percentis 30 e 70 de 2003 a 2026; com a faixa do estudo, nenhum ano era neutro); acima, aceleração = pressão de
//        ALTA; abaixo, desaceleração = de BAIXA. O forte (4 p.p.) é calibração do FinMind: o percentil 80 de
//        |crescimento - 1,5| de 2003 a 2026
//
// Fora da conta, sem o dado: as estatísticas da ICO, as importações por bloco e a moagem (fontes novas). A substituição
// por robusta não entra na decisão (o estudo não dá a regra). Os estoques portuários europeus ficam no F3 (dupla
// contagem). O consumo anual muda pouco no curto prazo: o horizonte é de 30 a 90 dias. Propriedades: determinístico,
// versionado, point-in-time, sem IA.

const FACTOR_ID = "demanda_cafe_usda_psd";
// v2 (2026-10-06): a faixa neutra calibrada, 2 p.p. em torno de 1,5% (ADR 0088).
const FACTOR_VERSION = 2;

const PREFIXO = "USDA.PSD.CAFE";
const CAMPO = "CONSUMO";
const PRECOS = Object.freeze({ arabica: "FRED.PCOFFOTMUSDM", robusta: "FRED.PCOFFROBUSDM" });
const CENTRO_FAIXA = 1.5;
// As versões antigas do PSD têm a publicação estimada por safra e reconstroem só parte dos países em cada data (de 1 a
// 34 até 2025, contra 93 na 1ª coleta): com poucos países, o crescimento é espúrio (ex.: -66%). Sem decisão abaixo deste
// mínimo de países nas duas safras.
const MINIMO_PAISES = 60;

const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 2,
  limiarFortePct: 4,
  semanasTendencia: 1,
  limiarTendenciaPp: 1
});

const ROTULOS_TENDENCIA = { SUBINDO: "Consumo acelerando", CAINDO: "Consumo desacelerando", ESTAVEL: "Estável" };

const iso = (d) => new Date(d).toISOString();

// O preço mais recente de uma série do FMI conhecido até `ate` (o mês mais novo, na última versão até lá).
function precoAte(linhasPreco, serie, ate) {
  let melhor = null;
  for (const l of linhasPreco) {
    if (l.seriesCode !== serie || iso(l.publishedAt) > ate) continue;
    if (!melhor || l.observedAt > melhor.observedAt || (l.observedAt === melhor.observedAt && iso(l.publishedAt) > iso(melhor.publishedAt))) melhor = l;
  }
  return melhor;
}

// Função PURA: as versões do consumo (obterVersoesAsOf) e as do preço -> um ponto por publicação do PSD.
function derivarDemandaCafe(versoesConsumo, versoesPreco = [], { parametros = PARAMETROS_PADRAO } = {}) {
  const versoes = versoesConsumo.map((v) => ({ ...v, publishedAt: iso(v.publishedAt) }));
  const publicacoes = [...new Set(versoes.map((v) => v.publishedAt))].sort();
  const medidas = [];
  const pontos = [];
  for (const data of publicacoes) {
    // O que se sabia na publicação: a última versão de cada (país, safra) até ela.
    const vigente = new Map();
    let estimado = false;
    for (const v of versoes) {
      if (v.publishedAt > data) continue;
      const chave = `${v.seriesCode}|${v.observedAt}`;
      const atual = vigente.get(chave);
      if (!atual || v.publishedAt >= atual.publishedAt) vigente.set(chave, v);
    }
    const porSafra = new Map();
    for (const v of vigente.values()) {
      if (!porSafra.has(v.observedAt)) porSafra.set(v.observedAt, new Map());
      porSafra.get(v.observedAt).set(v.seriesCode, v.value);
    }
    const safras = [...porSafra.keys()].sort();
    if (safras.length < 2) continue;
    const safra = safras.at(-1);
    const anterior = safras.at(-2);
    let somaAgora = 0;
    let somaAntes = 0;
    let paises = 0;
    for (const [serie, valor] of porSafra.get(safra)) {
      const antes = porSafra.get(anterior).get(serie);
      if (antes === undefined) continue;
      somaAgora += valor;
      somaAntes += antes;
      paises += 1;
    }
    const crescimento = somaAntes > 0 && paises >= MINIMO_PAISES ? arredondar((somaAgora / somaAntes - 1) * 100, 2) : null;
    const medida = crescimento === null ? null : arredondar(crescimento - CENTRO_FAIXA, 2);
    medidas.push(medida);
    const medidaAnterior = medidas.length > parametros.semanasTendencia ? medidas.at(-1 - parametros.semanasTendencia) : null;
    estimado = versoes.some((v) => v.publishedAt === data && v.publishedAtIsEstimated);
    const arabica = precoAte(versoesPreco, PRECOS.arabica, data);
    const robusta = precoAte(versoesPreco, PRECOS.robusta, data);
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: data.slice(0, 10),
      safra: Number(safra.slice(0, 4)),
      consumoMundial: arredondar([...porSafra.get(safra).values()].reduce((a, b) => a + b, 0), 0),
      paisesComparados: paises,
      crescimentoPct: crescimento,
      desvioFaixaPp: medida,
      arabicaSobreRobusta: arabica && robusta && robusta.value ? arredondar(arabica.value / robusta.value, 2) : null,
      mesPrecos: arabica ? arabica.observedAt : null,
      decisao: faixa.decidirPorFaixa(medida, medidaAnterior ?? null, parametros, faixa.DIRECAO.ALTA),
      disponivelEm: data,
      disponivelEmEhEstimado: estimado
    });
  }
  return pontos;
}

async function calcularDemandaCafe({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const repo = deps.observationRepository || observationRepository;
  const paises = await repo.listarItens({ prefixoSerie: PREFIXO, campoReferencia: CAMPO });
  const series = paises.map((p) => `${PREFIXO}.${p.codigo}.${CAMPO}`);
  if (series.length === 0) return [];
  const [consumo, precos] = await Promise.all([
    servico.obterVersoesAsOf({ seriesCodes: series, asOf }, deps),
    servico.obterVersoesAsOf({ seriesCodes: Object.values(PRECOS), asOf }, deps)
  ]);
  return derivarDemandaCafe(consumo, precos, { parametros });
}

const TEXTOS = {
  campo: "desvioFaixaPp",
  primeiroPasso: (p) =>
    `No balanço do USDA de ${p.observedAt.split("-").reverse().join("/")}, o consumo mundial da safra ${p.safra} cresce ` +
    `${faixa.comSinal(p.crescimentoPct)}% contra a anterior (${p.paisesComparados} países nas duas): ` +
    `${faixa.comSinal(p.desvioFaixaPp)} p.p. contra 1,5% ao ano, o meio da tendência de 1% a 2% do estudo (B).`,
  nomeValor: "o desvio",
  abaixo: "o consumo cresce bem abaixo da tendência de 1% a 2% ao ano, demanda desacelerando",
  acima: "o consumo cresce bem acima da tendência de 1% a 2% ao ano, demanda acelerando",
  subindo: "o crescimento do consumo está ganhando força",
  caindo: "o crescimento do consumo está perdendo força",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: " p.p.",
  janela: "publicações"
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "PUBLICACAO",
  calcular: calcularDemandaCafe,
  explicar: (ponto, parametros = PARAMETROS_PADRAO) => faixa.explicarPorFaixa(ponto, parametros, TEXTOS),
  exemplos: (pontosTodos, parametros = PARAMETROS_PADRAO) =>
    faixa.exemplosPorFaixa(pontosTodos, parametros, {
      campo: TEXTOS.campo,
      acimaPressiona: faixa.DIRECAO.ALTA,
      episodios: [],
      cenarios: [
        { valor: 4.5, valorAnterior: 1, rotulo: "Consumo crescendo 6% (bem acima da tendência)" },
        { valor: 0.2, valorAnterior: 0.4, rotulo: "Consumo crescendo 1,7% (na tendência)" },
        { valor: -2, valorAnterior: 0, rotulo: "Consumo crescendo 0,5%, desacelerando" },
        { valor: -4.5, valorAnterior: -1, rotulo: "Consumo caindo 3%" }
      ]
    }),
  apresentacao: {
    unidade: "p.p.",
    quadros: [
      { camada: "A", rotulo: "Consumo mundial (USDA PSD)", campo: "consumoMundial", casas: 0, sufixo: "mil sacas" },
      { camada: "A", rotulo: "Arábica ÷ robusta (FMI, último mês conhecido; contexto)", campo: "arabicaSobreRobusta", casas: 2 },
      { camada: "B", rotulo: "Crescimento contra a safra anterior", campo: "crescimentoPct", casas: 2, sinal: true, unidadeValor: "%" },
      { camada: "B", rotulo: "Desvio do meio da faixa neutra (1,5%)", campo: "desvioFaixaPp", casas: 2, sinal: true, sufixo: "p.p." }
    ],
    graficoAB: {
      titulo: "Crescimento do consumo mundial a cada publicação do PSD (B)",
      unidade: "%",
      casas: 2,
      series: [{ campo: "crescimentoPct", rotulo: "Crescimento (B)" }]
    },
    graficoC: { titulo: "Desvio da faixa neutra (B) e as faixas da decisão (C)", campo: "desvioFaixaPp", rotulo: "Desvio (B)", unidade: "p.p." },
    rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
    parametros: faixa.parametrosFaixa({ unidade: "p.p.", unidadeMudanca: "p.p.", janela: "publicações" }),
    exemplos: { colunaValor: "Desvio", unidade: "p.p." },
    nota:
      "Por publicação, não é tempo real: o balanço do café do USDA (PSD) sai em junho e dezembro, com a data de " +
      "publicação estimada. O consumo é a soma dos países; o crescimento usa só os países nas duas safras."
  }
};

module.exports = { FACTOR_ID, FACTOR_VERSION, PARAMETROS_PADRAO, METODOLOGIA, derivarDemandaCafe };
