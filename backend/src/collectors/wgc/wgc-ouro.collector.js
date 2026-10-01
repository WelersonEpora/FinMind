"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// World Gold Council (Goldhub) - ouro em ETFs e o balanço trimestral de oferta e demanda. ADR 0037; reconhecimento
// em `docs/reconhecimento-fontes/wgc-ouro.md`. Dois coletores (`criarColetorWgc`):
//   - "etf": estoque de ouro em ETFs por região (América do Norte, Europa, Ásia, outros), em toneladas e em US$
//     milhões, SEMANAL (sextas) desde 2003-02-28. Fator do ouro "Fluxo de ETFs de ouro". A fonte dá o valor em US$
//     (unidades); ele é gravado em MILHÕES (só a escala): a América do Norte já passa de US$ 360 bilhões e a coluna
//     `value` vai até 10^12, o mesmo estouro que o FMI teve (ADR 0036).
//   - "oferta-demanda": demanda por setor (joalheria, tecnologia, barras e moedas, ETFs, bancos centrais) e oferta
//     (produção das minas, hedge, reciclagem), em toneladas, TRIMESTRAL desde o 1º tri/2010. Fatores "Demanda de
//     bancos centrais" (com a estimativa do WGC para as compras não declaradas), "Fluxo de ETFs" e "Produção e
//     oferta de mineração".
//
// FONTE: a API JSON que alimenta os gráficos do Goldhub (`fsapi.gold.org`), SEM DOCUMENTAÇÃO e sem contrato: pode
// mudar ou fechar sem aviso. Responde sem login (os XLSX do site exigem cadastro). Verificado por chamada real em
// 2026-10-01.
//
// LICENÇA (risco aceito pelo usuário em 2026-10-01, ADR 0037): os termos do site permitem só "personal,
// non-commercial use" e proíbem redistribuir sem permissão escrita. Uso INTERNO do FinMind; antes de qualquer uso
// comercial ou exibição a terceiros, pedir permissão ao WGC. A demanda e a oferta usam dados da Metals Focus.
// O preço LBMA que a mesma resposta traz NÃO é gravado (já coletado da LBMA, com a licença da IBA, ADR 0009).
//
// published_at: a fonte não informa (o `asOfDate` é a data do dado, não da publicação) e só traz o valor atual (o
// endpoint dos ETFs se chama "revised": os números são revisados). Fica sem published_at e vale o instante da coleta
// (ADR 0008), como na PSD (ADR 0031) e no FMI (ADR 0036): o vintage começa na 1ª coleta.

const BASE_URL = "https://fsapi.gold.org/api/v11/charts";

const REGIOES_ETF = {
  "North America": "AMERICA_DO_NORTE",
  Europe: "EUROPA",
  Asia: "ASIA",
  Other: "OUTROS"
};

// Séries do balanço (nome na fonte -> código). Um nome que não esteja aqui vira item inválido (a fonte mudou), nunca
// uma série com nome inventado. "LBMA" (o preço) fica de fora de propósito.
const SERIES_OFERTA_DEMANDA = {
  "Jewellery consumption": "JOALHERIA_CONSUMO",
  "Jewellery inventory": "JOALHERIA_ESTOQUE",
  "Jewellery fabrication": "JOALHERIA_FABRICACAO",
  Technology: "TECNOLOGIA",
  Electronics: "TECNOLOGIA_ELETRONICA",
  "Other industrial": "TECNOLOGIA_OUTROS_INDUSTRIAIS",
  Dentistry: "TECNOLOGIA_ODONTOLOGIA",
  Investment: "INVESTIMENTO",
  "Total bc": "BARRAS_E_MOEDAS",
  "Physical bar": "BARRAS",
  "Official coin": "MOEDAS_OFICIAIS",
  "Medals coin": "MEDALHAS",
  Etfs: "ETFS",
  "Central banks": "BANCOS_CENTRAIS",
  "Mine production": "PRODUCAO_MINAS",
  "Net producer hedging": "HEDGE_PRODUTORES",
  "Recycled gold": "RECICLAGEM"
};
const IGNORADAS_OFERTA_DEMANDA = new Set(["LBMA"]);

const RE_TRIMESTRE = /^Q([1-4]) '(\d{2})$/;

function validarResposta(raw, chave) {
  const dados = raw?.chartData;
  if (!dados || typeof dados !== "object" || !dados[chave]) {
    throw new UpstreamServiceError(`Resposta do WGC em formato inesperado (esperava chartData.${chave}).`);
  }
  return dados;
}

// --- ETFs: chartData.data.Weekly.{tonnes,usd} = { columns: ["Date", <regiões>..., "Gold, US$/oz"], set: [[ms, ...]] }
function parseEtf(raw) {
  const semanal = validarResposta(raw, "data").data.Weekly;
  if (!semanal?.tonnes?.set || !semanal?.usd?.set) throw new UpstreamServiceError("Resposta de ETFs do WGC sem a série semanal (Weekly.tonnes/usd).");
  const itens = [];
  for (const [medida, tabela] of [["TONELADAS", semanal.tonnes], ["MI_USD", semanal.usd]]) {
    const colunas = tabela.columns;
    for (const linha of tabela.set) {
      colunas.forEach((coluna, i) => {
        if (i === 0 || coluna.startsWith("Gold")) return; // a data e o preço do ouro
        itens.push({ regiao: coluna, medida, data: linha[0], valor: linha[i] });
      });
    }
  }
  return itens;
}

function normalizeEtf(rawItems) {
  const validos = [];
  const invalidos = [];
  for (const item of rawItems) {
    const regiao = REGIOES_ETF[item.regiao];
    const data = Number.isFinite(item.data) ? new Date(item.data) : null;
    if (!regiao || !data || Number.isNaN(data.getTime())) {
      invalidos.push({ item, motivo: `Região ou data inesperada: "${item.regiao}" / ${item.data}.` });
      continue;
    }
    if (item.valor === null || item.valor === undefined) continue; // região sem ETF naquela semana: ausência
    const publicado = Number(item.valor);
    if (!Number.isFinite(publicado)) {
      invalidos.push({ item, motivo: `Valor inválido: "${item.valor}".` });
      continue;
    }
    // Arredondado às 6 casas da coluna aqui (senão o banco e o serviço arredondam diferente, ADR 0036).
    const valor = item.medida === "MI_USD" ? publicado / 1e6 : publicado;
    validos.push({
      series_code: `WGC.ETF.${regiao}.${item.medida}`,
      observed_at: data.toISOString().slice(0, 10),
      value: Number(valor.toFixed(6)),
      unit: item.medida === "TONELADAS" ? "t" : "mi USD",
      source_code: "WGC_ETF",
      published_at_is_estimated: true,
      metadata: { fonte: "World Gold Council (Goldhub)", regiaoWgc: item.regiao, medida: item.medida }
    });
  }
  return { validos, invalidos };
}

// --- Oferta e demanda: chartData.{Demand,Supply}_Quarterly = { categories: ["Q1 '10", ...], series: [{ name, data }] }
function parseOfertaDemanda(raw) {
  const dados = validarResposta(raw, "Demand_Quarterly");
  if (!dados.Supply_Quarterly) throw new UpstreamServiceError("Resposta de oferta e demanda do WGC sem Supply_Quarterly.");
  const itens = [];
  for (const lado of ["Demand_Quarterly", "Supply_Quarterly"]) {
    const { categories, series } = dados[lado];
    if (!Array.isArray(categories) || !Array.isArray(series)) throw new UpstreamServiceError(`Resposta do WGC: ${lado} sem categories/series.`);
    for (const serie of series) {
      if (IGNORADAS_OFERTA_DEMANDA.has(serie.name)) continue;
      serie.data.forEach((valor, i) => itens.push({ nome: serie.name, trimestre: categories[i], valor }));
    }
  }
  return itens;
}

function normalizeOfertaDemanda(rawItems) {
  const validos = [];
  const invalidos = [];
  for (const item of rawItems) {
    const codigo = SERIES_OFERTA_DEMANDA[item.nome];
    const m = RE_TRIMESTRE.exec(String(item.trimestre));
    if (!codigo || !m) {
      invalidos.push({ item, motivo: `Série ou trimestre inesperado: "${item.nome}" / "${item.trimestre}".` });
      continue;
    }
    if (item.valor === null || item.valor === undefined) continue;
    const valor = Number(item.valor);
    if (!Number.isFinite(valor)) {
      invalidos.push({ item, motivo: `Valor inválido: "${item.valor}".` });
      continue;
    }
    const mes = String((Number(m[1]) - 1) * 3 + 1).padStart(2, "0");
    validos.push({
      series_code: `WGC.OFERTA_DEMANDA.${codigo}`,
      // Convenção: o 1º dia do trimestre (o dado é do trimestre inteiro).
      observed_at: `20${m[2]}-${mes}-01`,
      value: Number(valor.toFixed(6)),
      unit: "t",
      source_code: "WGC_OFERTA_DEMANDA",
      published_at_is_estimated: true,
      metadata: { fonte: "World Gold Council (Goldhub), dados da Metals Focus", serieWgc: item.nome, trimestre: item.trimestre }
    });
  }
  return { validos, invalidos };
}

const COLETORES = {
  etf: {
    codigo: "wgc-etf-ouro",
    url: `${BASE_URL}/etfv2/revised/holdings-chart2`,
    parse: parseEtf,
    normalize: normalizeEtf
  },
  "oferta-demanda": {
    codigo: "wgc-oferta-demanda-ouro",
    url: `${BASE_URL}/supply-and-demand/43`,
    parse: parseOfertaDemanda,
    normalize: normalizeOfertaDemanda
  }
};

function criarColetorWgc(chave) {
  const config = COLETORES[chave];
  if (!config) throw new Error(`Coletor do WGC desconhecido: ${chave} (conhecidos: ${Object.keys(COLETORES).join(", ")}).`);
  return {
    codigo: config.codigo,
    get timeoutMs() {
      return env.collectors.sourceTimeoutMs;
    },
    get tentativasRetry() {
      return env.collectors.retryTentativas;
    },
    download: ({ signal }) => baixar(config.url, { signal, as: "json" }),
    parse: config.parse,
    normalize: config.normalize,
    persist: persistirObservacoes
  };
}

module.exports = { criarColetorWgc, REGIOES_ETF, SERIES_OFERTA_DEMANDA };
