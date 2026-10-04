"use strict";

const pointInTimeService = require("../../services/point-in-time.service");
const faixa = require("../base/decisao-por-faixa");
const { somarDias, mediaSemanal } = require("../base/semana-de-dias");

// MOLDE do fator "Dólar (índice DXY)" do FEL 1 (ADR 0050), o mesmo para qualquer ativo cotado em dólar: o cálculo é
// este; cada ativo dá o id do fator, os parâmetros padrão e os textos (o efeito no ativo e os episódios). Ex.:
// factors/dolar-petroleo.factor.js.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (tabela observation):
//     FRED.DTWEXAFEGS - índice do dólar do Fed contra as moedas das economias avançadas (euro, iene, libra, dólar
//       canadense, franco suíço, dólar australiano e coroa sueca), diário, base jan/2006 = 100. É o mais próximo do
//       DXY que o FEL 1 cita (o DXY oficial, da ICE, é licenciado e não é coletado). O índice amplo (26 moedas,
//       DTWEXBGS) também é coletado e fica como alternativa (pergunta ao David)
//   fator (calculado sob demanda, NUNCA gravado):
//     A. indice da semana = média dos dias da semana (sábado a sexta); variacao13SemanasPct = contra 13 semanas
//        antes (contexto: é o movimento recente do dólar)
//     B. media52Semanas = média do índice nas 52 semanas anteriores (o normal recente; nula com menos de 48 delas);
//        desvioPct = indice / media52Semanas - 1
//     C. decisão por faixa sobre o desvio: dólar acima do normal = pressão de BAIXA para o ativo ("dólar forte
//        pressiona; dólar fraco favorece")
//
// O Fed divulga os índices em lote semanal (segundas): a última semana pode estar incompleta. Propriedades:
// determinístico, versionado, point-in-time, sem IA.

const SERIE_DOLAR = "FRED.DTWEXAFEGS";

const DIAS_SEMANA = 7;
const SEMANAS_MEDIA = 52;
const SEMANAS_MINIMAS = 48;
const SEMANAS_VARIACAO = 13;

const ROTULOS_TENDENCIA = { SUBINDO: "Dólar se fortalecendo", CAINDO: "Dólar se enfraquecendo", ESTAVEL: "Estável" };

const CENARIOS = [
  { valor: 8, valorAnterior: 4, rotulo: "Bem acima do normal e se fortalecendo" },
  { valor: 3, valorAnterior: 3.2, rotulo: "Acima do normal e estável" },
  { valor: 0.5, valorAnterior: 3, rotulo: "Perto do normal, depois de forte" },
  { valor: -3, valorAnterior: -1, rotulo: "Abaixo do normal e se enfraquecendo" },
  { valor: -6, valorAnterior: -8, rotulo: "Bem abaixo do normal, voltando" }
];

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// `config`:
//   factorId, factorVersion
//   parametrosPadrao  os limiares da camada C (decisao-por-faixa.js), com a origem no comentário do ativo
//   nomeAtivo         o ativo no texto da explicação ("o petróleo")
//   episodios         datas do histórico para os exemplos da camada C
function criarFatorDolar(config) {
  const { factorId, factorVersion, parametrosPadrao, nomeAtivo, episodios } = config;

  // Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana.
  function derivar(linhasAsOf, { parametros = parametrosPadrao } = {}) {
    const semanas = mediaSemanal(linhasAsOf, SERIE_DOLAR);
    const indiceEm = (data) => semanas.get(data)?.media;

    const desvios = new Map();
    const pontos = [];
    for (const observedAt of [...semanas.keys()].sort()) {
      const semana = semanas.get(observedAt);
      const anteriores = [];
      for (let k = 1; k <= SEMANAS_MEDIA; k += 1) {
        const valor = indiceEm(somarDias(observedAt, -DIAS_SEMANA * k));
        if (valor !== undefined) anteriores.push(valor);
      }
      const media = anteriores.length >= SEMANAS_MINIMAS ? anteriores.reduce((a, b) => a + b, 0) / anteriores.length : null;
      const desvioPct = media === null ? null : arredondar((semana.media / media - 1) * 100, 2);
      desvios.set(observedAt, desvioPct);
      const antes13 = indiceEm(somarDias(observedAt, -DIAS_SEMANA * SEMANAS_VARIACAO));
      const anterior = desvios.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
      pontos.push({
        factorId,
        factorVersion,
        observedAt,
        indice: arredondar(semana.media, 2),
        diasNaSemana: semana.dias,
        variacao13SemanasPct: antes13 ? arredondar((semana.media / antes13 - 1) * 100, 2) : null,
        media52Semanas: media === null ? null : arredondar(media, 2),
        desvioPct,
        decisao: faixa.decidirPorFaixa(desvioPct, anterior ?? null, parametros),
        disponivelEm: semana.disponivelEm,
        disponivelEmEhEstimado: semana.estimado
      });
    }
    return pontos;
  }

  async function calcular({ asOf, parametros = parametrosPadrao }, deps = {}) {
    const servico = deps.pointInTimeService || pointInTimeService;
    const linhas = await servico.obterAsOf({ seriesCodes: [SERIE_DOLAR], asOf }, deps);
    return derivar(linhas, { parametros });
  }

  // --- Camada C: explicação e exemplos (decisão por faixa) -------------------------------------------------------

  const textos = {
    campo: "desvioPct",
    primeiroPasso: (p) =>
      `O dólar contra as moedas das economias avançadas ficou em ${faixa.fmt(p.indice)} na semana, ` +
      `${faixa.comSinal(p.desvioPct)}% contra a média das 52 semanas anteriores (B).`,
    nomeValor: "o desvio",
    abaixo: `dólar abaixo do normal (fraco) favorece ${nomeAtivo}`,
    acima: `dólar acima do normal (forte) pressiona ${nomeAtivo}`,
    subindo: "o dólar está se fortalecendo em relação ao normal",
    caindo: "o dólar está se enfraquecendo em relação ao normal",
    rotulosTendencia: ROTULOS_TENDENCIA
  };

  function explicar(ponto, parametros = parametrosPadrao) {
    return faixa.explicarPorFaixa(ponto, parametros, textos);
  }

  function exemplos(pontosTodos, parametros = parametrosPadrao) {
    return faixa.exemplosPorFaixa(pontosTodos, parametros, { campo: textos.campo, episodios, cenarios: CENARIOS });
  }

  const apresentacao = {
    unidade: "índice",
    quadros: [
      {
        camada: "A",
        rotulo: "Dólar (economias avançadas)",
        campo: "indice",
        casas: 2,
        secundario: { campo: "diasNaSemana", casas: 0, prefixo: "índice Fed, média de", sufixo: "dia(s)" }
      },
      { camada: "A", rotulo: "Variação em 13 semanas (contexto)", campo: "variacao13SemanasPct", casas: 2, sinal: true, unidadeValor: "%" },
      { camada: "B", rotulo: "Média das 52 semanas anteriores", campo: "media52Semanas", casas: 2, sufixo: "índice" },
      { camada: "B", rotulo: "Desvio contra a média", campo: "desvioPct", casas: 2, sinal: true, unidadeValor: "%" }
    ],
    graficoAB: {
      titulo: "Dólar contra as economias avançadas (A) × média das 52 semanas anteriores (B)",
      unidade: "índice",
      casas: 2,
      exigeCampo: "media52Semanas",
      series: [
        { campo: "indice", rotulo: "Dólar (A)" },
        { campo: "media52Semanas", rotulo: "Média de 52 semanas (B)" }
      ]
    },
    graficoC: { titulo: "Desvio (B) e as faixas da decisão (C)", campo: "desvioPct", rotulo: "Desvio (B)" },
    rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
    parametros: faixa.PARAMETROS_FAIXA,
    exemplos: { colunaValor: "Desvio" },
    nota:
      "Semanal, não é tempo real: o Fed divulga os índices diários em lote semanal (segundas); a última semana pode " +
      "estar incompleta. Índice do Fed contra as economias avançadas, o mais próximo do DXY (licenciado, não coletado)."
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

module.exports = { criarFatorDolar, SERIE_DOLAR };
