"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc, somarDias } = require("../../shared/utils/date-utils");
const { persistirPorEdicao, baixar } = require("../base/persist-observations");

// CPI dos EUA (BLS), pelo ALFRED, o arquivo de versões do FRED. Ouro, fator "Inflação e expectativas
// inflacionárias" (ADR 0033): o breakeven (T10YIE) já era coletado; o CPI observado não.
//
// POR QUE O ALFRED E NÃO O COLETOR DO FRED (fred.collector.js): o CPI REVISA. O ajuste sazonal é refeito todo
// fevereiro, para os últimos 5 anos, e houve mudanças de base e de arredondamento no histórico. O coletor do FRED
// só vê o valor atual, com a data de publicação estimada. O ALFRED guarda cada versão com a data em que ela passou
// a valer (`realtime_start`), que é a data do release do BLS: o vintage real, como no WASDE.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01 (ver o ADR):
//   - `series/observations` com `realtime_start=1776-07-04`, `realtime_end=9999-12-31` e `output_type=1` devolve
//     uma linha por (mês, versão): CPIAUCSL 3.103 linhas para 955 meses (657 meses revisados, 1.904 revisões);
//     CPILFESL 2.259 para 835; CPIAUCNS 2.500 para 1.363.
//   - Versões desde 1972-07-21 (cheio com ajuste), 1996-12-12 (núcleo) e 1949-03-24 (sem ajuste).
//   - As datas das versões caem nas datas do release "Consumer Price Index" do FRED (release 10).
//
// published_at: a data da versão é REAL; o horário não (o BLS divulga às 8:30 ET): vale o FIM DO DIA em UTC.
// Os meses anteriores à primeira versão guardada entram com a data dessa versão, que é um LIMITE SUPERIOR (como as
// safras antigas da Conab): ficam marcados em `metadata.limiteSuperior`.
//
// Reexecutar é seguro: a coleta diária baixa todas as versões e `persistirPorEdicao` descarta as datas de versão
// já gravadas; só uma versão nova (um release novo, ou uma revisão) vira linha. As 3 séries vão juntas, numa só
// execução: se uma falhar no download, nenhuma é gravada (as datas já gravadas valem para a fonte inteira).
// Exige FRED_API_KEY: o ALFRED só existe na API.

const URL_API = "https://api.stlouisfed.org/fred/series/observations";
const SOURCE_CODE = "FRED_ALFRED";
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
// O BLS divulga o CPI de um mês na 2ª ou 3ª semana do mês seguinte. Uma 1ª versão mais de 60 dias depois do mês
// é a primeira guardada pelo ALFRED, não a publicação original.
const DIAS_LIMITE_SUPERIOR = 60;

const SERIES = {
  CPIAUCSL: { seriesCode: "FRED.CPIAUCSL", nome: "CPI cheio, com ajuste sazonal" },
  CPILFESL: { seriesCode: "FRED.CPILFESL", nome: "CPI núcleo (sem alimentos e energia), com ajuste sazonal" },
  CPIAUCNS: { seriesCode: "FRED.CPIAUCNS", nome: "CPI cheio, sem ajuste sazonal" }
};

async function download({ signal }) {
  const apiKey = env.collectors.fredApiKey;
  if (!apiKey) throw new UpstreamServiceError("FRED_API_KEY não definida: o ALFRED só existe na API do FRED.");
  const corpos = {};
  for (const fredId of Object.keys(SERIES)) {
    const params = new URLSearchParams({
      series_id: fredId,
      api_key: apiKey,
      file_type: "json",
      realtime_start: "1776-07-04",
      realtime_end: "9999-12-31",
      output_type: "1",
      limit: "100000"
    });
    corpos[fredId] = await baixar(`${URL_API}?${params}`, { signal, as: "json" });
  }
  return corpos;
}

// { CPIAUCSL: { observations: [...] }, ... } -> [{ fredId, data, versao, valor }]
function parse(raw) {
  const itens = [];
  for (const fredId of Object.keys(SERIES)) {
    const observacoes = raw?.[fredId]?.observations;
    if (!Array.isArray(observacoes)) {
      throw new UpstreamServiceError(`Resposta do ALFRED para ${fredId} em formato inesperado (esperava { observations: [...] }).`);
    }
    for (const o of observacoes) {
      // "." = sem valor naquela versão (não é observação).
      if (o.value === "." || o.value === "") continue;
      itens.push({ fredId, data: o.date, versao: o.realtime_start, valor: String(o.value) });
    }
  }
  return itens;
}

function normalize(rawItems) {
  const validos = [];
  const invalidos = [];
  const primeiraVersao = new Map();

  for (const item of rawItems) {
    const { fredId, data, versao, valor: valorTexto } = item;
    const valor = Number(valorTexto);
    if (!REGEX_DATA.test(data) || !REGEX_DATA.test(versao)) {
      invalidos.push({ item, motivo: `Data em formato inesperado: "${data}" (versão "${versao}").` });
      continue;
    }
    if (!Number.isFinite(valor)) {
      invalidos.push({ item, motivo: `Valor inválido: "${valorTexto}".` });
      continue;
    }
    const chave = `${fredId}|${data}`;
    if (!primeiraVersao.has(chave) || versao < primeiraVersao.get(chave)) primeiraVersao.set(chave, versao);

    validos.push({
      series_code: SERIES[fredId].seriesCode,
      observed_at: data,
      value: valor,
      unit: "INDEX",
      source_code: SOURCE_CODE,
      published_at: fimDoDiaUtc(versao),
      published_at_is_estimated: false,
      published_at_basis: "source",
      metadata: { fonte: "FRED (ALFRED)", fredSeries: fredId, versaoAlfred: versao }
    });
  }

  for (const v of validos) {
    const versao = v.metadata.versaoAlfred;
    const ePrimeira = primeiraVersao.get(`${v.metadata.fredSeries}|${v.observed_at}`) === versao;
    if (ePrimeira && versao > somarDias(v.observed_at, DIAS_LIMITE_SUPERIOR)) v.metadata.limiteSuperior = true;
  }

  // Ordem cronológica das versões: o serviço point-in-time compara com a última versão de cada mês.
  validos.sort((a, b) => a.published_at - b.published_at || a.observed_at.localeCompare(b.observed_at));
  return { validos, invalidos };
}

const persist = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: false });

module.exports = {
  codigo: "fred-cpi",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist,
  SERIES,
  SOURCE_CODE
};
