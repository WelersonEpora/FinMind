"use strict";

const faixa = require("../base/decisao-por-faixa");
const { percentil } = require("./fundos-cot");

// CALIBRAÇÃO PELO PRÓPRIO HISTÓRICO (ADR 0060): o Motor do Café v1 deixa os limiares em aberto
// ("[CALIBRAR COM DADOS POINT-IN-TIME]"). Nos fatores lidos por uma medida contínua (o VHI, a variação do estoque da
// ICE, a variação da PTAX), o FinMind propõe o limiar como um PERCENTIL da medida no histórico anterior a cada ponto
// (point-in-time: só o que já tinha acontecido): posição relativa = percentil - 50, de -50 a +50. A faixa neutra padrão,
// 30 pontos (do percentil 20 ao 80), é a que o estudo usa no COT ("zona intermediária entre os percentis 20 e 80"),
// estendida aos outros fatores; a forte, 40 pontos (abaixo do 10 ou acima do 90). O Comitê ajusta. Assim o limiar se
// recalibra sozinho com o histórico de cada base (dev ou servidor), em vez de um número fixo tirado de uma janela.

const PARAMETROS_POSICAO = Object.freeze({
  limiarModeradoPct: 30,
  limiarFortePct: 40,
  semanasTendencia: 4,
  limiarTendenciaPp: 15
});

const UNIDADE = " pontos";

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f + 0;
}

// O percentil `p` (0 a 1) de `valores`, pelo índice mais próximo abaixo.
function quantil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(p * (ordenados.length - 1))];
}

// `valor` contra `anteriores`: o percentil (0 a 100), a posição relativa (percentil - 50) e a faixa dos anteriores
// (percentis 10, 50 e 90, para o gráfico). Tudo nulo com menos de `minimo` anteriores.
function posicaoNoHistorico(valor, anteriores, minimo) {
  if (valor === null || valor === undefined || anteriores.length < minimo) {
    return { percentil: null, posicaoRelativa: null, p10: null, mediana: null, p90: null };
  }
  const pctl = arredondar(percentil(valor, anteriores), 1);
  return {
    percentil: pctl,
    posicaoRelativa: arredondar(pctl - 50, 1),
    p10: arredondar(quantil(anteriores, 0.1), 2),
    mediana: arredondar(quantil(anteriores, 0.5), 2),
    p90: arredondar(quantil(anteriores, 0.9), 2)
  };
}

const parametrosPosicao = (janela = "semanas") => faixa.parametrosFaixa({ unidade: "pontos", unidadeMudanca: "pontos", janela });

const ROTULOS_DECISAO_BASE = faixa.ROTULOS;

// MOLDE de um fator semanal lido pela posição da medida no histórico anterior (ex.: a variação do estoque certificado
// da ICE em 4 semanas, a variação da PTAX em 10 pregões). `config`:
//   factorId, factorVersion
//   carregar(asOf, deps)    -> as entradas (o que `medir` recebe), point-in-time
//   medir(entradas)         -> [{ observedAt, medida, disponivelEm, disponivelEmEhEstimado, ...campos da camada A }],
//                              uma por semana, em ordem; `medida` nula quando a semana não tem como medir
//   semanasJanela, minimo   o histórico de comparação (as semanas anteriores com medida) e o mínimo delas
//   acimaPressiona          o lado que a medida alta (percentil alto) pressiona
//   textos                  { primeiroPasso(ponto), abaixo, acima, subindo, caindo, rotulosTendencia }
//   apresentacao            { quadrosA, rotuloMedida, unidadeMedida, casasMedida, tituloAB, nota }
//   episodios, cenarios, parametrosPadrao (padrão: PARAMETROS_POSICAO)
function criarFatorPosicaoSemanal(config) {
  const { factorId, factorVersion, carregar, medir, semanasJanela, minimo, acimaPressiona, episodios, cenarios } = config;
  const parametrosPadrao = config.parametrosPadrao || PARAMETROS_POSICAO;
  const anosJanela = Math.round(semanasJanela / 52);
  const janela = `${anosJanela} anos`;

  // Função PURA: as entradas -> um ponto por semana, com a posição da medida nas `semanasJanela` semanas anteriores.
  function derivar(entradas, { parametros = parametrosPadrao } = {}) {
    const semanas = medir(entradas);
    const posicoes = new Map();
    const pontos = [];
    semanas.forEach((semana, i) => {
      const anteriores = semanas
        .slice(Math.max(0, i - semanasJanela), i)
        .map((s) => s.medida)
        .filter((v) => v !== null && v !== undefined);
      const posicao = posicaoNoHistorico(semana.medida, anteriores, minimo);
      posicoes.set(i, posicao.posicaoRelativa);
      const anterior = posicoes.get(i - parametros.semanasTendencia);
      pontos.push({
        factorId,
        factorVersion,
        ...semana,
        percentilJanela: posicao.percentil,
        posicaoRelativa: posicao.posicaoRelativa,
        p10Janela: posicao.p10,
        medianaJanela: posicao.mediana,
        p90Janela: posicao.p90,
        decisao: faixa.decidirPorFaixa(posicao.posicaoRelativa, anterior ?? null, parametros, acimaPressiona)
      });
    });
    return pontos;
  }

  async function calcular({ asOf, parametros = parametrosPadrao }, deps = {}) {
    return derivar(await carregar(asOf, deps), { parametros });
  }

  const textos = {
    campo: "posicaoRelativa",
    nomeValor: "a posição relativa",
    unidade: UNIDADE,
    unidadeMudanca: UNIDADE,
    ...config.textos,
    primeiroPasso: (p) =>
      `${config.textos.primeiroPasso(p)} No histórico das ${semanasJanela} semanas anteriores (${janela}), fica no percentil ` +
      `${faixa.fmt(p.percentilJanela, 1)}: posição relativa de ${faixa.comSinal(p.posicaoRelativa, 1)}${UNIDADE} (B).`
  };

  function explicar(ponto, parametros = parametrosPadrao) {
    return faixa.explicarPorFaixa(ponto, parametros, textos);
  }

  function exemplos(pontosTodos, parametros = parametrosPadrao) {
    return faixa.exemplosPorFaixa(pontosTodos, parametros, { campo: "posicaoRelativa", episodios, cenarios, acimaPressiona });
  }

  const a = config.apresentacao;
  const apresentacao = {
    unidade: "pontos",
    quadros: [
      ...a.quadrosA,
      { camada: "B", rotulo: `Percentil nos ${janela} anteriores`, campo: "percentilJanela", casas: 1, sufixo: "0 = o menor, 100 = o maior" },
      { camada: "B", rotulo: "Posição relativa (percentil - 50)", campo: "posicaoRelativa", casas: 1, sinal: true, sufixo: "pontos" }
    ],
    graficoAB: {
      titulo: `${a.tituloAB} (A) × a faixa dos ${janela} anteriores (B)`,
      unidade: a.unidadeMedida,
      casas: a.casasMedida,
      exigeCampo: "medianaJanela",
      series: [
        { campo: "medida", rotulo: `${a.rotuloMedida} (A)` },
        { campo: "p90Janela", rotulo: `Percentil 90 em ${janela} (B)` },
        { campo: "medianaJanela", rotulo: `Mediana em ${janela} (B)` },
        { campo: "p10Janela", rotulo: `Percentil 10 em ${janela} (B)` }
      ]
    },
    graficoC: { titulo: "Posição relativa (B) e as faixas da decisão (C)", campo: "posicaoRelativa", rotulo: "Posição relativa (B)", unidade: "pontos" },
    rotulosDecisao: { ...ROTULOS_DECISAO_BASE, tendencia: config.textos.rotulosTendencia },
    parametros: parametrosPosicao(),
    exemplos: { colunaValor: "Posição relativa", unidade: "pontos" },
    nota: a.nota
  };

  return {
    derivar,
    calcular,
    explicar,
    exemplos,
    METODOLOGIA: { factorId, factorVersion, parametrosPadrao, periodicidade: "SEMANAL", calcular, explicar, exemplos, apresentacao }
  };
}

module.exports = {
  PARAMETROS_POSICAO,
  UNIDADE,
  arredondar,
  quantil,
  percentil,
  posicaoNoHistorico,
  parametrosPosicao,
  criarFatorPosicaoSemanal
};
