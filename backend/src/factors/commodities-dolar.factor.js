"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const { decodificarFuturoB3 } = require("../shared/utils/b3-contrato");
const d = require("./modelos/dolar-comum");

// FATOR F6 do dólar: commodities, os termos de troca (proposta do dólar, §2.3; os fatores 19, 21 e 22 do relatório do
// Comitê de 2026-10-08; decisão do usuário, 2026-10-09, ADR 0117, adendo; ADR 0126). Três commodities, todas cotadas em
// dólar: o Brent (o 1º vencimento contínuo do futuro da NYMEX, Yahoo, fonte não oficial, ADR 0096), o café (ICF) e a
// soja (SJC) da B3. O milho da B3 (CCM) ficou fora: é cotado em reais, e parte do movimento dele é o próprio dólar
// convertido. O minério (20) não tem fonte coletada; o ouro (23) é contexto do F2.
// Direção (do relatório): a MAIORIA das três caindo pressiona o dólar para ALTA; subindo, para BAIXA; sem maioria fora da
// faixa neutra, neutra. Cada commodity é classificada pela régua; a intensidade é a da mais fraca entre as que formam a
// maioria. O petróleo segue a regra linear da tabela (decisão do usuário, 2026-10-09): a ressalva do choque de oferta
// vai ao prompt (instruções), não ao cálculo.
// O ICF e o SJC são por vencimento: a variação de cada janela é a do contrato mais próximo que negociou nas duas pontas
// dela (nada é emendado). O Brent contínuo tem os saltos da rolagem do 1º vencimento.

const FACTOR_ID = "dolar_commodities";
const FACTOR_VERSION = 1;

const MESES = "FGHJKMNQUVXZ";
const PRIMEIRO_ANO_B3 = 2022;
const COMMODITIES = Object.freeze([
  { codigo: "BRENT", rotulo: "Brent", serie: "YAHOO.BZ_CONTINUO.SETTLE" },
  { codigo: "CAFE", rotulo: "café (ICF)", prefixo: "B3.ICF", simbolo: "ICF" },
  { codigo: "SOJA", rotulo: "soja (SJC)", prefixo: "B3.SJC", simbolo: "SJC" }
]);
// Preço subindo pressiona o dólar para baixa (termos de troca melhores, mais dólares entrando).
const ACIMA = d.DIRECAO.BAIXA;

// Os códigos de todos os vencimentos possíveis de um futuro da B3, de 2022 até `ateAno` + 2.
function seriesDoFuturo(c, ateAno) {
  const codigos = [];
  for (let ano = PRIMEIRO_ANO_B3; ano <= ateAno + 2; ano += 1) {
    for (const mes of MESES) codigos.push(`${c.prefixo}.${c.simbolo}${mes}${String(ano % 100).padStart(2, "0")}.SETTLE`);
  }
  return codigos;
}

// Um futuro da B3 por vencimento -> a sequência diária de cada janela (a variação no contrato mais próximo com as duas
// pontas) e o preço do 1º vencimento negociado no dia. -> { datas, precos: [{ ticker, valor, disponivelEm, estimado }],
// variacoes: { HORIZONTE: [] } }.
function sequenciaDoFuturo(linhas, c) {
  const contratos = new Map();
  for (const l of linhas) {
    if (!l.seriesCode.startsWith(`${c.prefixo}.`) || !l.seriesCode.endsWith(".SETTLE") || !Number.isFinite(l.value)) continue;
    const ticker = l.seriesCode.split(".")[2];
    if (!contratos.has(ticker)) contratos.set(ticker, { contrato: decodificarFuturoB3(ticker, c.simbolo), linhas: [] });
    contratos.get(ticker).linhas.push(l);
  }
  const lista = [...contratos.values()]
    .filter((x) => x.contrato)
    .map((x) => {
      const serie = d.serieDiaria(x.linhas, x.linhas[0].seriesCode);
      return { ...x.contrato, serie, indice: new Map(serie.map((p, i) => [p.observedAt, i])) };
    })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const datas = [...new Set(lista.flatMap((x) => x.serie.map((p) => p.observedAt)))].sort();
  const precos = [];
  const variacoes = Object.fromEntries(d.HORIZONTES.map((h) => [h.codigo, []]));
  for (const data of datas) {
    const mes = data.slice(0, 7);
    const vigentes = lista.filter((x) => x.vencimento >= mes && x.indice.has(data));
    const primeiro = vigentes[0];
    precos.push(primeiro ? { ticker: primeiro.ticker, valor: primeiro.serie[primeiro.indice.get(data)].valor, ...primeiro.serie[primeiro.indice.get(data)] } : null);
    for (const h of d.HORIZONTES) {
      const contrato = vigentes.find((x) => x.indice.get(data) >= h.janela);
      if (!contrato) {
        variacoes[h.codigo].push(null);
        continue;
      }
      const i = contrato.indice.get(data);
      variacoes[h.codigo].push(d.arredondar(d.TIPO.PCT.calcular(contrato.serie[i].valor, contrato.serie[i - h.janela].valor), 4));
    }
  }
  return { datas, precos, variacoes };
}

// Uma commodity -> { datas, precos, reguas: { HORIZONTE: [regua] } }.
function reguasDaCommodity(linhas, c, parametros) {
  if (c.serie) {
    const serie = d.serieDiaria(linhas, c.serie);
    return { datas: serie.map((p) => p.observedAt), precos: serie.map((p) => ({ ticker: null, ...p })), reguas: d.reguasPorHorizonte(serie, d.TIPO.PCT, parametros) };
  }
  const seq = sequenciaDoFuturo(linhas, c);
  return { datas: seq.datas, precos: seq.precos, reguas: Object.fromEntries(d.HORIZONTES.map((h) => [h.codigo, d.reguaDaSequencia(seq.datas, seq.variacoes[h.codigo], parametros)])) };
}

function indiceNaData(datas, data) {
  let lo = 0;
  let hi = datas.length - 1;
  let achado = -1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (datas[meio] <= data) {
      achado = meio;
      lo = meio + 1;
    } else hi = meio - 1;
  }
  return achado;
}

// Função PURA: as linhas de obterAsOf() -> um ponto por dia com as três commodities lidas.
function derivarCommoditiesDolar(linhasAsOf, { parametros = d.PARAMETROS_REGUA } = {}) {
  const porCommodity = COMMODITIES.map((c) => ({ c, ...reguasDaCommodity(linhasAsOf, c, parametros) }));
  const datas = [...new Set(porCommodity.flatMap((x) => x.datas))].sort();
  const pontos = [];
  for (const data of datas) {
    const estado = porCommodity.map((x) => {
      const i = indiceNaData(x.datas, data);
      return i < 0 ? null : { ...x, i, preco: x.precos[i], regua: Object.fromEntries(d.HORIZONTES.map((h) => [h.codigo, x.reguas[h.codigo][i]])) };
    });
    if (estado.some((e) => !e || !e.preco)) continue;
    if (!d.HORIZONTES.some((h) => estado.every((e) => e.regua[h.codigo] && e.regua[h.codigo].percentil !== null))) continue;

    const porHorizonte = {};
    for (const h of d.HORIZONTES) {
      const leituras = estado.map((e) => d.leituraDaRegua(e.regua[h.codigo], parametros, ACIMA));
      const leitura = d.concordancia(leituras, { minimo: 2, todas: true });
      const detalhe = estado.map((e) => `${e.c.rotulo} ${d.descreverVariacao(e.regua[h.codigo], d.TIPO.PCT)}`).join(", ");
      porHorizonte[h.codigo] = d.leituraDoHorizonte(leitura, detalhe);
    }
    const tela = porHorizonte[d.HORIZONTE_DA_TELA];
    let posicaoMedio = null;
    if (tela.direcao === d.DIRECAO.NEUTRA) posicaoMedio = 0;
    else if (tela.direcao) {
      const daMaioria = estado.filter((e) => d.leituraDaRegua(e.regua.MEDIO, parametros, ACIMA)?.direcao === tela.direcao).map((e) => e.regua.MEDIO.percentil);
      posicaoMedio = (tela.direcao === d.DIRECAO.ALTA ? 1 : -1) * Math.min(...daMaioria);
    }
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: data,
      precosTexto: estado
        .map((e) => `${e.c.rotulo}${e.preco.ticker ? ` ${e.preco.ticker}` : ""} US$ ${d.fmt(e.preco.valor, 2)} em ${d.dataBr(e.preco.observedAt)}`)
        .join(" | "),
      brent: estado[0].preco.valor,
      variacoesTexto: d.HORIZONTES.map((h) => `${h.janela} d.u.: ${estado.map((e) => `${e.c.rotulo} ${d.descreverVariacao(e.regua[h.codigo], d.TIPO.PCT)}`).join(", ")}`).join(" | "),
      posicaoMedio,
      porHorizonte,
      decisao: d.decisaoDaTela(porHorizonte),
      disponivelEm: estado.map((e) => e.preco.disponivelEm).sort().at(-1),
      disponivelEmEhEstimado: estado.some((e) => e.preco.estimado)
    });
  }
  return pontos;
}

async function calcularCommoditiesDolar({ asOf, parametros = d.PARAMETROS_REGUA }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const ano = asOf.getUTCFullYear();
  const series = COMMODITIES.flatMap((c) => (c.serie ? [c.serie] : seriesDoFuturo(c, ano)));
  const linhas = await servico.obterAsOf({ seriesCodes: series, asOf }, deps);
  return derivarCommoditiesDolar(linhas, { parametros });
}

function explicarCommoditiesDolar(ponto) {
  if (!ponto) return [];
  return [
    `${d.dataBr(ponto.observedAt)}: ${ponto.precosTexto}.`,
    `Variação por janela: ${ponto.variacoesTexto}.`,
    "A maioria das três caindo pressiona o dólar para alta; subindo, para baixa; sem maioria fora da faixa neutra, neutra.",
    ...d.linhasPorHorizonte(ponto.porHorizonte)
  ];
}

const EPISODIOS = [
  { data: "2022-11-30", rotulo: "Novembro de 2022" },
  { data: "2025-04-09", rotulo: "Tarifas dos EUA: as commodities caem" },
  { data: "2026-09-30", rotulo: "Setembro de 2026" }
];

const APRESENTACAO = {
  unidade: "percentil",
  quadros: [
    { camada: "A", rotulo: "Preço de cada commodity (o 1º vencimento negociado)", campo: "precosTexto" },
    { camada: "B", rotulo: "Variação por janela, por commodity (a régua)", campo: "variacoesTexto" }
  ],
  graficoAB: {
    titulo: "Brent, 1º vencimento contínuo (A), em US$ por barril",
    unidade: "",
    casas: 2,
    exigeCampo: "brent",
    series: [{ campo: "brent", rotulo: "Brent (A)" }]
  },
  graficoC: d.graficoC("Commodities (a mais fraca da maioria)"),
  rotulosDecisao: d.ROTULOS_DECISAO,
  parametros: d.DESCRITORES_PARAMETROS,
  semTendencia: true,
  porHorizonte: true,
  regra: `${d.REGRA_REGUA}, em cada commodity (Brent, café e soja, cotados em dólar); a maioria caindo pressiona o dólar para alta, subindo, para baixa, com a intensidade da mais fraca da maioria; sem maioria fora da faixa neutra, neutra`,
  exemplos: { colunaValor: "Posição com sinal (percentil, 30 dias)" },
  nota: "Diário (o ajuste de cada pregão), não é tempo real. O Brent é o 1º vencimento contínuo do Yahoo (fonte não oficial, ADR 0096), com os saltos da rolagem; o café e a soja, o contrato mais próximo da B3 com as duas pontas de cada janela. Os três só têm leitura juntos desde 2022 (o histórico do ICF e do SJC)."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: d.PARAMETROS_REGUA,
  periodicidade: "DIARIA",
  calcular: calcularCommoditiesDolar,
  explicar: explicarCommoditiesDolar,
  exemplos: (pontos) => d.exemplosPorData(pontos, EPISODIOS),
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, COMMODITIES, METODOLOGIA, derivarCommoditiesDolar, calcularCommoditiesDolar, sequenciaDoFuturo };
