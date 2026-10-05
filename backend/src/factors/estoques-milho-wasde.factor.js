"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");

// FATOR (PROPOSTA, ADR 0050): estoques e balanço, fator "Estoques globais e balanço oferta/demanda (WASDE)" do FEL 1
// para o milho. A regra é a R-EST-01/02 v0 do David ("Motor do Milho", 2026-10-02, ADR 0055), com os limiares dele;
// o que o FinMind acrescentou para caber no motor está marcado abaixo. Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation), uma edição do WASDE por mês (ADR 0015), cada série com todas as revisões:
//     WASDE.MILHO.EUA.ENDING_STOCKS / USE_TOTAL                         - EUA, milhões de bushels
//     WASDE.MILHO.MUNDO.<WORLD|WORLD_LESS_CHINA>.ENDING_STOCKS / DOMESTIC_TOTAL / EXPORTS / IMPORTS - milhões de t
//   e, só como CONTEXTO, fora da conta (ADR 0071), o balanço da Conab, mensal, desde fev/2025 (safras desde 2018/19):
//     CONAB.MILHO.BALANCO.ESTOQUE_FINAL / DEMANDA_TOTAL - Brasil, mil t
//   fator (calculado sob demanda, NUNCA gravado), um ponto por EDIÇÃO (o que ela dizia, com o que se sabia nela):
//     A. o estoque/uso da safra mais nova da edição (a projeção): estoque final ÷ uso total, em %. EUA: o uso total
//        do WASDE. Mundo e mundo menos a China: consumo interno + exportação - importação (no mundo, as duas se anulam;
//        sem a China, sobra o que vai para ela)
//     B. o percentil do estoque/uso contra as 10 safras anteriores, como a edição as conhecia (posição na ordem, com
//        meio peso para empate); a POSIÇÃO = percentil - 50, em pontos (0 é a mediana); e a revisão do estoque final
//        dos EUA contra a edição anterior, em %
//     C. R-EST v0 do David: estoque/uso dos EUA no P25 ou abaixo (posição -25 ou menos), OU o estoque final revisado
//        3% ou mais para baixo -> pressão de ALTA; no P75 ou acima, OU revisado 3% ou mais para cima -> de BAIXA.
//        Acréscimos do FinMind (parâmetros, ajustáveis pelo Comitê): nível e revisão em sentidos opostos dão neutra;
//        intensidade FORTE com os dois no mesmo sentido ou no P10/P90 (posição 40 ou mais), MODERADA com um só;
//        tendência pela posição de 3 edições antes
//
// A região do nível é a dos EUA (o mercado de Chicago, que chega ao CCM pela paridade); o mundo, o mundo menos a China
// e o Brasil (Conab) vão na camada B como contexto (decisão do usuário, ADR 0071: os EUA decidem; o Brasil entra na
// conta quando houver as 10 safras do percentil). Propriedades: determinístico, versionado, point-in-time (cada edição
// só com o que já tinha sido publicado), sem IA.

const FACTOR_ID = "estoques_milho_wasde";
// v2 (2026-10-05): o estoque/uso do Brasil (Conab) como contexto, fora da conta (ADR 0071).
const FACTOR_VERSION = 2;

const PREFIXO_EUA = "WASDE.MILHO.EUA";
const PREFIXO_MUNDO = "WASDE.MILHO.MUNDO";
const SERIES = Object.freeze({
  euaEstoque: `${PREFIXO_EUA}.ENDING_STOCKS`,
  euaUso: `${PREFIXO_EUA}.USE_TOTAL`,
  ...Object.fromEntries(
    ["WORLD", "WORLD_LESS_CHINA"].flatMap((regiao) =>
      ["ENDING_STOCKS", "DOMESTIC_TOTAL", "EXPORTS", "IMPORTS"].map((campo) => [`${regiao}.${campo}`, `${PREFIXO_MUNDO}.${regiao}.${campo}`])
    )
  )
});

const SAFRAS_PERCENTIL = 10;

// O contexto do Brasil (ADR 0071): o balanço da Conab, lido à parte (o WASDE agrupa as edições pela publicação).
const SERIES_CONAB = Object.freeze({ estoque: "CONAB.MILHO.BALANCO.ESTOQUE_FINAL", demanda: "CONAB.MILHO.BALANCO.DEMANDA_TOTAL" });
// Um boletim da Conab só entra se for de até 60 dias antes do limite (a Conab publica todo mês).
const DIAS_CONAB_RECENTE = 60;

// Padrões (2026-10-04). Do David (R-EST v0): o P25/P75 (posição 25) e a revisão de 3%. Do FinMind: o forte no P10/P90
// (posição 40) e a tendência (3 edições, 20 pontos de percentil). A janela da tendência é em EDIÇÕES (a chave é a dos
// fatores semanais).
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 25,
  limiarFortePct: 40,
  semanasTendencia: 3,
  limiarTendenciaPp: 20,
  limiarRevisaoPct: 3
});

// Posição acima da mediana = estoque folgado = mais oferta: pressão de baixa.
const ACIMA_PRESSIONA = faixa.DIRECAO.BAIXA;
const ROTULOS_TENDENCIA = { SUBINDO: "Estoque afrouxando", CAINDO: "Estoque apertando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// "2026-09-01" -> "2026/27": a safra (o WASDE grava a safra no 1º de setembro do ano em que começa, ADR 0015).
function rotuloSafra(observedAt) {
  const ano = Number(observedAt.slice(0, 4));
  return `${ano}/${String((ano + 1) % 100).padStart(2, "0")}`;
}

function safraAnterior(observedAt, anos) {
  return `${Number(observedAt.slice(0, 4)) - anos}${observedAt.slice(4)}`;
}

// Percentil de `valor` entre `anteriores`, em ordem: (menores + meia vez os iguais) ÷ n. Com 10 safras sem empate, vai
// de 5 (o menor de todos) a 95 (o maior).
function percentil(valor, anteriores) {
  const menores = anteriores.filter((v) => v < valor).length;
  const iguais = anteriores.filter((v) => v === valor).length;
  return arredondar(((menores + iguais / 2) / anteriores.length) * 100, 1);
}

// O que a edição sabia: série -> safra -> valor.
function valorDe(estado, serie, safra) {
  return estado.get(serie)?.get(safra);
}

function estoqueUsoEua(estado, safra) {
  const estoque = valorDe(estado, SERIES.euaEstoque, safra);
  const uso = valorDe(estado, SERIES.euaUso, safra);
  return estoque !== undefined && uso ? (estoque / uso) * 100 : null;
}

function estoqueUsoMundo(estado, regiao, safra) {
  const [estoque, consumo, exportacao, importacao] = ["ENDING_STOCKS", "DOMESTIC_TOTAL", "EXPORTS", "IMPORTS"].map((campo) =>
    valorDe(estado, SERIES[`${regiao}.${campo}`], safra)
  );
  if ([estoque, consumo, exportacao, importacao].some((v) => v === undefined)) return null;
  const uso = consumo + exportacao - importacao;
  return uso > 0 ? (estoque / uso) * 100 : null;
}

// Estoque/uso de uma safra e o percentil contra as 10 anteriores (todas precisam existir na edição).
function nivelComPercentil(estado, safra, calcular) {
  const atual = calcular(estado, safra);
  if (atual === null) return { valor: null, percentil: null };
  const anteriores = [];
  for (let k = 1; k <= SAFRAS_PERCENTIL; k += 1) {
    const v = calcular(estado, safraAnterior(safra, k));
    if (v === null) return { valor: arredondar(atual, 2), percentil: null };
    anteriores.push(v);
  }
  return { valor: arredondar(atual, 2), percentil: percentil(atual, anteriores) };
}

const OPOSTA = { ALTA: "BAIXA", BAIXA: "ALTA" };

// A direção que a revisão do estoque final dá sozinha (R-EST v0: 3% ou mais).
function direcaoDaRevisao(revisaoPct, limiarRevisaoPct) {
  if (revisaoPct === null || revisaoPct === undefined) return faixa.DIRECAO.NEUTRA;
  if (revisaoPct <= -limiarRevisaoPct) return faixa.DIRECAO.ALTA;
  if (revisaoPct >= limiarRevisaoPct) return faixa.DIRECAO.BAIXA;
  return faixa.DIRECAO.NEUTRA;
}

// Camada C (função pura): o nível pela decisão por faixa sobre a posição; a revisão como segunda condição.
function decidirEstoques(posicao, posicaoAnterior, revisaoPct, parametros) {
  const nivel = faixa.decidirPorFaixa(posicao, posicaoAnterior, parametros, ACIMA_PRESSIONA);
  if (!nivel) return null;
  const porRevisao = direcaoDaRevisao(revisaoPct, parametros.limiarRevisaoPct);
  const porNivel = nivel.direcao;

  let direcao = porNivel;
  let intensidade = nivel.intensidade;
  let conflito = false;
  if (porNivel === faixa.DIRECAO.NEUTRA && porRevisao !== faixa.DIRECAO.NEUTRA) {
    direcao = porRevisao;
    intensidade = faixa.INTENSIDADE.MODERADA;
  } else if (porNivel !== faixa.DIRECAO.NEUTRA && porRevisao === porNivel) {
    intensidade = faixa.INTENSIDADE.FORTE;
  } else if (porNivel !== faixa.DIRECAO.NEUTRA && porRevisao === OPOSTA[porNivel]) {
    direcao = faixa.DIRECAO.NEUTRA;
    intensidade = faixa.INTENSIDADE.FRACA;
    conflito = true;
  }
  return {
    direcao,
    intensidade,
    tendencia: nivel.tendencia,
    mudancaPp: nivel.mudancaPp,
    // O que cada condição deu sozinha (a explicação e a tela mostram as duas).
    porNivel,
    intensidadeNivel: nivel.intensidade,
    porRevisao,
    conflito
  };
}

const dataBr = (iso) => iso.split("-").reverse().join("/");
const milT = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

// O estoque/uso do Brasil que valia numa edição do WASDE, só contexto: o boletim da Conab mais recente publicado antes de
// `limite` (quando a edição seguinte saiu; null = a última, até o asOf), a safra mais nova dele. null sem boletim recente.
function contextoBrasil(linhasConab, observedAt, limite) {
  const ate = limite ? new Date(limite) : null;
  // O boletim precisa ser recente: até 60 dias antes do limite (ou da edição, na última).
  const corte = (ate || new Date(`${observedAt}T00:00:00Z`)).getTime() - DIAS_CONAB_RECENTE * 86400000;
  const valores = new Map();
  let boletim = null;
  for (const linha of linhasConab) {
    const em = new Date(linha.publishedAt);
    if (ate && em >= ate) continue;
    const chave = `${linha.seriesCode}|${linha.observedAt}`;
    const atual = valores.get(chave);
    if (!atual || em > atual.em) valores.set(chave, { em, valor: linha.value });
    if (!boletim || em > boletim) boletim = em;
  }
  if (!boletim || boletim.getTime() < corte) return { estoqueUsoBrasil: null, estoqueUsoBrasilDetalhe: null };
  const safras = [...valores.keys()].filter((k) => k.startsWith(SERIES_CONAB.estoque)).map((k) => k.split("|")[1]).sort();
  const safra = safras.at(-1);
  const estoque = valores.get(`${SERIES_CONAB.estoque}|${safra}`)?.valor;
  const demanda = valores.get(`${SERIES_CONAB.demanda}|${safra}`)?.valor;
  if (estoque === undefined || !demanda) return { estoqueUsoBrasil: null, estoqueUsoBrasilDetalhe: null };
  const estoqueUso = arredondar((estoque / demanda) * 100, 2);
  return {
    estoqueUsoBrasil: `${estoqueUso.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% (safra ${rotuloSafra(safra)})`,
    estoqueUsoBrasilDetalhe:
      `Estoque final de ${milT(estoque)} mil t ÷ demanda total de ${milT(demanda)} mil t, Conab de ${dataBr(boletim.toISOString().slice(0, 10))}. ` +
      `Só contexto, fora da conta: a base tem as safras desde 2018/19, menos que as 10 do percentil da regra.`
  };
}

// Função PURA: recebe as linhas de obterVersoesAsOf() do WASDE (todas as versões, em ordem de publicação) e, como
// contexto, as da Conab, e devolve um ponto por edição do WASDE (a data da publicação). Uma edição que não mudou
// nenhuma das séries do WASDE não aparece (diria o mesmo que a anterior).
function derivarEstoquesMilho(linhasVersoes, { parametros = PARAMETROS_PADRAO, linhasConab = [] } = {}) {
  const porEdicao = new Map();
  for (const linha of linhasVersoes) {
    const edicao = new Date(linha.publishedAt).toISOString().slice(0, 10);
    if (!porEdicao.has(edicao)) porEdicao.set(edicao, []);
    porEdicao.get(edicao).push(linha);
  }

  const estado = new Map();
  const pontos = [];
  let anterior = null;
  const edicoes = [...porEdicao.keys()].sort();
  edicoes.forEach((edicao, indice) => {
    for (const linha of porEdicao.get(edicao)) {
      if (!estado.has(linha.seriesCode)) estado.set(linha.seriesCode, new Map());
      estado.get(linha.seriesCode).set(linha.observedAt, linha.value);
    }
    const safras = [...(estado.get(SERIES.euaEstoque)?.keys() || [])].sort();
    const safra = safras.at(-1);
    if (!safra) return;

    const eua = nivelComPercentil(estado, safra, estoqueUsoEua);
    const exChina = nivelComPercentil(estado, safra, (e, s) => estoqueUsoMundo(e, "WORLD_LESS_CHINA", s));
    const mundo = nivelComPercentil(estado, safra, (e, s) => estoqueUsoMundo(e, "WORLD", s));
    const estoqueFinal = valorDe(estado, SERIES.euaEstoque, safra);
    // A revisão é contra o que a edição anterior dizia da MESMA safra (a 1ª edição de uma safra nova não tem).
    const estoqueAntes = anterior?.safra === safra ? anterior.estoqueFinalEua : null;
    const revisao = estoqueAntes ? arredondar((estoqueFinal / estoqueAntes - 1) * 100, 2) : null;
    const posicao = eua.percentil === null ? null : arredondar(eua.percentil - 50, 1);
    const posicaoAnterior = pontos.at(-parametros.semanasTendencia)?.posicaoEua ?? null;

    const ponto = {
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: edicao,
      safra: rotuloSafra(safra),
      estoqueFinalEua: arredondar(estoqueFinal, 0),
      estoqueUsoEuaPct: eua.valor,
      percentilEua: eua.percentil,
      posicaoEua: posicao,
      revisaoEstoqueEuaPct: revisao,
      estoqueUsoExChinaPct: exChina.valor,
      percentilExChina: exChina.percentil,
      estoqueUsoMundoPct: mundo.valor,
      percentilMundo: mundo.percentil,
      ...contextoBrasil(linhasConab, edicao, edicoes[indice + 1] ? porEdicao.get(edicoes[indice + 1])[0].publishedAt : null),
      decisao: decidirEstoques(posicao, posicaoAnterior, revisao, parametros),
      disponivelEm: porEdicao.get(edicao)[0].publishedAt,
      disponivelEmEhEstimado: porEdicao.get(edicao)[0].publishedAtIsEstimated
    };
    pontos.push(ponto);
    anterior = { safra, estoqueFinalEua: estoqueFinal };
  });
  return pontos;
}

async function calcularEstoquesMilho({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [linhas, linhasConab] = await Promise.all([
    servico.obterVersoesAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps),
    servico.obterVersoesAsOf({ seriesCodes: Object.values(SERIES_CONAB), asOf }, deps)
  ]);
  return derivarEstoquesMilho(linhas, { parametros, linhasConab });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

const TEXTOS = {
  campo: "posicaoEua",
  janela: "edições",
  unidade: " pontos",
  unidadeMudanca: " pontos",
  primeiroPasso: (p) =>
    `WASDE de ${p.observedAt.split("-").reverse().join("/")}, safra ${p.safra}: estoque/uso dos EUA de ` +
    `${faixa.fmt(p.estoqueUsoEuaPct)}% (A), no percentil ${faixa.fmt(p.percentilEua, 0)} das 10 safras anteriores: ` +
    `posição ${faixa.comSinal(p.posicaoEua, 0)} pontos contra a mediana (B).`,
  nomeValor: "a posição",
  abaixo: "estoque/uso entre os mais baixos das 10 safras anteriores é estoque apertado",
  acima: "estoque/uso entre os mais altos das 10 safras anteriores é estoque folgado",
  subindo: "o estoque está afrouxando",
  caindo: "o estoque está apertando",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const NOME_DIRECAO = { ALTA: "pressão de alta", BAIXA: "pressão de baixa", NEUTRA: "neutra" };

function explicarEstoques(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  // Os passos do nível (decisão por faixa) e, depois, a revisão e como as duas se combinam.
  const passos = faixa.explicarPorFaixa({ ...ponto, decisao: { ...d, direcao: d.porNivel, intensidade: d.intensidadeNivel } }, parametros, TEXTOS);
  const limiar = faixa.fmt(parametros.limiarRevisaoPct, 1);
  if (ponto.revisaoEstoqueEuaPct === null) {
    passos.push("Revisão: primeira edição desta safra, sem a anterior para comparar.");
  } else {
    passos.push(
      `Revisão: o estoque final dos EUA mudou ${faixa.comSinal(ponto.revisaoEstoqueEuaPct)}% contra a edição anterior ` +
        `(limiar de ${limiar}%) → ${NOME_DIRECAO[d.porRevisao]}.`
    );
  }
  if (d.conflito) passos.push("Combinação: nível e revisão em sentidos opostos → Neutra.");
  else if (d.porNivel !== "NEUTRA" && d.porRevisao === d.porNivel) passos.push(`Combinação: nível e revisão no mesmo sentido → ${faixa.ROTULOS.direcao[d.direcao]}, Forte.`);
  else if (d.porNivel === "NEUTRA" && d.porRevisao !== "NEUTRA") passos.push(`Combinação: só a revisão dá direção → ${faixa.ROTULOS.direcao[d.direcao]}, Moderada.`);
  else passos.push(`Combinação: vale o nível → ${faixa.ROTULOS.direcao[d.direcao]}.`);
  return passos;
}

const EPISODIOS = [
  { data: "2020-08-12", rotulo: "Safra 2020/21 projetada folgada, antes da compra chinesa" },
  { data: "2022-06-10", rotulo: "Safra 2022/23 com o mundo em guerra na Ucrânia" },
  { data: "2024-01-12", rotulo: "Safra 2023/24 recorde nos EUA" }
];
const CENARIOS = [
  { valor: -45, valorAnterior: -25, revisao: -4, rotulo: "O mais apertado em 10 safras, revisado para baixo" },
  { valor: -35, valorAnterior: -35, revisao: 0, rotulo: "Apertado (P15), sem revisão" },
  { valor: 5, valorAnterior: 5, revisao: -3.5, rotulo: "Perto da mediana, revisado 3,5% para baixo" },
  { valor: 35, valorAnterior: 15, revisao: -4, rotulo: "Folgado (P85), mas revisado para baixo" },
  { valor: 45, valorAnterior: 25, revisao: 5, rotulo: "O mais folgado em 10 safras, revisado para cima" }
];

function exemplosEstoques(pontosTodos, parametros = PARAMETROS_PADRAO) {
  const porData = new Map(pontosTodos.map((ponto) => [ponto.observedAt, ponto]));
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      // A edição do mês do episódio (a data exata pode não ser a da publicação).
      const ponto = porData.get(data) || pontosTodos.find((p) => p.observedAt.slice(0, 7) === data.slice(0, 7));
      return { data: ponto?.observedAt || data, rotulo, valor: ponto?.posicaoEua ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map(({ valor, valorAnterior, revisao, rotulo }) => ({
      rotulo,
      valor,
      valorAnterior,
      decisao: decidirEstoques(valor, valorAnterior, revisao, parametros)
    }))
  };
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    { camada: "A", rotulo: "Safra da edição", campo: "safra" },
    { camada: "A", rotulo: "Estoque/uso dos EUA", campo: "estoqueUsoEuaPct", casas: 2, unidadeValor: "%", secundario: { prefixo: "estoque final de", campo: "estoqueFinalEua", casas: 0, sufixo: "milhões de bushels" } },
    { camada: "B", rotulo: "Percentil contra as 10 safras anteriores (EUA)", campo: "percentilEua", casas: 0 },
    { camada: "B", rotulo: "Posição contra a mediana (EUA)", campo: "posicaoEua", casas: 0, sinal: true, unidadeValor: " pontos" },
    { camada: "B", rotulo: "Revisão do estoque final dos EUA contra a edição anterior", campo: "revisaoEstoqueEuaPct", casas: 2, sinal: true, unidadeValor: "%" },
    // Sem o percentil: o WASDE só tem o mundo menos a China desde a safra 2017/18 (10 safras anteriores em 2027/28).
    { camada: "B", rotulo: "Estoque/uso do mundo menos a China (contexto)", campo: "estoqueUsoExChinaPct", casas: 2, unidadeValor: "%" },
    { camada: "B", rotulo: "Estoque/uso do mundo (contexto)", campo: "estoqueUsoMundoPct", casas: 2, unidadeValor: "%", secundario: { prefixo: "percentil", campo: "percentilMundo", casas: 0 } },
    { camada: "B", rotulo: "Estoque/uso do Brasil, Conab (contexto, fora da conta)", campo: "estoqueUsoBrasil", detalhe: "estoqueUsoBrasilDetalhe" }
  ],
  graficoAB: {
    titulo: "Estoque/uso da safra de cada edição do WASDE (A), EUA e mundo menos a China, em %",
    unidade: "%",
    casas: 2,
    exigeCampo: "estoqueUsoEuaPct",
    series: [
      { campo: "estoqueUsoEuaPct", rotulo: "EUA (A)" },
      { campo: "estoqueUsoExChinaPct", rotulo: "Mundo menos a China (contexto)" }
    ]
  },
  graficoC: {
    titulo: "Posição do estoque/uso dos EUA contra a mediana das 10 safras anteriores (B) e as faixas da decisão (C)",
    campo: "posicaoEua",
    rotulo: "Posição contra a mediana (B)",
    unidade: "pontos"
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    ...faixa.parametrosFaixa({ unidade: "pontos", unidadeMudanca: "pontos", janela: "edições" }),
    {
      chave: "limiarRevisaoPct",
      rotulo: "Revisão do estoque final",
      unidade: "%",
      explicacao: "A partir dessa revisão contra a edição anterior, para baixo ou para cima, a revisão sozinha dá direção (R-EST v0 do David: 3%)."
    }
  ],
  // A 2ª condição da regra, no texto do prompt (texto-prompt.js), com os parâmetros em uso.
  regraAdicional:
    "pressão também pela revisão do estoque final dos EUA contra a edição anterior, de {limiarRevisaoPct}% ou mais (para baixo, de alta; para cima, de baixa); nível e revisão em sentidos opostos dão neutra, no mesmo sentido dão forte; decidem os EUA: o mundo, o mundo menos a China e o Brasil (Conab) são contexto",
  exemplos: { colunaValor: "Posição (pontos)" },
  nota:
    "Mensal, não é tempo real: o USDA publica o WASDE por volta do dia 10, ao meio-dia de Nova York. A safra é a mais " +
    "nova da edição (a projeção). Estoque/uso = estoque final ÷ uso total; no mundo, uso = consumo + exportação - importação."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "MENSAL",
  calcular: calcularEstoquesMilho,
  explicar: explicarEstoques,
  exemplos: exemplosEstoques,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIES,
  SERIES_CONAB,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  percentil,
  decidirEstoques,
  derivarEstoquesMilho,
  calcularEstoquesMilho
};
