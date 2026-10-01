"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc, somarDias } = require("../../shared/utils/date-utils");
const { persistirPorEdicao, baixar } = require("../base/persist-observations");

// Base dos coletores que leem o ALFRED, o arquivo de versões do FRED: uma linha por (mês, versão), cada versão com a
// data em que passou a valer no FRED (`realtime_start`). Usado quando a série REVISA, e o coletor do FRED
// (fred.collector.js), que só vê o valor atual com a data de publicação estimada, perderia as versões. Hoje: o CPI
// (ADR 0033) e o preço do café do FMI (ADR 0045).
//
// published_at: a data da versão, no FIM DO DIA em UTC (o horário não é conhecido). Os meses cuja 1ª versão sai mais
// de `diasLimiteSuperior` depois do mês ficam marcados em `metadata.limiteSuperior`: a publicação original pode ter
// sido antes (o ALFRED só começa a guardar versões numa data, e o FRED às vezes passa meses sem atualizar uma série).
//
// Mês RETIRADO: um mês que tinha valor nas versões antigas e cuja versão atual é "." (a fonte tirou o mês da série).
// Não é gravado (gravar deixaria o valor antigo como o atual, para sempre: a camada é append-only) e vira aviso.
//
// Reexecutar é seguro: a coleta baixa todas as versões e `persistirPorEdicao` descarta as datas de versão já gravadas
// na FONTE INTEIRA (`sourceCode`); só uma versão nova vira linha. Por isso cada coletor tem o seu `sourceCode`: duas
// séries de releases diferentes na mesma fonte descartariam a versão de uma que caísse no dia de uma versão da outra.
// As séries de um coletor vão juntas, numa só execução: se uma falhar no download, nenhuma é gravada.
// Exige FRED_API_KEY: o ALFRED só existe na API.

const URL_API = "https://api.stlouisfed.org/fred/series/observations";
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const VERSAO_ATUAL = "9999-12-31";

function criarColetorAlfred({ codigo, sourceCode, series, diasLimiteSuperior }) {
  async function download({ signal }) {
    const apiKey = env.collectors.fredApiKey;
    if (!apiKey) throw new UpstreamServiceError("FRED_API_KEY não definida: o ALFRED só existe na API do FRED.");
    const corpos = {};
    for (const fredId of Object.keys(series)) {
      const params = new URLSearchParams({
        series_id: fredId,
        api_key: apiKey,
        file_type: "json",
        realtime_start: "1776-07-04",
        realtime_end: VERSAO_ATUAL,
        output_type: "1",
        limit: "100000"
      });
      corpos[fredId] = await baixar(`${URL_API}?${params}`, { signal, as: "json" });
    }
    return corpos;
  }

  // { <ID>: { observations: [...] }, ... } -> [{ fredId, data, versao, valor, retirado? }]
  function parse(raw) {
    const itens = [];
    for (const fredId of Object.keys(series)) {
      const observacoes = raw?.[fredId]?.observations;
      if (!Array.isArray(observacoes)) {
        throw new UpstreamServiceError(`Resposta do ALFRED para ${fredId} em formato inesperado (esperava { observations: [...] }).`);
      }
      const retirados = new Set(
        observacoes.filter((o) => (o.value === "." || o.value === "") && o.realtime_end === VERSAO_ATUAL).map((o) => o.date)
      );
      for (const o of observacoes) {
        // "." = sem valor naquela versão (não é observação).
        if (o.value === "." || o.value === "") continue;
        const item = { fredId, data: o.date, versao: o.realtime_start, valor: String(o.value) };
        if (retirados.has(o.date)) item.retirado = true;
        itens.push(item);
      }
    }
    return itens;
  }

  function normalize(rawItems) {
    const validos = [];
    const invalidos = [];
    const primeiraVersao = new Map();
    const retiradosPorSerie = new Map();

    for (const item of rawItems) {
      const { fredId, data, versao, valor: valorTexto } = item;
      if (item.retirado) {
        const meses = retiradosPorSerie.get(fredId) || retiradosPorSerie.set(fredId, new Set()).get(fredId);
        meses.add(data);
        continue;
      }
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
        series_code: series[fredId].seriesCode,
        observed_at: data,
        value: valor,
        unit: series[fredId].unit,
        source_code: sourceCode,
        published_at: fimDoDiaUtc(versao),
        published_at_is_estimated: false,
        published_at_basis: "source",
        metadata: { fonte: "FRED (ALFRED)", fredSeries: fredId, versaoAlfred: versao }
      });
    }

    for (const v of validos) {
      const versao = v.metadata.versaoAlfred;
      const ePrimeira = primeiraVersao.get(`${v.metadata.fredSeries}|${v.observed_at}`) === versao;
      if (ePrimeira && versao > somarDias(v.observed_at, diasLimiteSuperior)) v.metadata.limiteSuperior = true;
    }

    const avisos = [...retiradosPorSerie].map(([fredId, meses]) => {
      const ordenados = [...meses].sort();
      return {
        item: { fredId, meses: ordenados.length, de: ordenados[0], ate: ordenados.at(-1) },
        motivo: `${ordenados.length} meses de ${fredId} (${ordenados[0]} a ${ordenados.at(-1)}) foram retirados da série na versão atual: não gravados.`
      };
    });

    // Ordem cronológica das versões: o serviço point-in-time compara com a última versão de cada mês.
    validos.sort((a, b) => a.published_at - b.published_at || a.observed_at.localeCompare(b.observed_at));
    return { validos, invalidos, avisos };
  }

  const persist = (validos, contexto, deps = {}) =>
    persistirPorEdicao(validos, contexto, deps, { sourceCode, exigirCargaInicial: false });

  return {
    codigo,
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
    SERIES: series,
    SOURCE_CODE: sourceCode
  };
}

module.exports = { criarColetorAlfred };
