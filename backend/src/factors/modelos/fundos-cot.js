"use strict";

const pointInTimeService = require("../../services/point-in-time.service");
const faixa = require("../base/decisao-por-faixa");
const { somarDias } = require("../base/semana-de-dias");

// MOLDE do fator "Posicionamento de fundos (COT)" do FEL 1 (ADR 0050), o mesmo para qualquer mercado do CFTC: o
// cálculo é este; cada ativo dá as séries do mercado, o id do fator, os parâmetros padrão e os textos (o mercado no
// texto, os episódios e a nota). Ex.: factors/fundos-petroleo.factor.js.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), CFTC COT, posição de terça:
//     <mercado>.MM_LONG / MM_SHORT - contratos comprados e vendidos dos fundos (managed money)
//     <mercado>.OPEN_INTEREST      - contratos em aberto do mercado
//   fator (calculado sob demanda, NUNCA gravado):
//     A. liquida = comprados - vendidos; variacaoSemanal = contra a terça anterior; liquidaPctOi = liquida / contratos
//        em aberto (o mercado cresce com o tempo: em % ele fica comparável)
//     B. percentilJanela = onde liquidaPctOi fica entre as das semanas anteriores da janela (`anosJanela`, padrão 3
//        anos = 156 semanas; 0 = a mais vendida, 100 = a mais comprada; nulo com menos de ~96% delas, 150 em 3 anos);
//        posicaoRelativa = percentilJanela - 50 (de -50 a +50). Para o gráfico, a faixa da janela: os percentis 10, 50
//        e 90 de liquidaPctOi nessas semanas
//     C. decisão por faixa sobre a posição relativa, com a leitura que o ativo escolhe (`leitura`):
//        REVERSAO (padrão) - fundos muito comprados = pressão de BAIXA (risco de reversão); muito vendidos = de ALTA;
//        AMPLIFICA         - fundos muito comprados = pressão de ALTA (amplificam a alta); muito vendidos = de BAIXA
//
// Posição de terça, divulgada na sexta seguinte (às vezes depois, com feriado ou shutdown). Propriedades:
// determinístico, versionado, point-in-time, sem IA.

const DIAS_SEMANA = 7;
const SEMANAS_POR_ANO = 52;
// A janela pode ter até ~4% de semanas faltando (feriados, shutdown): 150 de 156 em 3 anos.
const FRACAO_MINIMA = 150 / 156;

// As duas leituras da camada C: o lado que os fundos muito comprados pressionam e o porquê, em cada ponta.
const LEITURAS = {
  REVERSAO: {
    acimaPressiona: faixa.DIRECAO.BAIXA,
    abaixo: "fundos muito vendidos têm pouco espaço para vender mais, risco de reversão para cima",
    acima: "fundos muito comprados têm pouco espaço para comprar mais, risco de reversão para baixo"
  },
  AMPLIFICA: {
    acimaPressiona: faixa.DIRECAO.ALTA,
    abaixo: "fundos muito vendidos amplificam a queda",
    acima: "fundos muito comprados amplificam a alta"
  }
};
const ROTULOS_TENDENCIA = { SUBINDO: "Fundos comprando", CAINDO: "Fundos vendendo", ESTAVEL: "Estável" };
const UNIDADE = " pontos";

const CENARIOS = [
  { valor: 45, valorAnterior: 30, rotulo: "Muito comprados e comprando mais" },
  { valor: 35, valorAnterior: 36, rotulo: "Comprados acima do normal, parados" },
  { valor: 5, valorAnterior: 35, rotulo: "Perto do normal, depois de muito comprados" },
  { valor: -35, valorAnterior: -15, rotulo: "Vendidos acima do normal e vendendo" },
  { valor: -45, valorAnterior: -48, rotulo: "Muito vendidos, começando a recomprar" }
];

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// O percentil `p` (0 a 1) de `valores`, pelo índice mais próximo abaixo.
function quantil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(p * (ordenados.length - 1))];
}

// Onde `valor` fica entre `anteriores`, de 0 a 100 (empates contam meio).
function percentil(valor, anteriores) {
  let abaixo = 0;
  let iguais = 0;
  for (const outro of anteriores) {
    if (outro < valor) abaixo += 1;
    else if (outro === valor) iguais += 1;
  }
  return ((abaixo + iguais / 2) / anteriores.length) * 100;
}

// As linhas de obterAsOf() -> Map(terça -> { comprados, vendidos, contratosEmAberto, disponivelEm, estimado }), só
// as semanas com as três séries.
function semanasCompletas(linhasAsOf, series) {
  const campoDa = Object.fromEntries(Object.entries(series).map(([campo, codigo]) => [codigo, campo]));
  const semanas = new Map();
  for (const linha of linhasAsOf) {
    const campo = campoDa[linha.seriesCode];
    if (!campo) continue;
    if (!semanas.has(linha.observedAt)) semanas.set(linha.observedAt, { disponivelEm: null, estimado: false });
    const semana = semanas.get(linha.observedAt);
    semana[campo] = linha.value;
    if (!semana.disponivelEm || linha.publishedAt > semana.disponivelEm) semana.disponivelEm = linha.publishedAt;
    semana.estimado = semana.estimado || linha.publishedAtIsEstimated;
  }
  for (const [data, semana] of semanas) {
    if (Object.keys(series).some((campo) => semana[campo] === undefined) || !semana.contratosEmAberto) semanas.delete(data);
  }
  return semanas;
}

// `config`:
//   factorId, factorVersion
//   series            { comprados, vendidos, contratosEmAberto }: os códigos do mercado no CFTC
//   parametrosPadrao  os limiares da camada C (decisao-por-faixa.js), com a origem no comentário do ativo
//   mercado           como o mercado aparece no texto ("no WTI")
//   episodios         datas do histórico do ativo para os exemplos da camada C
//   nota              a nota da tela e do prompt (periodicidade, divulgação e qual contrato)
//   leitura           "REVERSAO" (padrão) ou "AMPLIFICA" (ver a camada C acima)
//   anosJanela        os anos da janela do percentil (padrão 3; o milho usa 10, a proposta do David, ADR 0056)
function criarFatorFundosCot(config) {
  const { factorId, factorVersion, series, parametrosPadrao, mercado, episodios, nota, leitura = "REVERSAO", anosJanela = 3 } = config;
  const { acimaPressiona, abaixo, acima } = LEITURAS[leitura];
  const semanasJanela = anosJanela * SEMANAS_POR_ANO;
  const semanasMinimas = Math.floor(semanasJanela * FRACAO_MINIMA);
  const janela = `${anosJanela} anos`;

  // Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana (a terça da posição).
  function derivar(linhasAsOf, { parametros = parametrosPadrao } = {}) {
    const semanas = semanasCompletas(linhasAsOf, series);
    const datas = [...semanas.keys()].sort();
    const liquidaEm = new Map();
    const pctOiEm = new Map();
    for (const data of datas) {
      const s = semanas.get(data);
      liquidaEm.set(data, s.comprados - s.vendidos);
      pctOiEm.set(data, ((s.comprados - s.vendidos) / s.contratosEmAberto) * 100);
    }

    const posicoes = new Map();
    const pontos = [];
    for (const observedAt of datas) {
      const semana = semanas.get(observedAt);
      const anteriores = [];
      for (let k = 1; k <= semanasJanela; k += 1) {
        const valor = pctOiEm.get(somarDias(observedAt, -DIAS_SEMANA * k));
        if (valor !== undefined) anteriores.push(valor);
      }
      const completa = anteriores.length >= semanasMinimas;
      const pctl = completa ? arredondar(percentil(pctOiEm.get(observedAt), anteriores), 1) : null;
      const faixaJanela = (p) => (completa ? arredondar(quantil(anteriores, p), 2) : null);
      const posicaoRelativa = pctl === null ? null : arredondar(pctl - 50, 1);
      posicoes.set(observedAt, posicaoRelativa);
      const liquidaAnterior = liquidaEm.get(somarDias(observedAt, -DIAS_SEMANA));
      const anterior = posicoes.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
      pontos.push({
        factorId,
        factorVersion,
        observedAt,
        comprados: semana.comprados,
        vendidos: semana.vendidos,
        liquida: liquidaEm.get(observedAt),
        variacaoSemanal: liquidaAnterior === undefined ? null : liquidaEm.get(observedAt) - liquidaAnterior,
        liquidaPctOi: arredondar(pctOiEm.get(observedAt), 2),
        p10Janela: faixaJanela(0.1),
        medianaJanela: faixaJanela(0.5),
        p90Janela: faixaJanela(0.9),
        percentilJanela: pctl,
        posicaoRelativa,
        decisao: faixa.decidirPorFaixa(posicaoRelativa, anterior ?? null, parametros, acimaPressiona),
        disponivelEm: semana.disponivelEm,
        disponivelEmEhEstimado: semana.estimado
      });
    }
    return pontos;
  }

  async function calcular({ asOf, parametros = parametrosPadrao }, deps = {}) {
    const servico = deps.pointInTimeService || pointInTimeService;
    const linhas = await servico.obterAsOf({ seriesCodes: Object.values(series), asOf }, deps);
    return derivar(linhas, { parametros });
  }

  // --- Camada C: explicação e exemplos (decisão por faixa) -------------------------------------------------------

  const textos = {
    campo: "posicaoRelativa",
    primeiroPasso: (p) =>
      `Os fundos estavam com ${faixa.fmt(p.liquida, 0)} contratos líquidos ${mercado} (${faixa.fmt(p.liquidaPctOi)}% dos ` +
      `contratos em aberto), no percentil ${faixa.fmt(p.percentilJanela, 1)} dos ${janela} anteriores: posição relativa de ` +
      `${faixa.comSinal(p.posicaoRelativa, 1)}${UNIDADE} (B).`,
    nomeValor: "a posição relativa",
    abaixo,
    acima,
    subindo: "os fundos estão aumentando a posição comprada",
    caindo: "os fundos estão reduzindo a posição comprada",
    rotulosTendencia: ROTULOS_TENDENCIA,
    unidade: UNIDADE,
    unidadeMudanca: UNIDADE
  };

  function explicar(ponto, parametros = parametrosPadrao) {
    return faixa.explicarPorFaixa(ponto, parametros, textos);
  }

  function exemplos(pontosTodos, parametros = parametrosPadrao) {
    return faixa.exemplosPorFaixa(pontosTodos, parametros, {
      campo: textos.campo,
      episodios,
      cenarios: CENARIOS,
      acimaPressiona
    });
  }

  const apresentacao = {
    unidade: "pontos",
    quadros: [
      {
        camada: "A",
        rotulo: "Posição líquida dos fundos",
        campo: "liquida",
        casas: 0,
        sufixo: "contratos",
        secundario: { campo: "variacaoSemanal", casas: 0, sinal: true, prefixo: "variação na semana:", sufixo: "contratos" }
      },
      { camada: "A", rotulo: "Líquida / contratos em aberto", campo: "liquidaPctOi", casas: 2, sinal: true, unidadeValor: "%" },
      { camada: "B", rotulo: `Percentil nos ${janela} anteriores`, campo: "percentilJanela", casas: 1, sufixo: "0 = mais vendida, 100 = mais comprada" },
      { camada: "B", rotulo: "Posição relativa (percentil - 50)", campo: "posicaoRelativa", casas: 1, sinal: true, sufixo: "pontos" }
    ],
    graficoAB: {
      titulo: `Posição líquida dos fundos em % dos contratos em aberto (A) × a faixa dos ${janela} anteriores (B)`,
      unidade: "%",
      casas: 2,
      exigeCampo: "medianaJanela",
      series: [
        { campo: "liquidaPctOi", rotulo: "Líquida (A)" },
        { campo: "p90Janela", rotulo: `Percentil 90 em ${janela} (B)` },
        { campo: "medianaJanela", rotulo: `Mediana em ${janela} (B)` },
        { campo: "p10Janela", rotulo: `Percentil 10 em ${janela} (B)` }
      ]
    },
    graficoC: { titulo: "Posição relativa (B) e as faixas da decisão (C)", campo: "posicaoRelativa", rotulo: "Posição relativa (B)", unidade: "pontos" },
    rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
    parametros: faixa.parametrosFaixa({ unidade: "pontos", unidadeMudanca: "pontos" }),
    exemplos: { colunaValor: "Posição relativa", unidade: "pontos" },
    nota
  };

  return {
    derivar,
    calcular,
    explicar,
    exemplos,
    METODOLOGIA: {
      factorId,
      factorVersion,
      parametrosPadrao,
      periodicidade: "SEMANAL",
      calcular,
      explicar,
      exemplos,
      apresentacao
    }
  };
}

module.exports = { criarFatorFundosCot, percentil };
