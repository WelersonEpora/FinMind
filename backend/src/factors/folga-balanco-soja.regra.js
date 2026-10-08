"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const s = require("./modelos/soja-comum");
const { SERIES_EDICAO } = require("./oferta-eua-soja.factor");

// REGRA R2 da soja: a folga do balanço (proposta da soja v2.2, §2.6; aprovada pelo Comitê, com o David, em 2026-10-08,
// ADR 0116). Regra de INTENSIDADE: com o balanço apertado, um choque de F1, F2 ou F3 tende a mover mais o preço; com o
// folgado, menos. Muda a intensidade do fator, nunca a direção nem o peso; não vale para o F4. Sem peso e sem direção:
// o nível do estoque não é notícia e já está no preço (§2.6).
//
// OBSERVÁVEL → REGRA (ver ADR 0008):
//   observáveis (observation), cada edição do WASDE com as versões (ADR 0111):
//     WASDE.SOJA.EUA.ENDING_STOCKS / USE_TOTAL - o estoque final e o uso total dos EUA (milhões de bushels)
//     WASDE.SOJA.MUNDO.WORLD.ENDING_STOCKS / DOMESTIC_TOTAL - o mundo, só contexto
//   e, só como contexto, o Grain Stocks (USDA.GRAIN_STOCKS.SOYBEANS.TOTAL, mil bushels, ADR 0113)
//   regra (calculada sob demanda, NUNCA gravada), um ponto por edição do WASDE:
//     A. o estoque final sobre o uso dos EUA na safra mais nova da edição, em %
//     B. o percentil contra as edições do MESMO MÊS nos anos anteriores (§2.8: o nível, não a variação, para não contar de
//        novo o choque), com o que cada uma sabia; posição = percentil - 50
//     estado: APERTADO até o percentil 20 (posição de -30 ou menos), FOLGADO a partir do 80 (+30 ou mais), NORMAL no meio
//     (os limites aprovados, §2.15, item 5). Com menos de 5 anos de histórico (as edições começam em 2011), sem estado.
// A forma do efeito (quanto a intensidade muda, se é simétrico) fica para a etapa da agregação: no prompt, a regra diz só
// o sentido. Determinístico, point-in-time, sem IA.

const FACTOR_ID = "folga_balanco_soja";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  estoque: "WASDE.SOJA.EUA.ENDING_STOCKS",
  uso: "WASDE.SOJA.EUA.USE_TOTAL",
  estoqueMundo: "WASDE.SOJA.MUNDO.WORLD.ENDING_STOCKS",
  consumoMundo: "WASDE.SOJA.MUNDO.WORLD.DOMESTIC_TOTAL",
  grainStocks: "USDA.GRAIN_STOCKS.SOYBEANS.TOTAL"
});
// O mínimo de anos com a edição do mesmo mês (calibração do FinMind: com a base desde 2011, o estado começa em 2016).
const MINIMO_ANOS = 5;

// Os limites aprovados: apertado até o percentil 20, folgado a partir do 80 (posição de 30 pontos).
const PARAMETROS_PADRAO = Object.freeze({ limiarModeradoPct: 30 });

const ESTADOS = {
  APERTADO: { codigo: "APERTADO", rotulo: "Apertado" },
  NORMAL: { codigo: "NORMAL", rotulo: "Normal" },
  FOLGADO: { codigo: "FOLGADO", rotulo: "Folgado" }
};
const EFEITO = {
  APERTADO: "um choque de F1, F2 ou F3 tende a mover MAIS o preço: a intensidade do fator pesa mais; a direção não muda",
  NORMAL: "não muda a intensidade de nenhum fator",
  FOLGADO: "um choque de F1, F2 ou F3 tende a mover MENOS o preço: a intensidade do fator pesa menos; a direção não muda"
};

function estadoDaPosicao(posicao, parametros) {
  if (posicao === null || posicao === undefined) return null;
  if (posicao <= -parametros.limiarModeradoPct) return ESTADOS.APERTADO;
  if (posicao >= parametros.limiarModeradoPct) return ESTADOS.FOLGADO;
  return ESTADOS.NORMAL;
}

const safraMaisNova = (indice, edicao) =>
  [...(indice.get(SERIES.estoque)?.keys() || [])].filter((safra) => s.versaoEm(indice, SERIES.estoque, safra, edicao)).sort().at(-1) || null;

function razao(indice, serieA, serieB, safra, edicao) {
  const a = s.valorEm(indice, serieA, safra, edicao);
  const b = s.valorEm(indice, serieB, safra, edicao);
  return a !== null && b ? s.arredondar((a / b) * 100, 2) : null;
}

// Função PURA: as versões do WASDE e do Grain Stocks -> um ponto por edição do WASDE. `ate`: o último dia dos pontos.
function derivarFolgaBalancoSoja(versoes, { parametros = PARAMETROS_PADRAO, ate = null } = {}) {
  const indice = s.indexarVersoes(versoes);
  const edicoes = s.diasDePublicacao(versoes, (l) => l.seriesCode.startsWith("WASDE.")).filter((d) => !ate || d <= ate);
  const posicoesGs = [...(indice.get(SERIES.grainStocks)?.keys() || [])].sort();
  // A 1ª edição de cada (ano, mês), com o estoque/uso da safra mais nova dela: o histórico do mesmo mês.
  const porMes = new Map();
  const pontos = [];
  for (const edicao of edicoes) {
    const safra = safraMaisNova(indice, edicao);
    if (!safra) continue;
    const valor = razao(indice, SERIES.estoque, SERIES.uso, safra, edicao);
    const chave = edicao.slice(0, 7);
    if (!porMes.has(chave) && valor !== null) porMes.set(chave, valor);
    const mes = edicao.slice(5, 7);
    const anteriores = [...porMes.entries()].filter(([k]) => k.slice(5) === mes && k.slice(0, 4) < edicao.slice(0, 4)).map(([, v]) => v);
    const pos = s.posicaoNoHistorico(valor, anteriores, MINIMO_ANOS);
    const estado = estadoDaPosicao(pos.posicao, parametros);
    const mundo = razao(indice, SERIES.estoqueMundo, SERIES.consumoMundo, safra, edicao);
    // O Grain Stocks mais recente que já tinha sido publicado na edição (a versão daquele dia, não a revista depois).
    const posicaoGs = posicoesGs.filter((data) => s.versaoEm(indice, SERIES.grainStocks, data, edicao)).at(-1);
    const gs = posicaoGs ? { observedAt: posicaoGs, valor: s.valorEm(indice, SERIES.grainStocks, posicaoGs, edicao) } : null;
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: edicao,
      safra: s.rotuloSafra(safra),
      estoqueUsoEuaPct: valor,
      estoqueUsoTexto: valor === null ? "sem dado" : `${s.fmt(valor, 2)}% (estoque final ÷ uso total dos EUA), safra ${s.rotuloSafra(safra)}, WASDE de ${s.dataBr(edicao)}`,
      percentilMesmoMes: pos.percentil,
      posicao: pos.posicao,
      percentilTexto:
        pos.percentil === null
          ? `sem histórico mínimo: ${pos.n} ano(s) com a edição do mesmo mês, de ${MINIMO_ANOS}`
          : `percentil ${s.fmt(pos.percentil)} entre as edições do mesmo mês em ${pos.n} anos anteriores`,
      contextoTexto:
        [mundo !== null ? `estoque/uso mundial (estoque final ÷ consumo) de ${s.fmt(mundo, 1)}%` : null, gs ? `Grain Stocks de 1º/${s.dataBr(gs.observedAt).slice(3)}: ${s.fmt(gs.valor / 1000, 0)} milhões de bushels` : null]
          .filter(Boolean)
          .join("; ") || "-",
      estado: estado ? { codigo: estado.codigo, rotulo: estado.rotulo } : null,
      estadoTexto: estado ? `${estado.rotulo}` : "sem estado (histórico curto)",
      efeitoTexto: estado ? EFEITO[estado.codigo] : "sem efeito",
      decisao: null,
      disponivelEm: s.versaoEm(indice, SERIES.estoque, safra, edicao)?.em || `${edicao}T16:00:00.000Z`,
      disponivelEmEhEstimado: false
    });
  }
  return pontos;
}

async function calcularFolgaBalancoSoja({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const versoes = await servico.obterVersoesAsOf({ seriesCodes: [...new Set([...Object.values(SERIES), ...SERIES_EDICAO])], asOf }, deps);
  return derivarFolgaBalancoSoja(versoes, { parametros, ate: s.diaDe(asOf) });
}

function explicarFolgaBalancoSoja(ponto) {
  if (!ponto) return [];
  return [
    `Estoque/uso: ${ponto.estoqueUsoTexto}.`,
    `Comparação: ${ponto.percentilTexto}.`,
    `Estado: ${ponto.estadoTexto}. Efeito: ${ponto.efeitoTexto}.`,
    `Contexto: ${ponto.contextoTexto}.`
  ];
}

const EPISODIOS = [
  { data: "2019-05-15", rotulo: "Guerra comercial: estoque recorde nos EUA" },
  { data: "2021-01-15", rotulo: "A China comprando: estoque apertado" },
  { data: "2026-09-15", rotulo: "WASDE de setembro de 2026" }
];

function exemplosFolgaBalancoSoja(pontos) {
  return s.exemplosPorData(pontos, EPISODIOS, "posicao");
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    { camada: "A", rotulo: "Estoque/uso dos EUA", campo: "estoqueUsoTexto" },
    { camada: "B", rotulo: "Contra as edições do mesmo mês", campo: "percentilTexto" },
    { camada: "B", rotulo: "Contexto", campo: "contextoTexto" }
  ],
  graficoAB: {
    titulo: "Estoque final ÷ uso total dos EUA na safra mais nova de cada edição do WASDE, em %",
    unidade: "%",
    casas: 2,
    exigeCampo: "estoqueUsoEuaPct",
    series: [{ campo: "estoqueUsoEuaPct", rotulo: "Estoque/uso dos EUA (A)" }]
  },
  graficoC: {
    titulo: "Posição do estoque/uso contra as edições do mesmo mês (B) e os limites da regra",
    campo: "posicao",
    rotulo: "Posição (percentil - 50)",
    unidade: "pontos",
    limiares: [
      { chave: "limiarModeradoPct", sinal: 1, rotulo: "Folgado (percentil 80)" },
      { chave: "limiarModeradoPct", sinal: -1, rotulo: "Apertado (percentil 20)" }
    ]
  },
  rotulosDecisao: s.ROTULOS_DECISAO,
  parametros: [
    {
      chave: "limiarModeradoPct",
      rotulo: "Limite do apertado e do folgado",
      unidade: "pontos",
      explicacao: "A partir dessa posição (percentil - 50), para baixo o balanço é apertado e para cima, folgado (aprovado: percentis 20 e 80, 30 pontos)."
    }
  ],
  semTendencia: true,
  regra:
    "o estoque final sobre o uso dos EUA (WASDE), no percentil das edições do mesmo mês nos anos anteriores: apertado com a posição em -{limiarModeradoPct} pontos ou menos, folgado em +{limiarModeradoPct} ou mais; muda a intensidade dos choques de F1, F2 e F3, nunca a direção; não vale para o F4",
  exemplos: { colunaValor: "Posição (pontos)" },
  nota: "Mensal, não é tempo real: o WASDE sai por volta do dia 10. O estoque mundial e o Grain Stocks são contexto."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "PUBLICACAO",
  calcular: calcularFolgaBalancoSoja,
  explicar: explicarFolgaBalancoSoja,
  exemplos: exemplosFolgaBalancoSoja,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, estadoDaPosicao, derivarFolgaBalancoSoja, calcularFolgaBalancoSoja };
