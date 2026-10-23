"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarDias } = require("./base/semana-de-dias");
const { PARAMETROS_POSICAO, UNIDADE, arredondar, posicaoNoHistorico, parametrosPosicao } = require("./modelos/posicao-historica");

// FATOR (PROPOSTA, ADR 0060): clima nas regiões de arábica, fator "Clima e eventos meteorológicos" do FEL 1 para o
// café, como o F1 do Motor do Café v1 (2026-10-04). Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation):
//     NOAA_VH.CAFE.BR_<UF>.VHI - a saúde da vegetação (VHI, 0 a 100) sobre a área de café de MG, SP, ES e BA, semanal
//       desde 1982 (NOAA STAR, ADR 0031)
//     CONAB.CAFE.<UF>.PRODUCAO_ARABICA - a produção de arábica por UF (Conab), para os pesos
//   fator (calculado sob demanda, NUNCA gravado), um ponto por semana da NOAA:
//     A. o VHI de cada UF; o VHI ponderado pela participação de cada UF na produção de arábica da safra mais nova que a
//        Conab tinha publicado (o "ponderadas pela participação de cada polo" do estudo)
//     B. o percentil do VHI de cada UF contra a mesma semana dos 30 anos anteriores (a "média climatológica de 30 anos"
//        do estudo; mínimo de 20 anos); a posição relativa ponderada (percentil - 50, pelos mesmos pesos)
//     C. as regras candidatas do estudo: estresse da lavoura nas fases críticas pesa para ALTA; condição regular, para
//        BAIXA; regiões divergentes ou dentro das bandas históricas, neutra. O "[CALIBRAR]" vira a posição contra o
//        próprio histórico da mesma semana (abaixo do percentil 20 = estresse fora do normal), calibração do FinMind.
//        Só decide nas janelas críticas do estudo: geada de junho a agosto, florada e pegamento de setembro a novembro;
//        de dezembro a maio, neutra (a medida continua na tela)
//
// Antes do 1º levantamento da Conab na base (jan/2023), os pesos são os desse levantamento (aproximação marcada no
// ponto). Fora da conta, sem o dado: chuva, temperatura mínima, horas de frio e balanço hídrico das estações do INMET
// (fonte nova) e o Paraná (sem região na NOAA). A geada é um evento: vem da leitura diária de eventos, não do VHI. O
// estudo diz: um alerta de clima já lido aqui não soma de novo quando aparecer na revisão de safra do F2 (dupla
// contagem). Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "clima_cafe_vhi_arabica";
// v2 (2026-10-21): o El Niño e a La Niña (RONI do NOAA CPC) como contexto de regime, fora da conta (análise do café
// de 2026-10-19, item E6; decisão do usuário, ADR 0134).
// v3 (2026-10-23): a pressão do El Niño no LONGO, ao lado da leitura do VHI: com o RONI publicado de +1,0 ou mais, alta
// fraca, só nesse horizonte (a regra do ADR 0143, aprovada pelo Comitê em 2026-10-22; ADR 0143, adendo). Abaixo disso e
// nos outros horizontes, o RONI continua só como contexto. A decisão do F1 continua a do VHI.
const FACTOR_VERSION = 3;
const SERIE_RONI = "NOAA_CPC.ENSO.RONI";
const TRIMESTRES = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"];
// O El Niño que pressiona (v3, ADR 0143): o RONI publicado de +1,0 ou mais (o moderado da escala do CPC), só no LONGO,
// com uma intensidade só, fraca (no histórico, o forte não foi melhor que o moderado). A La Niña não mostrou sentido
// estável: fica como contexto.
const EL_NINO = Object.freeze({ limiar: 1.0, horizonte: "LONGO", direcao: "ALTA", intensidade: "FRACA" });
const NOME_TRIMESTRE = ["dez-fev", "jan-mar", "fev-abr", "mar-mai", "abr-jun", "mai-jul", "jun-ago", "jul-set", "ago-out", "set-nov", "out-dez", "nov-jan"];

// A força pela escala do CPC (o valor absoluto do RONI): neutro abaixo de 0,5; fraco, moderado, forte e muito forte a
// partir de 0,5, 1,0, 1,5 e 2,0.
function faseEnso(valor) {
  const forca = Math.abs(valor);
  if (forca < 0.5) return "neutro";
  const nome = valor > 0 ? "El Niño" : "La Niña";
  const feminino = valor < 0;
  if (forca < 1) return `${nome} ${feminino ? "fraca" : "fraco"}`;
  if (forca < 1.5) return `${nome} ${feminino ? "moderada" : "moderado"}`;
  if (forca < 2) return `${nome} forte`;
  return `${nome} muito forte`;
}

// O RONI conhecido em `ate` (ISO): o trimestre mais novo publicado até lá, na versão vigente; e o de 3 meses antes.
function ensoConhecido(versoesRoni, ate) {
  const vigente = new Map();
  for (const v of versoesRoni) {
    if (v.publishedAt > ate) continue;
    const atual = vigente.get(v.observedAt);
    if (!atual || v.publishedAt >= atual.publishedAt) vigente.set(v.observedAt, v);
  }
  const meses = [...vigente.keys()].sort();
  if (meses.length === 0) return null;
  const ultimo = vigente.get(meses.at(-1));
  const tresAntes = vigente.get(anosAntesMeses(meses.at(-1), 3));
  const mes = Number(ultimo.observedAt.slice(5, 7));
  const ano = Number(ultimo.observedAt.slice(0, 4));
  const pressiona = ultimo.value >= EL_NINO.limiar;
  const periodo = `${NOME_TRIMESTRE[mes - 1]}/${ano}`;
  const texto =
    `${periodo} (${TRIMESTRES[mes - 1]}): ${faseEnso(ultimo.value)}` +
    (tresAntes ? `; 3 meses antes, ${faixa.comSinal(tresAntes.value, 2)} °C (${faseEnso(tresAntes.value)})` : "") +
    (pressiona
      ? `. Com o RONI de ${faixa.comSinal(EL_NINO.limiar, 1)} ou mais, pressão de alta fraca só no horizonte LONGO (abaixo).`
      : `. Contexto de regime, sem pressão própria (a pressão do El Niño, só no LONGO, liga com o RONI de ${faixa.comSinal(EL_NINO.limiar, 1)} ou mais).`);
  // A pressão adicional do El Niño (v3): uma leitura ao lado da do VHI, só no LONGO.
  const pressoesAdicionais = pressiona
    ? [
        {
          origem: "El Niño",
          horizonte: EL_NINO.horizonte,
          direcao: EL_NINO.direcao,
          intensidade: EL_NINO.intensidade,
          texto: `RONI de ${faixa.comSinal(ultimo.value, 2)} °C em ${periodo}, acima de ${faixa.comSinal(EL_NINO.limiar, 1)}`
        }
      ]
    : [];
  return { roni: ultimo.value, roniTexto: texto, pressoesAdicionais };
}

// "AAAA-MM-01" menos `n` meses.
function anosAntesMeses(mesIso, n) {
  const d = new Date(`${mesIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

const UFS = ["MG", "SP", "ES", "BA"];
const SERIES_VHI = Object.fromEntries(UFS.map((uf) => [uf, `NOAA_VH.CAFE.BR_${uf}.VHI`]));
const SERIES_CONAB = Object.fromEntries(UFS.map((uf) => [uf, `CONAB.CAFE.${uf}.PRODUCAO_ARABICA`]));
const ANOS_COMPARACAO = 30;
const ANOS_MINIMOS = 20;
const TOLERANCIA_DIAS = 3;
const MESES_CRITICOS = [6, 7, 8, 9, 10, 11];

const PARAMETROS_PADRAO = PARAMETROS_POSICAO;
const ROTULOS_TENDENCIA = { SUBINDO: "Lavoura melhorando", CAINDO: "Lavoura piorando", ESTAVEL: "Estável" };

// O valor da série no dia `alvo`, ou no mais próximo dentro da tolerância (as semanas da NOAA não caem no mesmo dia da
// semana em anos diferentes).
function valorPerto(serie, alvo) {
  if (serie.has(alvo)) return serie.get(alvo);
  for (let d = 1; d <= TOLERANCIA_DIAS; d += 1) {
    if (serie.has(somarDias(alvo, -d))) return serie.get(somarDias(alvo, -d));
    if (serie.has(somarDias(alvo, d))) return serie.get(somarDias(alvo, d));
  }
  return undefined;
}

// A mesma data `k` anos antes (29/02 vira 28/02).
function anosAntes(dataIso, k) {
  const ano = Number(dataIso.slice(0, 4)) - k;
  const resto = dataIso.slice(4) === "-02-29" ? "-02-28" : dataIso.slice(4);
  return `${ano}${resto}`;
}

// Os pesos de arábica que a Conab tinha publicado até `ate`: a participação de cada UF na safra mais nova.
function pesosAte(versoesConab, ate) {
  const conhecidas = versoesConab.filter((v) => v.publishedAt <= ate);
  if (conhecidas.length === 0) return null;
  const safra = conhecidas.map((v) => v.observedAt).sort().at(-1);
  const producao = {};
  for (const v of conhecidas) if (v.observedAt === safra) producao[v.uf] = v.value;
  const total = Object.values(producao).reduce((a, b) => a + b, 0);
  return total > 0 ? Object.fromEntries(Object.entries(producao).map(([uf, p]) => [uf, p / total])) : null;
}

// Função PURA: as linhas do VHI (obterAsOf) e as versões da Conab (obterVersoesAsOf) -> um ponto por semana.
function derivarClimaCafe(linhasVhi, versoesConab, { parametros = PARAMETROS_PADRAO, versoesRoni = [] } = {}) {
  const roni = versoesRoni
    .filter((v) => v.seriesCode === SERIE_RONI)
    .map((v) => ({ observedAt: v.observedAt, value: v.value, publishedAt: new Date(v.publishedAt).toISOString() }));
  const ufDaSerie = Object.fromEntries(UFS.map((uf) => [SERIES_VHI[uf], uf]));
  const series = Object.fromEntries(UFS.map((uf) => [uf, new Map()]));
  const publicacao = new Map();
  for (const l of linhasVhi) {
    const uf = ufDaSerie[l.seriesCode];
    if (!uf) continue;
    series[uf].set(l.observedAt, l.value);
    const atual = publicacao.get(l.observedAt);
    const em = new Date(l.publishedAt).toISOString();
    if (!atual || em > atual.em) publicacao.set(l.observedAt, { em, estimado: l.publishedAtIsEstimated });
  }
  const ufDaConab = Object.fromEntries(UFS.map((uf) => [SERIES_CONAB[uf], uf]));
  const conab = versoesConab
    .filter((v) => ufDaConab[v.seriesCode])
    .map((v) => ({ ...v, uf: ufDaConab[v.seriesCode], publishedAt: new Date(v.publishedAt).toISOString() }));
  const primeiraPublicacao = conab.map((v) => v.publishedAt).sort()[0];
  const pesosIniciais = primeiraPublicacao ? pesosAte(conab, primeiraPublicacao) : null;

  const posicoes = [];
  const pontos = [];
  for (const observedAt of [...series.MG.keys()].sort()) {
    const { em: disponivelEm, estimado } = publicacao.get(observedAt);
    const pesosReais = pesosAte(conab, disponivelEm);
    const pesos = pesosReais || pesosIniciais;
    const porUf = {};
    for (const uf of UFS) {
      const valor = series[uf].get(observedAt);
      const anteriores = [];
      for (let k = 1; k <= ANOS_COMPARACAO; k += 1) {
        const v = valorPerto(series[uf], anosAntes(observedAt, k));
        if (v !== undefined) anteriores.push(v);
      }
      porUf[uf] = { valor, ...posicaoNoHistorico(valor ?? null, anteriores, ANOS_MINIMOS) };
    }
    const ponderar = (campo) => {
      if (!pesos) return null;
      let soma = 0;
      let pesoTotal = 0;
      for (const uf of UFS) {
        const v = porUf[uf][campo];
        if (v === null || v === undefined || !pesos[uf]) continue;
        soma += pesos[uf] * v;
        pesoTotal += pesos[uf];
      }
      return pesoTotal >= 0.5 ? arredondar(soma / pesoTotal, campo === "posicaoRelativa" ? 1 : 2) : null;
    };
    const posicaoRelativa = ponderar("posicaoRelativa");
    posicoes.push(posicaoRelativa);
    const anterior = posicoes.length > parametros.semanasTendencia ? posicoes.at(-1 - parametros.semanasTendencia) : null;
    const mes = Number(observedAt.slice(5, 7));
    const foraDaJanela = !MESES_CRITICOS.includes(mes);
    let decisao = faixa.decidirPorFaixa(posicaoRelativa, anterior ?? null, parametros, faixa.DIRECAO.BAIXA);
    if (decisao && foraDaJanela) decisao = { ...decisao, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, foraDaJanela: true };
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      vhiPonderado: ponderar("valor"),
      vhiMg: porUf.MG.valor ?? null,
      vhiSp: porUf.SP.valor ?? null,
      vhiEs: porUf.ES.valor ?? null,
      vhiBa: porUf.BA.valor ?? null,
      pesoMgPct: pesos?.MG ? arredondar(pesos.MG * 100, 1) : null,
      pesosAproximados: !pesosReais && Boolean(pesos),
      medianaPonderada: ponderar("mediana"),
      p10Ponderado: ponderar("p10"),
      p90Ponderado: ponderar("p90"),
      posicaoRelativa,
      decisao,
      roni: null,
      roniTexto: null,
      pressoesAdicionais: [],
      ...ensoConhecido(roni, disponivelEm),
      disponivelEm,
      disponivelEmEhEstimado: estimado
    });
  }
  return pontos;
}

async function calcularClimaCafe({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [linhasVhi, versoesConab, versoesRoni] = await Promise.all([
    servico.obterAsOf({ seriesCodes: Object.values(SERIES_VHI), asOf }, deps),
    servico.obterVersoesAsOf({ seriesCodes: Object.values(SERIES_CONAB), asOf }, deps),
    servico.obterVersoesAsOf({ seriesCodes: [SERIE_RONI], asOf }, deps)
  ]);
  return derivarClimaCafe(linhasVhi, versoesConab, { parametros, versoesRoni });
}

const TEXTOS = {
  campo: "posicaoRelativa",
  primeiroPasso: (p) =>
    `Na semana de ${p.observedAt.split("-").reverse().join("/")}, o VHI sobre o café ficou em ${faixa.fmt(p.vhiPonderado, 1)} ` +
    `(ponderado pelo arábica de cada UF; MG pesa ${faixa.fmt(p.pesoMgPct, 1)}%${p.pesosAproximados ? ", pesos do 1º levantamento da Conab na base, aproximação" : ""}) (A). ` +
    `Contra a mesma semana dos 30 anos anteriores, a posição relativa ponderada é de ${faixa.comSinal(p.posicaoRelativa, 1)}${UNIDADE} (B).`,
  nomeValor: "a posição relativa",
  abaixo: "a lavoura está mais estressada que o normal para a semana, risco para a safra",
  acima: "a lavoura está mais saudável que o normal para a semana, safra favorecida",
  subindo: "a condição da lavoura está melhorando",
  caindo: "a condição da lavoura está piorando",
  rotulosTendencia: ROTULOS_TENDENCIA,
  unidade: UNIDADE,
  unidadeMudanca: UNIDADE
};

function explicarClimaCafe(ponto, parametros = PARAMETROS_PADRAO) {
  const passos = faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
  if (ponto?.decisao?.foraDaJanela) {
    passos.splice(1, 2, "Direção: fora das janelas críticas do estudo (geada de junho a agosto; florada e pegamento de setembro a novembro) → Neutra, sem intensidade.");
  }
  for (const p of ponto?.pressoesAdicionais || []) {
    passos.push(`${p.origem}, só no ${p.horizonte}: ${p.texto} → pressão de alta, fraca, ao lado da leitura do VHI (ADR 0143).`);
  }
  return passos;
}

function exemplosClimaCafe(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, {
    campo: TEXTOS.campo,
    acimaPressiona: faixa.DIRECAO.BAIXA,
    episodios: [
      { data: "2021-07-22", rotulo: "Semana da geada de julho de 2021" },
      { data: "2024-09-15", rotulo: "Seca de 2024, antes da florada" }
    ],
    cenarios: [
      { valor: -42, valorAnterior: -25, rotulo: "Lavoura bem pior que o normal, piorando" },
      { valor: -10, valorAnterior: -12, rotulo: "Um pouco abaixo do normal" },
      { valor: 35, valorAnterior: 20, rotulo: "Lavoura melhor que o normal" }
    ]
  });
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    { camada: "A", rotulo: "VHI ponderado pelo arábica", campo: "vhiPonderado", casas: 1, sufixo: "0 = estresse extremo, 100 = ótima" },
    { camada: "A", rotulo: "VHI de Minas Gerais", campo: "vhiMg", casas: 1, secundario: { prefixo: "peso de MG:", campo: "pesoMgPct", casas: 1, sufixo: "%" } },
    { camada: "A", rotulo: "VHI de São Paulo", campo: "vhiSp", casas: 1 },
    { camada: "B", rotulo: "Mediana da mesma semana em 30 anos (ponderada)", campo: "medianaPonderada", casas: 1 },
    { camada: "B", rotulo: "Posição relativa ponderada (percentil - 50)", campo: "posicaoRelativa", casas: 1, sinal: true, sufixo: "pontos" },
    // ADR 0134: o regime, fora da conta.
    { camada: "B", rotulo: "El Niño / La Niña (RONI do NOAA CPC, contexto)", campo: "roni", casas: 2, sinal: true, unidadeValor: " °C", detalhe: "roniTexto" }
  ],
  graficoAB: {
    titulo: "VHI ponderado pelo arábica (A) × a faixa da mesma semana em 30 anos (B)",
    unidade: "índice 0-100",
    casas: 1,
    exigeCampo: "medianaPonderada",
    series: [
      { campo: "vhiPonderado", rotulo: "VHI ponderado (A)" },
      { campo: "p90Ponderado", rotulo: "Percentil 90 (B)" },
      { campo: "medianaPonderada", rotulo: "Mediana (B)" },
      { campo: "p10Ponderado", rotulo: "Percentil 10 (B)" }
    ]
  },
  graficoC: { titulo: "Posição relativa ponderada (B) e as faixas da decisão (C)", campo: "posicaoRelativa", rotulo: "Posição relativa (B)", unidade: "pontos" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: parametrosPosicao(),
  regraAdicional: "decide só de junho a novembro (geada; florada e pegamento); de dezembro a maio, neutra. No LONGO, o ano todo, o El Niño (RONI publicado de +1,0 ou mais) soma uma pressão de alta fraca ao lado da do VHI",
  exemplos: { colunaValor: "Posição relativa", unidade: "pontos" },
  nota:
    "Semanal, não é tempo real: o VHI da NOAA STAR sobre a área de café de MG, SP, ES e BA, ponderado pela produção de " +
    "arábica da Conab. Mede a vegetação por satélite; a geada em si vem da leitura diária de eventos."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularClimaCafe,
  explicar: explicarClimaCafe,
  exemplos: exemplosClimaCafe,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, PARAMETROS_PADRAO, SERIE_RONI, EL_NINO, METODOLOGIA, derivarClimaCafe, anosAntes, faseEnso };
