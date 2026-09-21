"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { proximoDiaUtil, proximaSegunda, fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// FRED (Federal Reserve Bank of St. Louis). Duas vias de download, mesmo dado:
//   1. API REST (`fred/series/observations`) - USADA quando há FRED_API_KEY
//      (chave gratuita). É a interface documentada e coberta pelos termos da
//      API do FRED (ADR 0012).
//   2. CSV público do gráfico (`fredgraph.csv`) - RESERVA quando não há chave,
//      para a coleta não parar num ambiente sem ela. É um endpoint do site, sem
//      contrato de estabilidade.
// Verificado por chamada real em 2026-09-21: as 4 séries devolvem exatamente as
// mesmas observações pelas duas vias (0 diferenças).
//
// Nenhuma das duas traz a data de publicação: a API, sem realtime_start, devolve
// só a versão ATUAL de cada valor (vintages são o ALFRED, ADR 0011). Por isso
// published_at é ESTIMADO por regra de defasagem documentada, medida na própria
// fonte (ver abaixo).
//
// Reexecutar é seguro: baixa a série inteira e só grava o que é novo ou
// mudou de valor (ver point-in-time.service.js).

const URL_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const URL_API = "https://api.stlouisfed.org/fred/series/observations";
const SOURCE_CODE = "FRED";

// Regras de defasagem - medidas em 2026-09-20 comparando a última observação
// de cada série no CSV com a data corrente:
//   DGS10, DFII10: 1 dia útil depois (H.15); T10YIE idem (calculada pelo FRED
//     a partir das duas anteriores).
//   DTWEXBGS: série DIÁRIA mas divulgada SEMANALMENTE (H.10, segundas) - em
//     20/09 a última observação era sexta 11/09; a semana de 14/09 não tinha
//     saído. Vale a próxima segunda depois da observação.
// Não conhecem feriados dos EUA: em feriado a publicação real pode atrasar um
// dia além da regra (o limite de tempo dentro do dia já é o fim do dia UTC).
const SERIES = {
  DGS10: {
    seriesCode: "FRED.DGS10",
    nome: "Treasury 10 anos - constant maturity (nominal)",
    unit: "% a.a.",
    regra: "proximo_dia_util",
    publicadoEm: proximoDiaUtil
  },
  DFII10: {
    seriesCode: "FRED.DFII10",
    nome: "Treasury 10 anos indexado à inflação (TIPS) - juro real",
    unit: "% a.a.",
    regra: "proximo_dia_util",
    publicadoEm: proximoDiaUtil
  },
  T10YIE: {
    seriesCode: "FRED.T10YIE",
    nome: "Inflação implícita (breakeven) 10 anos",
    unit: "% a.a.",
    regra: "proximo_dia_util",
    publicadoEm: proximoDiaUtil
  },
  DTWEXBGS: {
    seriesCode: "FRED.DTWEXBGS",
    nome: "Índice amplo do dólar (Nominal Broad USD Index, Fed) - NÃO é o DXY",
    unit: "INDEX",
    regra: "proxima_segunda_h10_semanal",
    publicadoEm: proximaSegunda
  }
};

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

// O FRED marca dias sem valor (feriado) com ".": não é observação, é ausência.
function temValor(valor) {
  return valor !== "." && valor !== "";
}

function parseCsv(csv) {
  if (typeof csv !== "string" || !csv.includes(",")) {
    throw new UpstreamServiceError("Resposta do FRED em formato inesperado (esperava CSV).");
  }
  const linhas = csv.trim().split(/\r?\n/);
  // linhas[0] é o cabeçalho (observation_date,<ID> - ou DATE,<ID> em versões antigas).
  return linhas
    .slice(1)
    .map((l) => l.split(","))
    .filter(([, valor]) => temValor(valor));
}

function parseApi(corpo) {
  if (!Array.isArray(corpo?.observations)) {
    throw new UpstreamServiceError("Resposta da API do FRED em formato inesperado (esperava { observations: [...] }).");
  }
  return corpo.observations.map((o) => [o.date, String(o.value)]).filter(([, valor]) => temValor(valor));
}

// Aceita as duas vias e devolve sempre pares [data, valor em texto], de modo que
// o normalize não sabe (nem precisa saber) de onde o dado veio.
function parse(raw) {
  return typeof raw === "string" ? parseCsv(raw) : parseApi(raw);
}

// A chave vai na URL (a API do FRED não aceita header). `baixar` só põe o host
// nas mensagens de erro, então a chave não vaza em log nem no registro de execução.
function baixarSerie(fredId, { signal }) {
  const apiKey = env.collectors.fredApiKey;
  if (apiKey) {
    const params = new URLSearchParams({ series_id: fredId, api_key: apiKey, file_type: "json" });
    return baixar(`${URL_API}?${params}`, { signal, as: "json" });
  }
  return baixar(`${URL_CSV}?id=${fredId}`, { signal });
}

function criarNormalize(serie) {
  return function normalize(rawItems) {
    const validos = [];
    const invalidos = [];

    for (const [data, valorTexto] of rawItems) {
      const valor = Number(valorTexto);
      if (!REGEX_DATA.test(data)) {
        invalidos.push({ item: [data, valorTexto], motivo: `Data em formato inesperado: "${data}".` });
        continue;
      }
      if (!Number.isFinite(valor)) {
        invalidos.push({ item: [data, valorTexto], motivo: `Valor inválido: "${valorTexto}".` });
        continue;
      }

      validos.push({
        series_code: serie.seriesCode,
        observed_at: data,
        value: valor,
        unit: serie.unit,
        source_code: SOURCE_CODE,
        published_at: fimDoDiaUtc(serie.publicadoEm(data)),
        published_at_is_estimated: true,
        published_at_basis: "lag_rule",
        metadata: { fonte: "FRED", fredSeries: serie.seriesCode.split(".")[1], regraPublicacao: serie.regra }
      });
    }

    return { validos, invalidos };
  };
}

function criarColetorFred(fredId) {
  const serie = SERIES[fredId];
  if (!serie) throw new Error(`Série FRED desconhecida: ${fredId}`);

  return {
    codigo: `fred-${fredId.toLowerCase()}`,
    seriesCode: serie.seriesCode,
    get timeoutMs() {
      return env.collectors.sourceTimeoutMs;
    },
    get tentativasRetry() {
      return env.collectors.retryTentativas;
    },
    download: ({ signal }) => baixarSerie(fredId, { signal }),
    parse,
    normalize: criarNormalize(serie),
    persist: persistirObservacoes
  };
}

module.exports = { criarColetorFred, SERIES, parse };
