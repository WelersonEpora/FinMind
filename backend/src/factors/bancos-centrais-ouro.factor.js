"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const observationRepository = require("../repositories/observation.repository");
const faixa = require("./base/decisao-por-faixa");
const { somarMeses } = require("./base/meses");
const { paresForaDaFaixa } = require("../shared/fmi-ouro-conferencia");

// FATOR (PROPOSTA, ADR 0053): bancos centrais, fator "Demanda de bancos centrais (reservas)" do FEL 1 para o ouro.
// Camadas A e B calculadas, C simulada pela decisão por faixa com parâmetros que o Comitê ajusta; o peso é o do FEL 1.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation):
//     WGC.OFERTA_DEMANDA.BANCOS_CENTRAIS - a demanda dos bancos centrais no trimestre, em toneladas, do World Gold
//       Council (USO INTERNO, ADR 0037): as compras declaradas e a ESTIMATIVA do WGC para as não declaradas
//     IMF.IRFCL.OURO.<PAIS>.VOLUME_MI_OZT / VALOR_MI_USD - o ouro nas reservas de cada país, mensal, do FMI (ADR 0036):
//       só o declarado; contexto, mais rápido que o WGC e com quem comprou
//   fator (calculado sob demanda, NUNCA gravado), um ponto por trimestre (o 1º dia do trimestre):
//     A. comprasTrimestreT = a demanda do trimestre (WGC); compras4TrimestresT = a soma dos últimos 4 trimestres;
//        declaradas12mT = as compras declaradas ao FMI nos 12 meses até o último mês do trimestre com dado (contexto)
//     B. media3AnosT = a média das somas de 4 trimestres nos 12 trimestres anteriores (o ritmo normal recente; nula
//        sem os 12); desvio3AnosT = compras4TrimestresT - media3AnosT
//     C. decisão por faixa sobre o desvio: comprando além do ritmo dos 3 anos anteriores = pressão de ALTA ("alta com
//        compras de bancos centrais", FEL 1); abaixo dele, de baixa
//
// Por que o WGC e não só o FMI (histórico contra a LBMA): as compras DECLARADAS ao FMI não antecipam o ouro (-0,14 com o
// ouro 26 semanas depois, 2006 a 2026). As do WGC, com a estimativa das não declaradas, são a única medida do ouro com
// relação para frente: o desvio contra os 3 anos anteriores tem +0,26 com o ouro 26 semanas depois e +0,47 com 52
// (2013 a 2026, 51 trimestres; +0,31 e +0,52 até 2019, +0,20 e +0,42 de 2020 em diante). Amostra curta, e parte dela é
// a alta de 2022 a 2025, quando as compras recordes e o ouro subiram juntos.
//
// Conferência do FMI: só entra o par (país, mês) CONFERÍVEL e conferido: volume e valor positivos, com o preço implícito
// dentro da faixa do mês (a mesma regra que o coletor usa para marcar, shared/fmi-ouro-conferencia.js). O Brasil e
// Angola reportam o volume 1.000× maior e o Chile em quilos em parte do histórico; o Cazaquistão, volume zero em
// mar/2026; Ruanda, Bósnia e Kosovo, só o volume (sem como conferir), em escala impossível. A soma é país a país, só
// entre os que reportam nos dois meses comparados, e o mês só entra com 90% dos países dos 12 meses anteriores.
//
// Propriedades: determinístico, versionado, point-in-time (o WGC e o FMI não informam quando publicaram: a
// disponibilidade é a da 1ª coleta, e datas anteriores ficam sem dado), sem IA.

const FACTOR_ID = "bancos_centrais_ouro_wgc";
const FACTOR_VERSION = 1;

const SERIE_WGC = "WGC.OFERTA_DEMANDA.BANCOS_CENTRAIS";
const PREFIXO_FMI = "IMF.IRFCL.OURO";
const CAMPO_VOLUME = "VOLUME_MI_OZT";
const CAMPO_VALOR = "VALOR_MI_USD";
const TONELADAS_POR_MI_OZT = 31.1034768;
const MESES_ANO = 12;
const MESES_TRIMESTRE = 3;
const TRIMESTRES_ANO = 4;
const TRIMESTRES_MEDIA = 12;
const COBERTURA_MINIMA = 0.9;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2013 a 2026): |desvio contra os 3 anos anteriores| tem
// percentis 40/60/80 de 102 / 173 / 290 t. O Comitê ajusta. A janela da tendência é em TRIMESTRES (a chave é a dos
// fatores semanais).
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 100,
  limiarFortePct: 300,
  semanasTendencia: 2,
  limiarTendenciaPp: 100
});

const ACIMA_PRESSIONA = faixa.DIRECAO.ALTA;
const ROTULOS_TENDENCIA = { SUBINDO: "Compras acelerando", CAINDO: "Compras desacelerando", ESTAVEL: "Estável" };
const UNIDADE = " t";

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// --- Contexto: as compras declaradas ao FMI ------------------------------------------------------------------------

// As linhas do FMI -> Map(mês -> Map(país -> volume em mi oz)), só os pares conferíveis e conferidos.
function volumesConferidos(linhasAsOf) {
  const pares = new Map();
  for (const linha of linhasAsOf) {
    if (!linha.seriesCode.startsWith(`${PREFIXO_FMI}.`)) continue;
    const [, , , pais, campo] = linha.seriesCode.split(".");
    const chave = `${pais}|${linha.observedAt}`;
    if (!pares.has(chave)) pares.set(chave, {});
    pares.get(chave)[campo] = linha.value;
  }
  const fora = paresForaDaFaixa(pares);
  const meses = new Map();
  for (const [chave, par] of pares) {
    if (fora.has(chave) || !(par[CAMPO_VOLUME] > 0 && par[CAMPO_VALOR] > 0)) continue;
    const [pais, mes] = chave.split("|");
    if (!meses.has(mes)) meses.set(mes, new Map());
    meses.get(mes).set(pais, par[CAMPO_VOLUME]);
  }
  return meses;
}

// Função PURA: as linhas do FMI -> Map(mês -> { toneladas, paises }): as compras declaradas em 12 meses, país a país,
// só entre os que estão nos dois meses, e só nos meses com a cobertura mínima.
function derivarComprasDeclaradas(linhasAsOf) {
  const meses = volumesConferidos(linhasAsOf);
  const paisesNoAno = new Map();
  const compras = new Map();
  for (const mes of [...meses.keys()].sort()) {
    const agora = meses.get(mes);
    const antes = meses.get(somarMeses(mes, -MESES_ANO));
    if (!antes) continue;
    let variacao = 0;
    let paises = 0;
    for (const [pais, volume] of agora) {
      if (!antes.has(pais)) continue;
      variacao += volume - antes.get(pais);
      paises += 1;
    }
    paisesNoAno.set(mes, paises);
    const maximo = Math.max(...Array.from({ length: MESES_ANO }, (_, k) => paisesNoAno.get(somarMeses(mes, -(k + 1))) || 0));
    if (paises < COBERTURA_MINIMA * maximo) continue;
    compras.set(mes, { toneladas: arredondar(variacao * TONELADAS_POR_MI_OZT, 1), paises });
  }
  return compras;
}

// As compras declaradas no último mês do trimestre com dado (do 3º para o 1º).
function declaradasDoTrimestre(declaradas, trimestre) {
  for (let k = MESES_TRIMESTRE - 1; k >= 0; k -= 1) {
    const mes = somarMeses(trimestre, k);
    if (declaradas.has(mes)) return { mes, ...declaradas.get(mes) };
  }
  return null;
}

// --- A medida: a demanda do WGC ------------------------------------------------------------------------------------

// Função PURA: recebe as linhas de obterAsOf() (o WGC e o FMI) e devolve um ponto por trimestre do WGC.
function derivarBancosCentraisOuro(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const trimestres = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode !== SERIE_WGC) continue;
    trimestres.set(linha.observedAt, { valor: linha.value, disponivelEm: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
  }
  const declaradas = derivarComprasDeclaradas(linhasAsOf);
  const somaAte = (fim) => {
    let soma = 0;
    for (let k = 0; k < TRIMESTRES_ANO; k += 1) {
      const t = trimestres.get(somarMeses(fim, -MESES_TRIMESTRE * k));
      if (!t) return null;
      soma += t.valor;
    }
    return soma;
  };
  const mediaAntes = (fim) => {
    let soma = 0;
    for (let k = 1; k <= TRIMESTRES_MEDIA; k += 1) {
      const s = somaAte(somarMeses(fim, -MESES_TRIMESTRE * k));
      if (s === null) return null;
      soma += s;
    }
    return soma / TRIMESTRES_MEDIA;
  };

  const desvios = new Map();
  const pontos = [];
  for (const observedAt of [...trimestres.keys()].sort()) {
    const trimestre = trimestres.get(observedAt);
    const soma = somaAte(observedAt);
    const media = soma === null ? null : mediaAntes(observedAt);
    const desvio = media === null ? null : arredondar(soma - media, 1);
    desvios.set(observedAt, desvio);
    const anterior = desvios.get(somarMeses(observedAt, -MESES_TRIMESTRE * parametros.semanasTendencia));
    const declarada = declaradasDoTrimestre(declaradas, observedAt);
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      comprasTrimestreT: arredondar(trimestre.valor, 1),
      compras4TrimestresT: soma === null ? null : arredondar(soma, 1),
      declaradas12mT: declarada ? declarada.toneladas : null,
      declaradasPaises: declarada ? declarada.paises : null,
      media3AnosT: media === null ? null : arredondar(media, 1),
      desvio3AnosT: desvio,
      decisao: faixa.decidirPorFaixa(desvio, anterior ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: trimestre.disponivelEm,
      disponivelEmEhEstimado: trimestre.estimado
    });
  }
  return pontos;
}

async function calcularBancosCentraisOuro({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const servico = deps.pointInTimeService || pointInTimeService;
  const paises = await repo.listarUltimasDatasItens({ prefixoSerie: PREFIXO_FMI, campoReferencia: CAMPO_VOLUME });
  const seriesFmi = paises.flatMap(({ codigo }) => [`${PREFIXO_FMI}.${codigo}.${CAMPO_VOLUME}`, `${PREFIXO_FMI}.${codigo}.${CAMPO_VALOR}`]);
  const linhas = await servico.obterAsOf({ seriesCodes: [SERIE_WGC, ...seriesFmi], asOf }, deps);
  return derivarBancosCentraisOuro(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "desvio3AnosT",
  janela: "trimestres",
  primeiroPasso: (p) =>
    `Os bancos centrais compraram ${faixa.fmt(p.compras4TrimestresT, 0)} t de ouro nos 4 trimestres até este (World Gold ` +
    `Council, com a estimativa das não declaradas), contra ${faixa.fmt(p.media3AnosT, 0)} t na média dos 3 anos anteriores: ` +
    `${faixa.comSinal(p.desvio3AnosT, 0)}${UNIDADE} (B).` +
    (p.declaradas12mT === null ? "" : ` Declaradas ao FMI em 12 meses: ${faixa.comSinal(p.declaradas12mT, 0)}${UNIDADE} (contexto).`),
  nomeValor: "o desvio",
  abaixo: "bancos centrais comprando menos que o normal recente tiram sustentação da demanda",
  acima: "bancos centrais comprando acima do normal recente sustentam a demanda",
  subindo: "as compras estão acelerando em relação ao normal",
  caindo: "as compras estão desacelerando em relação ao normal",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

const EPISODIOS = [
  { data: "2018-10-01", rotulo: "Rússia, Turquia e Polônia comprando" },
  { data: "2020-10-01", rotulo: "Compras recuam na pandemia" },
  { data: "2022-10-01", rotulo: "Compras recordes depois das sanções à Rússia" },
  { data: "2025-10-01", rotulo: "Compras abaixo do ritmo recorde de 2022 a 2024" }
];
const CENARIOS = [
  { valor: 450, valorAnterior: 200, rotulo: "Muito acima do normal e acelerando" },
  { valor: 180, valorAnterior: 200, rotulo: "Acima do normal, ritmo estável" },
  { valor: 30, valorAnterior: 250, rotulo: "Perto do normal, depois de muito acima" },
  { valor: -180, valorAnterior: -50, rotulo: "Abaixo do normal e desacelerando" },
  { valor: -350, valorAnterior: -400, rotulo: "Bem abaixo do normal, voltando" }
];

function explicarBancosCentrais(ponto, parametros = PARAMETROS_PADRAO) {
  return faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
}

function exemplosBancosCentrais(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    episodios: EPISODIOS,
    cenarios: CENARIOS,
    acimaPressiona: ACIMA_PRESSIONA
  });
}

const APRESENTACAO = {
  unidade: "t",
  quadros: [
    { camada: "A", rotulo: "Compras no trimestre (WGC)", campo: "comprasTrimestreT", casas: 0, sinal: true, sufixo: "t, com as não declaradas" },
    { camada: "A", rotulo: "Compras em 4 trimestres (WGC)", campo: "compras4TrimestresT", casas: 0, sinal: true, sufixo: "t" },
    {
      camada: "A",
      rotulo: "Declaradas ao FMI em 12 meses (contexto)",
      campo: "declaradas12mT",
      casas: 0,
      sinal: true,
      secundario: { campo: "declaradasPaises", casas: 0, prefixo: "t; países na conta:", sufixo: "" }
    },
    { camada: "B", rotulo: "Média dos 3 anos anteriores", campo: "media3AnosT", casas: 0, sufixo: "t em 4 trimestres" },
    { camada: "B", rotulo: "Desvio contra a média", campo: "desvio3AnosT", casas: 0, sinal: true, sufixo: "t" }
  ],
  graficoAB: {
    titulo: "Compras dos bancos centrais em 4 trimestres (A) × a média dos 3 anos anteriores (B), com as declaradas ao FMI",
    unidade: "t",
    casas: 0,
    exigeCampo: "media3AnosT",
    series: [
      { campo: "compras4TrimestresT", rotulo: "Compras em 4 trimestres, WGC (A)" },
      { campo: "media3AnosT", rotulo: "Média dos 3 anos anteriores (B)" },
      { campo: "declaradas12mT", rotulo: "Declaradas ao FMI em 12 meses (contexto)" }
    ]
  },
  graficoC: { titulo: "Desvio contra os 3 anos anteriores (B) e as faixas da decisão (C)", campo: "desvio3AnosT", rotulo: "Desvio (B)", unidade: "t" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ unidade: "t", unidadeMudanca: "t", janela: "trimestres" }),
  exemplos: { colunaValor: "Desvio", unidade: "t" },
  nota:
    "Trimestral, não é tempo real: o World Gold Council publica o trimestre cerca de um mês depois do fim dele, com a " +
    "estimativa das compras não declaradas (revisada depois; uso interno, ADR 0037). As declaradas ao FMI são mensais " +
    "e chegam até ~2 meses depois do mês."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "TRIMESTRAL",
  calcular: calcularBancosCentraisOuro,
  explicar: explicarBancosCentrais,
  exemplos: exemplosBancosCentrais,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  derivarComprasDeclaradas,
  derivarBancosCentraisOuro,
  calcularBancosCentraisOuro
};
