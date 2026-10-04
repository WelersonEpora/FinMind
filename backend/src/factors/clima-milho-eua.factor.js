"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { mediaMesmaSemana, DIAS_SEMANA, SEMANAS_ANO } = require("./base/mesma-semana-5-anos");

// FATOR (PROPOSTA, ADR 0056): clima e safra nos EUA, fator "Clima e safra nos EUA (Crop Progress)" do FEL 1 para o
// milho. A regra é a R-CLI v0 do David ("Motor do Milho", 2026-10-02, ADR 0055), com os limiares dele; o que o FinMind
// acrescentou está marcado. Camadas A e B calculadas, C simulada. Não é decisão por faixa: os limiares de alta e de
// baixa são diferentes, e a baixa pede semanas seguidas.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation), USDA NASS Crop Progress, semanal (o domingo do fim da semana), de maio a novembro:
//     USDA.CORN.CONDITION.GOOD / EXCELLENT - % da lavoura em condição boa e excelente
//     USDA.CORN.PROGRESS.SILKING           - % da lavoura em polinização (ou depois)
//   fator (calculado sob demanda, NUNCA gravado):
//     A. boaExcelentePct = boa + excelente; variacaoSemanalPp = contra a semana anterior; polinizacaoPct
//     B. media5AnosPct = a média da mesma semana nos 5 anos anteriores; desvioPp = boa + excelente - média; o percentil
//        da mesma semana nos 10 anos anteriores (contexto)
//     C. R-CLI v0, só de junho a agosto (fora disso, neutra): desvio de -5 p.p. ou pior, OU queda de 3 p.p. ou mais na
//        semana -> pressão de ALTA; desvio de +3 p.p. ou mais por 3 semanas seguidas -> de BAIXA. A condição da previsão
//        do NOAA/CPC (calor e seca em 8 a 14 dias, na alta; "sem previsão adversa", na baixa) NÃO é aplicada: o dado
//        não é coletado. Acréscimos do FinMind: alta forte com as duas condições; baixa forte com a polinização
//        concluída (90% ou mais, o que o David descreve como "sobe para Alto"); alta e baixa juntas dão neutra;
//        tendência pelo desvio de 2 semanas antes
//
// O peso do mês (Alto em julho; Médio em junho e agosto; Baixo de setembro em diante) é do David e vai no ponto como
// texto, sem entrar na conta. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "clima_milho_eua_crop_progress";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  boa: "USDA.CORN.CONDITION.GOOD",
  excelente: "USDA.CORN.CONDITION.EXCELLENT",
  polinizacao: "USDA.CORN.PROGRESS.SILKING"
});

// Os meses em que a regra do David vale (jun a ago).
const MESES_DA_REGRA = [6, 7, 8];
const ANOS_PERCENTIL = 10;
const POLINIZACAO_CONCLUIDA = 90;

// Do David (R-CLI v0): -5 p.p. contra a média, queda de 3 p.p. na semana, +3 p.p. por 3 semanas. Do FinMind: a
// tendência (2 semanas, 3 p.p.). O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarAltaPp: 5,
  limiarQuedaSemanalPp: 3,
  limiarBaixaPp: 3,
  semanasSeguidas: 3,
  semanasTendencia: 2,
  limiarTendenciaPp: 3
});

const ROTULOS_TENDENCIA = { SUBINDO: "Lavoura melhorando", CAINDO: "Lavoura piorando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function pesoDoMes(mes) {
  if (mes === 7) return "Alto";
  if (mes === 6 || mes === 8) return "Médio";
  if (mes >= 9) return "Baixo";
  return "Fora da regra";
}

// Percentil da mesma semana nos 10 anos anteriores (com meio peso para empate), ou null se faltar algum.
function percentilMesmaSemana(valorEm, data, valor) {
  const anteriores = [];
  for (let k = 1; k <= ANOS_PERCENTIL; k += 1) {
    const v = valorEm(somarDias(data, -DIAS_SEMANA * SEMANAS_ANO * k));
    if (v === null || v === undefined) return null;
    anteriores.push(v);
  }
  const menores = anteriores.filter((v) => v < valor).length;
  const iguais = anteriores.filter((v) => v === valor).length;
  return arredondar(((menores + iguais / 2) / ANOS_PERCENTIL) * 100, 1);
}

// Camada C (função pura). `entrada`: { mes, desvioPp, variacaoSemanalPp, desviosAnteriores (as semanas seguidas
// anteriores, da mais recente para trás; null onde não há), desvioTendencia, polinizacaoConcluida }.
function decidirClima(entrada, parametros = PARAMETROS_PADRAO) {
  const { mes, desvioPp, variacaoSemanalPp, desviosAnteriores = [], desvioTendencia = null, polinizacaoConcluida = false } = entrada;
  if (desvioPp === null || desvioPp === undefined) return null;

  let tendencia = null;
  let mudancaPp = null;
  if (desvioTendencia !== null && desvioTendencia !== undefined) {
    mudancaPp = arredondar(desvioPp - desvioTendencia, 2);
    if (Math.abs(mudancaPp) < parametros.limiarTendenciaPp) tendencia = faixa.TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.SUBINDO;
  }
  const base = { tendencia, mudancaPp };
  if (!MESES_DA_REGRA.includes(mes)) {
    return { ...base, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, foraDaJanela: true };
  }

  const altaPeloNivel = desvioPp <= -parametros.limiarAltaPp;
  const altaPelaQueda = variacaoSemanalPp !== null && variacaoSemanalPp !== undefined && variacaoSemanalPp <= -parametros.limiarQuedaSemanalPp;
  const seguidas = [desvioPp, ...desviosAnteriores].slice(0, parametros.semanasSeguidas);
  const baixa = seguidas.length === parametros.semanasSeguidas && seguidas.every((d) => d !== null && d !== undefined && d >= parametros.limiarBaixaPp);
  const alta = altaPeloNivel || altaPelaQueda;
  const condicoes = { altaPeloNivel, altaPelaQueda, baixa, foraDaJanela: false };

  if (alta && baixa) return { ...base, ...condicoes, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, conflito: true };
  if (alta) {
    const intensidade = altaPeloNivel && altaPelaQueda ? faixa.INTENSIDADE.FORTE : faixa.INTENSIDADE.MODERADA;
    return { ...base, ...condicoes, direcao: faixa.DIRECAO.ALTA, intensidade };
  }
  if (baixa) {
    const intensidade = polinizacaoConcluida ? faixa.INTENSIDADE.FORTE : faixa.INTENSIDADE.MODERADA;
    return { ...base, ...condicoes, direcao: faixa.DIRECAO.BAIXA, intensidade };
  }
  return { ...base, ...condicoes, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA };
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana com a condição da lavoura.
function derivarClimaMilho(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const porSerie = { boa: new Map(), excelente: new Map(), polinizacao: new Map() };
  const disponivel = new Map();
  const campoDa = Object.fromEntries(Object.entries(SERIES).map(([campo, codigo]) => [codigo, campo]));
  for (const linha of linhasAsOf) {
    const campo = campoDa[linha.seriesCode];
    if (!campo) continue;
    porSerie[campo].set(linha.observedAt, linha.value);
    if (campo !== "polinizacao") {
      const atual = disponivel.get(linha.observedAt);
      if (!atual || linha.publishedAt > atual.em) disponivel.set(linha.observedAt, { em: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
    }
  }
  const boaExcelente = new Map();
  for (const [data, boa] of porSerie.boa) {
    const excelente = porSerie.excelente.get(data);
    if (excelente !== undefined) boaExcelente.set(data, boa + excelente);
  }
  const valorEm = (data) => boaExcelente.get(data);

  const desvios = new Map();
  const maiorPolinizacaoNoAno = new Map();
  const pontos = [];
  for (const observedAt of [...boaExcelente.keys()].sort()) {
    const ge = boaExcelente.get(observedAt);
    const anterior = boaExcelente.get(somarDias(observedAt, -DIAS_SEMANA));
    const media = mediaMesmaSemana(valorEm, observedAt);
    const desvio = media === null ? null : arredondar(ge - media, 2);
    desvios.set(observedAt, desvio);

    const ano = observedAt.slice(0, 4);
    const polinizacao = porSerie.polinizacao.get(observedAt) ?? null;
    if (polinizacao !== null) maiorPolinizacaoNoAno.set(ano, Math.max(maiorPolinizacaoNoAno.get(ano) || 0, polinizacao));
    const variacao = anterior === undefined ? null : arredondar(ge - anterior, 2);
    const mes = Number(observedAt.slice(5, 7));
    const desviosAnteriores = [];
    for (let k = 1; k < parametros.semanasSeguidas; k += 1) desviosAnteriores.push(desvios.get(somarDias(observedAt, -DIAS_SEMANA * k)) ?? null);

    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      boaExcelentePct: ge,
      variacaoSemanalPp: variacao,
      polinizacaoPct: polinizacao,
      media5AnosPct: media === null ? null : arredondar(media, 1),
      desvioPp: desvio,
      percentil10Anos: percentilMesmaSemana(valorEm, observedAt, ge),
      pesoDoMes: pesoDoMes(mes),
      decisao: decidirClima(
        {
          mes,
          desvioPp: desvio,
          variacaoSemanalPp: variacao,
          desviosAnteriores,
          desvioTendencia: desvios.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia)) ?? null,
          polinizacaoConcluida: (maiorPolinizacaoNoAno.get(ano) || 0) >= POLINIZACAO_CONCLUIDA
        },
        parametros
      ),
      disponivelEm: disponivel.get(observedAt).em,
      disponivelEmEhEstimado: disponivel.get(observedAt).estimado
    });
  }
  return pontos;
}

async function calcularClimaMilho({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarClimaMilho(linhas, { parametros });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

const pp = (n) => `${faixa.comSinal(n, 1)} p.p.`;

function explicarClima(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  const passos = [
    `Semana até ${ponto.observedAt.split("-").reverse().join("/")}: ${faixa.fmt(ponto.boaExcelentePct, 0)}% da lavoura em ` +
      `condição boa ou excelente (A), contra ${faixa.fmt(ponto.media5AnosPct, 1)}% na média da mesma semana dos 5 anos ` +
      `anteriores: ${pp(ponto.desvioPp)} (B).`
  ];
  if (d.foraDaJanela) {
    passos.push("Direção: a regra do especialista vale de junho a agosto; fora disso → Neutra.");
  } else {
    const limAlta = faixa.fmt(parametros.limiarAltaPp, 1);
    const limQueda = faixa.fmt(parametros.limiarQuedaSemanalPp, 1);
    passos.push(
      `Alta: ${pp(ponto.desvioPp)} ${d.altaPeloNivel ? "está" : "não está"} ${limAlta} p.p. ou mais abaixo da média; a ` +
        `variação na semana, ${ponto.variacaoSemanalPp === null ? "sem dado" : pp(ponto.variacaoSemanalPp)}, ` +
        `${d.altaPelaQueda ? "é" : "não é"} uma queda de ${limQueda} p.p. ou mais.`
    );
    passos.push(
      `Baixa: ${d.baixa ? "o desvio está" : "o desvio não está"} ${faixa.fmt(parametros.limiarBaixaPp, 1)} p.p. ou mais acima da média ` +
        `nas últimas ${parametros.semanasSeguidas} semanas seguidas.`
    );
    passos.push("A condição da previsão do NOAA/CPC da regra do especialista não é aplicada: o dado não é coletado.");
    if (d.conflito) passos.push("Combinação: alta e baixa ao mesmo tempo → Neutra.");
    else passos.push(`Direção: ${faixa.ROTULOS.direcao[d.direcao]}, intensidade ${faixa.ROTULOS.intensidade[d.intensidade].toLowerCase()}.`);
  }
  if (d.tendencia) {
    passos.push(`Tendência: há ${parametros.semanasTendencia} semanas o desvio era ${pp(ponto.desvioPp - d.mudancaPp)} → ${ROTULOS_TENDENCIA[d.tendencia]}.`);
  }
  passos.push(`Peso do mês na proposta do especialista: ${ponto.pesoDoMes} (não entra na conta).`);
  return passos;
}

const EPISODIOS = [
  { data: "2012-07-15", rotulo: "Seca de 2012 no cinturão do milho" },
  { data: "2014-07-20", rotulo: "Lavoura excelente em 2014" },
  { data: "2020-08-16", rotulo: "Derecho de agosto de 2020" },
  { data: "2023-06-25", rotulo: "Seca-relâmpago de junho de 2023" }
];
const CENARIOS = [
  { rotulo: "Julho, 8 p.p. abaixo da média e caindo 4 p.p. na semana", mes: 7, desvioPp: -8, variacaoSemanalPp: -4, desviosAnteriores: [-4, -2] },
  { rotulo: "Junho, 6 p.p. abaixo da média, estável na semana", mes: 6, desvioPp: -6, variacaoSemanalPp: 0, desviosAnteriores: [-6, -6] },
  { rotulo: "Julho, na média, mas caindo 3 p.p. na semana", mes: 7, desvioPp: 0, variacaoSemanalPp: -3, desviosAnteriores: [3, 3] },
  { rotulo: "Agosto, 4 p.p. acima da média há 3 semanas, polinização concluída", mes: 8, desvioPp: 4, variacaoSemanalPp: 0, desviosAnteriores: [4, 5], polinizacaoConcluida: true },
  { rotulo: "Setembro, 10 p.p. abaixo da média (fora da regra)", mes: 9, desvioPp: -10, variacaoSemanalPp: -2, desviosAnteriores: [-8, -8] }
];

function exemplosClima(pontosTodos, parametros = PARAMETROS_PADRAO) {
  const porData = new Map(pontosTodos.map((ponto) => [ponto.observedAt, ponto]));
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      const ponto = porData.get(data);
      return { data, rotulo, valor: ponto?.desvioPp ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map(({ rotulo, ...entrada }) => ({
      rotulo,
      valor: entrada.desvioPp,
      valorAnterior: entrada.desviosAnteriores[0],
      decisao: decidirClima(entrada, parametros)
    }))
  };
}

const APRESENTACAO = {
  unidade: "p.p.",
  quadros: [
    {
      camada: "A",
      rotulo: "Lavoura em condição boa ou excelente",
      campo: "boaExcelentePct",
      casas: 0,
      unidadeValor: "%",
      secundario: { prefixo: "variação na semana:", campo: "variacaoSemanalPp", casas: 0, sinal: true, sufixo: "p.p." }
    },
    { camada: "A", rotulo: "Lavoura em polinização (ou depois)", campo: "polinizacaoPct", casas: 0, unidadeValor: "%" },
    { camada: "B", rotulo: "Média da mesma semana nos 5 anos anteriores", campo: "media5AnosPct", casas: 1, unidadeValor: "%" },
    { camada: "B", rotulo: "Desvio contra a média", campo: "desvioPp", casas: 1, sinal: true, unidadeValor: " p.p." },
    { camada: "B", rotulo: "Percentil da mesma semana nos 10 anos anteriores", campo: "percentil10Anos", casas: 0 },
    { camada: "B", rotulo: "Peso do mês na proposta do especialista (fora da conta)", campo: "pesoDoMes" }
  ],
  graficoAB: {
    titulo: "Lavoura em condição boa ou excelente (A) × a média da mesma semana nos 5 anos anteriores (B), em %",
    unidade: "%",
    casas: 0,
    exigeCampo: "media5AnosPct",
    series: [
      { campo: "boaExcelentePct", rotulo: "Boa + excelente (A)" },
      { campo: "media5AnosPct", rotulo: "Média de 5 anos (B)" }
    ]
  },
  graficoC: {
    titulo: "Desvio contra a média de 5 anos (B) e os limiares da regra (C)",
    campo: "desvioPp",
    rotulo: "Desvio (B)",
    unidade: "p.p.",
    limiares: [
      { chave: "limiarBaixaPp", sinal: 1, rotulo: "Limiar de baixa (acima da média, semanas seguidas)" },
      { chave: "limiarAltaPp", sinal: -1, rotulo: "Limiar de alta (abaixo da média)" }
    ]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarAltaPp", rotulo: "Limiar de alta", unidade: "p.p.", explicacao: "Boa + excelente esse tanto ou mais abaixo da média de 5 anos da mesma semana pesa para alta (R-CLI-01 v0: 5)." },
    { chave: "limiarQuedaSemanalPp", rotulo: "Queda na semana", unidade: "p.p.", explicacao: "Uma queda desse tanto ou mais em uma semana também pesa para alta (R-CLI-01 v0: 3)." },
    { chave: "limiarBaixaPp", rotulo: "Limiar de baixa", unidade: "p.p.", explicacao: "Boa + excelente esse tanto ou mais acima da média, por semanas seguidas, pesa para baixa (R-CLI-02 v0: 3)." },
    { chave: "semanasSeguidas", rotulo: "Semanas seguidas (baixa)", unidade: "semanas", explicacao: "Por quantas semanas seguidas o desvio precisa ficar acima do limiar de baixa (R-CLI-02 v0: 3)." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: "semanas", explicacao: "Contra quantas semanas atrás o desvio é comparado para dizer se a lavoura está melhorando ou piorando." },
    { chave: "limiarTendenciaPp", rotulo: "Mudança mínima da tendência", unidade: "p.p.", explicacao: "Quanto o desvio precisa mudar na janela para não ser considerado estável." }
  ],
  regra:
    "só de junho a agosto (fora disso, neutra): pressão de alta com a lavoura boa + excelente {limiarAltaPp} p.p. ou mais abaixo da média de 5 anos da mesma semana, ou com queda de {limiarQuedaSemanalPp} p.p. ou mais na semana (forte com as duas); de baixa com ela {limiarBaixaPp} p.p. ou mais acima da média por {semanasSeguidas} semanas seguidas (forte com a polinização concluída); alta e baixa juntas dão neutra; tendência pelo desvio de {semanasTendencia} semanas antes, mudança mínima de {limiarTendenciaPp} p.p.; a condição da previsão do NOAA/CPC da regra do especialista não é aplicada (o dado não é coletado)",
  exemplos: { colunaValor: "Desvio (p.p.)" },
  nota:
    "Semanal, não é tempo real: o USDA publica o Crop Progress às segundas, 16h de Nova York, com a semana até o domingo; " +
    "a condição da lavoura sai de maio/junho a outubro. Mede os EUA (Chicago): no CCM, o efeito chega pela paridade."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularClimaMilho,
  explicar: explicarClima,
  exemplos: exemplosClima,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, decidirClima, derivarClimaMilho, calcularClimaMilho };
