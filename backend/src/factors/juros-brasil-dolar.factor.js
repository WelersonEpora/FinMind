"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const d = require("./modelos/dolar-comum");

// FATOR F4 do dólar: juros do Brasil (proposta do dólar, §2.3; o fator 15 do relatório do Comitê de 2026-10-08; ADR
// 0126). O relatório lê a curva pré-fixada do DI nos contratos F27, F29 e F31 (na data dele, 2026-10): os janeiros de 1,
// 3 e 5 anos à frente. A operacionalização do FinMind: num dia do ano Y, os contratos de janeiro de Y+1, Y+3 e Y+5 (a troca
// é no 1º dia útil de cada ano), a taxa de ajuste de cada um (B3, ADR 0118).
// Direção (do relatório): "abertura generalizada" (os três vértices subindo) pressiona o dólar para ALTA; "fechamento"
// (os três caindo), para BAIXA; vértices mistos ou algum na faixa neutra, neutra. Cada vértice é classificado pela régua
// no próprio histórico; a intensidade é a do vértice mais fraco.
// Histórico: o Up2Data só tem ~15 meses (desde 2025-06): a régua usa o que há, com o mínimo de 60 variações; a janela
// de 60 dias úteis só ganha leitura meses depois do 1º dado.

const FACTOR_ID = "dolar_juros_brasil";
const FACTOR_VERSION = 1;

const ANOS_DOS_VERTICES = Object.freeze([1, 3, 5]);
const PRIMEIRO_ANO = 2025;
const serieDoContrato = (ano) => `B3.DI1.DI1F${String(ano % 100).padStart(2, "0")}.ADJ_RATE`;
const tickerDoContrato = (ano) => `DI1F${String(ano % 100).padStart(2, "0")}`;

// Os contratos de janeiro que podem ser vértice até `ateAno` (inclusive).
function seriesAte(ateAno) {
  const series = [];
  for (let ano = PRIMEIRO_ANO + 1; ano <= ateAno + 6; ano += 1) series.push(serieDoContrato(ano));
  return series;
}

// Os vértices de um dia: os janeiros de Y+1, Y+3 e Y+5.
const verticesDoDia = (dataIso) => ANOS_DOS_VERTICES.map((n) => Number(dataIso.slice(0, 4)) + n);

// Função PURA: as linhas de obterAsOf() -> um ponto por pregão com os três vértices.
function derivarJurosBrasilDolar(linhasAsOf, { parametros = d.PARAMETROS_REGUA } = {}) {
  const porContrato = new Map();
  const contratoDe = (ano) => {
    if (!porContrato.has(ano)) {
      const serie = d.serieDiaria(linhasAsOf, serieDoContrato(ano));
      porContrato.set(ano, { serie, regua: d.reguasPorHorizonte(serie, d.TIPO.PB, parametros), indice: new Map(serie.map((p, i) => [p.observedAt, i])) });
    }
    return porContrato.get(ano);
  };

  const datas = [...new Set(linhasAsOf.filter((l) => l.seriesCode.startsWith("B3.DI1.")).map((l) => String(l.observedAt).slice(0, 10)))].sort();
  const pontos = [];
  for (const data of datas) {
    const anos = verticesDoDia(data);
    const vertices = anos.map((ano) => {
      const c = contratoDe(ano);
      const i = c.indice.get(data);
      return i === undefined ? null : { ano, ticker: tickerDoContrato(ano), ponto: c.serie[i], regua: Object.fromEntries(d.HORIZONTES.map((h) => [h.codigo, c.regua[h.codigo][i]])) };
    });
    if (vertices.some((v) => !v)) continue;
    if (!d.HORIZONTES.some((h) => vertices.every((v) => v.regua[h.codigo]?.percentil !== null && v.regua[h.codigo] !== null))) continue;

    const porHorizonte = {};
    for (const h of d.HORIZONTES) {
      const leituras = vertices.map((v) => d.leituraDaRegua(v.regua[h.codigo], parametros, d.DIRECAO.ALTA));
      const leitura = d.concordancia(leituras, { minimo: 3, todas: true });
      const detalhe = vertices.map((v) => `${v.ticker} ${d.descreverVariacao(v.regua[h.codigo], d.TIPO.PB)}`).join(", ");
      const misto = leitura && leitura.direcao === d.DIRECAO.NEUTRA && leituras.some((l) => l && l.direcao !== d.DIRECAO.NEUTRA) ? "; vértices não concordam: neutra" : "";
      porHorizonte[h.codigo] = d.leituraDoHorizonte(leitura, `${detalhe}${misto}`);
    }
    const tela = porHorizonte[d.HORIZONTE_DA_TELA];
    const percentisMedio = vertices.map((v) => v.regua.MEDIO?.percentil ?? null);
    const posicaoMedio =
      !tela.direcao || percentisMedio.some((p) => p === null) ? null : tela.direcao === d.DIRECAO.NEUTRA ? 0 : (tela.direcao === d.DIRECAO.ALTA ? 1 : -1) * Math.min(...percentisMedio);
    const disponivelEm = vertices.map((v) => v.ponto.disponivelEm).sort().at(-1);
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: data,
      taxasTexto: vertices.map((v) => `${v.ticker} ${d.fmt(v.ponto.valor, 2)}%`).join(" | "),
      taxaMeio: vertices[1].ponto.valor,
      variacoesTexto: d.HORIZONTES.map((h) => `${h.janela} d.u.: ${vertices.map((v) => `${v.ticker} ${d.descreverVariacao(v.regua[h.codigo], d.TIPO.PB)}`).join(", ")}`).join(" | "),
      posicaoMedio,
      porHorizonte,
      decisao: d.decisaoDaTela(porHorizonte),
      disponivelEm,
      disponivelEmEhEstimado: vertices.some((v) => v.ponto.estimado)
    });
  }
  return pontos;
}

async function calcularJurosBrasilDolar({ asOf, parametros = d.PARAMETROS_REGUA }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: seriesAte(asOf.getUTCFullYear()), asOf }, deps);
  return derivarJurosBrasilDolar(linhas, { parametros });
}

function explicarJurosBrasilDolar(ponto) {
  if (!ponto) return [];
  return [
    `${d.dataBr(ponto.observedAt)}: as taxas de ajuste dos três vértices: ${ponto.taxasTexto}.`,
    `Variação por janela: ${ponto.variacoesTexto}.`,
    "Os três abrindo (subindo) pressionam o dólar para alta; os três fechando, para baixa; mistos, neutra.",
    ...d.linhasPorHorizonte(ponto.porHorizonte)
  ];
}

const EPISODIOS = [
  { data: "2025-12-19", rotulo: "Dezembro de 2025" },
  { data: "2026-09-30", rotulo: "Setembro de 2026" }
];

const APRESENTACAO = {
  unidade: "percentil",
  quadros: [
    { camada: "A", rotulo: "Taxas dos três vértices (janeiro de 1, 3 e 5 anos)", campo: "taxasTexto" },
    { camada: "B", rotulo: "Variação por janela, por vértice (a régua)", campo: "variacoesTexto" }
  ],
  graficoAB: {
    titulo: "Taxa do vértice de 3 anos (A), em % ao ano",
    unidade: "%",
    casas: 2,
    exigeCampo: "taxaMeio",
    series: [{ campo: "taxaMeio", rotulo: "Vértice de 3 anos (A)" }]
  },
  graficoC: d.graficoC("Curva do DI (o vértice mais fraco)"),
  rotulosDecisao: d.ROTULOS_DECISAO,
  parametros: d.DESCRITORES_PARAMETROS,
  semTendencia: true,
  porHorizonte: true,
  regra: `${d.REGRA_REGUA}, em cada um dos três vértices (os contratos de janeiro de 1, 3 e 5 anos à frente); os três abrindo pressionam o dólar para alta, os três fechando, para baixa, com a intensidade do mais fraco; mistos ou algum na faixa neutra, neutra`,
  exemplos: { colunaValor: "Posição com sinal (percentil, 30 dias)" },
  nota: "Diário (o ajuste da B3, publicado no fim do pregão), não é tempo real. O histórico do Up2Data começa em 2025-06: a régua usa o que há, com o mínimo de 60 variações, até completar 3 anos."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: d.PARAMETROS_REGUA,
  periodicidade: "DIARIA",
  calcular: calcularJurosBrasilDolar,
  explicar: explicarJurosBrasilDolar,
  exemplos: (pontos) => d.exemplosPorData(pontos, EPISODIOS),
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, METODOLOGIA, verticesDoDia, derivarJurosBrasilDolar, calcularJurosBrasilDolar };
