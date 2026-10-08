"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const s = require("./modelos/soja-comum");

// FATOR F3 da soja: demanda pela soja dos EUA, exportação e esmagamento (proposta da soja v2.2, §2.5; aprovada pelo
// Comitê, com o David, em 2026-10-08, ADR 0116). O outro lado do preço: o fator lê o choque NOVO na demanda, nunca o
// nível.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation), cada edição do WASDE com as versões (ADR 0111):
//     WASDE.SOJA.EUA.EXPORTS / CRUSHINGS - a exportação e o esmagamento dos EUA (milhões de bushels)
//     WASDE.SOJA.MUNDO.CHINA.IMPORTS     - a importação da China (milhões de t), só contexto
//   fator (calculado sob demanda, NUNCA gravado), um ponto por edição do WASDE:
//     A. o uso dos EUA (exportação + esmagamento) na safra mais nova da edição
//     B. a revisão contra a edição anterior (a mesma safra), em %, e a posição dela entre as revisões das edições
//        anteriores (soja-comum.js); a revisão da importação da China, como contexto
//     C. demanda revista para cima pressiona para alta; para baixo, para baixa. O 1º número de uma safra (a edição de
//        maio) não tem revisão: neutra. Fase 1: mensal; nos horizontes de 1 e 7 dias, a demanda só chega pelos eventos
//        (F4). A margem de esmagamento (observável candidato) não entra: só depois do teste (ADR 0116).
// Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "demanda_eua_soja";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  exportacao: "WASDE.SOJA.EUA.EXPORTS",
  esmagamento: "WASDE.SOJA.EUA.CRUSHINGS",
  china: "WASDE.SOJA.MUNDO.CHINA.IMPORTS"
});

// As séries que marcam os dias das edições (as do F1): numa edição sem mudança no uso, a revisão é zero.
const { SERIES_EDICAO } = require("./oferta-eua-soja.factor");

const PARAMETROS_PADRAO = s.PARAMETROS_POSICAO_SOJA;
// Mais demanda pressiona para alta.
const ACIMA = s.DIRECAO.ALTA;

// A safra mais nova que a edição tem para a exportação dos EUA.
function safraMaisNova(indice, edicao) {
  return [...(indice.get(SERIES.exportacao)?.keys() || [])].filter((safra) => s.versaoEm(indice, SERIES.exportacao, safra, edicao)).sort().at(-1) || null;
}

// Função PURA: as versões do WASDE -> um ponto por edição, com a decisão do F3. `ate`: o último dia dos pontos.
function derivarDemandaEuaSoja(versoes, { parametros = PARAMETROS_PADRAO, ate = null } = {}) {
  const indice = s.indexarVersoes(versoes);
  const edicoes = s.diasDePublicacao(versoes).filter((d) => !ate || d <= ate);
  const revisoes = [];
  const pontos = [];
  for (const edicao of edicoes) {
    const safra = safraMaisNova(indice, edicao);
    if (!safra) continue;
    const uso = [SERIES.exportacao, SERIES.esmagamento].map((serie) => s.valorEm(indice, serie, safra, edicao));
    const revisao = s.revisaoNaEdicao(indice, [SERIES.exportacao, SERIES.esmagamento], safra, edicao);
    const pos = revisao ? s.posicaoNoHistorico(revisao.revisaoPct, revisoes.map((r) => r.revisaoPct)) : { percentil: null, posicao: null, n: revisoes.length };
    const china = s.revisaoNaEdicao(indice, [SERIES.china], safra, edicao);
    const leitura = revisao ? s.decidirPosicao(pos.posicao, parametros, ACIMA) : { direcao: s.DIRECAO.NEUTRA, intensidade: s.INTENSIDADE.FRACA };
    const usoTotal = uso.every((v) => v !== null) ? uso[0] + uso[1] : null;
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: edicao,
      safra: s.rotuloSafra(safra),
      usoTexto:
        usoTotal === null
          ? "sem dado"
          : `${s.fmt(usoTotal, 0)} milhões de bushels (exportação ${s.fmt(uso[0], 0)} + esmagamento ${s.fmt(uso[1], 0)}), safra ${s.rotuloSafra(safra)}`,
      revisaoUsoPct: revisao?.revisaoPct ?? null,
      revisaoTexto: revisao
        ? `${s.comSinal(revisao.revisaoPct)}% contra a edição anterior (${s.fmt(revisao.antes, 0)}); ` +
          (pos.percentil === null ? `sem histórico mínimo (${pos.n} revisões de ${s.MINIMO_HISTORICO})` : `percentil ${s.fmt(pos.percentil)} entre as ${pos.n} revisões das edições anteriores`)
        : "1º número desta safra: sem revisão (neutra)",
      chinaTexto: china ? `importação da China na mesma safra ${s.comSinal(china.revisaoPct)}% contra a edição anterior (${s.fmt(china.depois, 1)} milhões de t)` : "-",
      posicaoDecisiva: pos.posicao,
      decisao: pos.posicao === null && revisao ? null : s.decisaoDoPonto(leitura),
      leituraTexto: revisao ? (pos.posicao === null ? "sem leitura: histórico curto" : s.descreverLeitura(leitura)) : "neutra: o 1º número da safra não tem revisão",
      disponivelEm: s.versaoEm(indice, SERIES.exportacao, safra, edicao)?.em || `${edicao}T16:00:00.000Z`,
      disponivelEmEhEstimado: false
    });
    if (revisao) revisoes.push({ edicao, revisaoPct: revisao.revisaoPct });
  }
  return pontos;
}

async function calcularDemandaEuaSoja({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const versoes = await servico.obterVersoesAsOf({ seriesCodes: [...new Set([...Object.values(SERIES), ...SERIES_EDICAO])], asOf }, deps);
  return derivarDemandaEuaSoja(versoes, { parametros, ate: s.diaDe(asOf) });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

function explicarDemandaEuaSoja(ponto) {
  if (!ponto?.decisao) return [];
  return [
    `WASDE de ${s.dataBr(ponto.observedAt)}: uso dos EUA de ${ponto.usoTexto}.`,
    `Revisão: ${ponto.revisaoTexto}.`,
    `Contexto: ${ponto.chinaTexto}.`,
    `Leitura: ${ponto.leituraTexto} (demanda revista para cima pressiona para alta).`
  ];
}

const EPISODIOS = [
  { data: "2018-07-15", rotulo: "Guerra comercial: a China taxa a soja dos EUA" },
  { data: "2020-11-15", rotulo: "A volta das compras da China" },
  { data: "2023-01-15", rotulo: "Esmagamento recorde pelo diesel renovável" },
  { data: "2026-09-15", rotulo: "WASDE de setembro de 2026" }
];

function exemplosDemandaEuaSoja(pontos) {
  return s.exemplosPorData(pontos, EPISODIOS, "posicaoDecisiva");
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    { camada: "A", rotulo: "Uso dos EUA (exportação + esmagamento)", campo: "usoTexto" },
    { camada: "B", rotulo: "Revisão do uso", campo: "revisaoTexto" },
    { camada: "B", rotulo: "Contexto: a importação da China", campo: "chinaTexto" },
    { camada: "B", rotulo: "Leitura", campo: "leituraTexto" }
  ],
  graficoAB: {
    titulo: "Revisão do uso dos EUA (exportação + esmagamento) em cada edição do WASDE, em %",
    unidade: "%",
    casas: 2,
    exigeCampo: "revisaoUsoPct",
    series: [{ campo: "revisaoUsoPct", rotulo: "Revisão do uso (B)" }]
  },
  graficoC: { titulo: "Posição da revisão no histórico (B) e as faixas da decisão (C)", campo: "posicaoDecisiva", rotulo: "Posição da revisão", unidade: "pontos" },
  rotulosDecisao: s.ROTULOS_DECISAO,
  parametros: s.DESCRITORES_PARAMETROS,
  semTendencia: true,
  regra: `${s.REGRA_POSICAO}; a revisão do uso dos EUA (exportação + esmagamento) contra a edição anterior: para cima pressiona para alta, para baixo, para baixa; o 1º número da safra não tem revisão (neutra); a importação da China é contexto`,
  exemplos: { colunaValor: "Posição da revisão (pontos)" },
  nota:
    "Mensal, não é tempo real: o USDA publica o WASDE por volta do dia 10. A safra é a mais nova da edição. Na fase 1, a demanda é só mensal: nos horizontes de 1 e 7 dias, ela chega pelos eventos."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "PUBLICACAO",
  calcular: calcularDemandaEuaSoja,
  explicar: explicarDemandaEuaSoja,
  exemplos: exemplosDemandaEuaSoja,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, derivarDemandaEuaSoja, calcularDemandaEuaSoja };
