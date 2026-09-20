"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { somarDias, diaDaSemanaIso } = require("../../shared/utils/date-utils");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// CFTC Commitments of Traders - "Disaggregated Futures Only" via a API
// pública Socrata da CFTC (publicreporting.cftc.gov, dataset 72hh-3qpy; sem
// chave). Histórico desde 2006-06-13, semanal (verificado em 2026-09-20:
// 1.058 semanas para ouro e para milho).
//
// Observáveis BRUTOS por contrato (posição líquida é um FATOR, não é guardada):
//   OPEN_INTEREST, MM_LONG, MM_SHORT (managed money).
//
// COMO published_at É OBTIDO (o ponto delicado - ver ADR 0008):
//   O dado é de TERÇA e sai normalmente na SEXTA 15:30 ET, mas houve atrasos
//   reais (ex.: shutdown de out-nov/2025, backlog só zerou em 29/12/2025).
//   O Socrata expõe `:updated_at`: para as semanas publicadas ao vivo é o
//   instante real da publicação (verificado: 2026-09-18T19:30:07Z = sexta
//   15:30 ET). MAS o histórico anterior foi carregado em lote em 2022-08-01 e
//   esse timestamp não diz nada sobre a publicação original.
//   Regra: se `:updated_at` é compartilhado por muitas linhas (carga em lote)
//   ou é implausível, usa o cronograma oficial (sexta 15:30 ET) marcado como
//   ESTIMADO; caso contrário usa o `:updated_at` REAL (não estimado).

const URL_BASE = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
const SOURCE_CODE = "CFTC";

// Acima disto, um mesmo `:updated_at` em várias linhas = carga em lote, não
// publicação semanal (ao vivo, um lançamento carrega 1 linha por contrato).
const LIMITE_LINHAS_MESMO_INSTANTE = 10;

const CONTRATOS = {
  gold: { codigoCftc: "088691", prefixo: "CFTC.GOLD", nome: "Ouro (COMEX)" },
  corn: { codigoCftc: "002602", prefixo: "CFTC.CORN", nome: "Milho (CBOT)" }
};

const CAMPOS = [
  { campo: "open_interest_all", sufixo: "OPEN_INTEREST" },
  { campo: "m_money_positions_long_all", sufixo: "MM_LONG" },
  { campo: "m_money_positions_short_all", sufixo: "MM_SHORT" }
];

// Sexta-feira da semana do relatório, 15:30 America/New_York, em UTC.
function liberacaoPrevista(dataRelatorio) {
  const dow = diaDaSemanaIso(dataRelatorio);
  const sexta = somarDias(dataRelatorio, (5 - dow + 7) % 7);
  return zonedParaUtc(sexta, "15:30", "America/New_York");
}

function decidirPublicacao(item, contagemPorInstante) {
  const dataRelatorio = item.report_date_as_yyyy_mm_dd.slice(0, 10);
  const previsto = liberacaoPrevista(dataRelatorio);
  const atualizadoEm = item[":updated_at"] ? new Date(item[":updated_at"]) : null;

  const valido = atualizadoEm && !Number.isNaN(atualizadoEm.getTime());
  const emLote = valido && contagemPorInstante.get(item[":updated_at"]) > LIMITE_LINHAS_MESMO_INSTANTE;
  // Não pode ter sido publicado antes de a CFTC receber os dados (quarta).
  const plausivel = valido && atualizadoEm.getTime() >= previsto.getTime() - 2 * 24 * 3600 * 1000;

  if (valido && !emLote && plausivel) {
    return { publishedAt: atualizadoEm, estimado: false, basis: "source", extra: { socrataUpdatedAt: item[":updated_at"], previstoSexta1530ET: previsto.toISOString() } };
  }
  return { publishedAt: previsto, estimado: true, basis: "lag_rule", extra: { regraPublicacao: "sexta_1530_ET", motivo: emLote ? "carga_em_lote" : "updated_at_ausente_ou_implausivel" } };
}

function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta da CFTC em formato inesperado (esperava um array).");
  }
  return rawData;
}

function criarNormalize(contrato) {
  return function normalize(rawItems) {
    const validos = [];
    const invalidos = [];

    const contagemPorInstante = new Map();
    for (const item of rawItems) {
      const t = item[":updated_at"];
      if (t) contagemPorInstante.set(t, (contagemPorInstante.get(t) || 0) + 1);
    }

    for (const item of rawItems) {
      if (!/^\d{4}-\d{2}-\d{2}/.test(item?.report_date_as_yyyy_mm_dd || "")) {
        invalidos.push({ item, motivo: `Data do relatório inesperada: "${item?.report_date_as_yyyy_mm_dd}".` });
        continue;
      }
      const pub = decidirPublicacao(item, contagemPorInstante);

      for (const { campo, sufixo } of CAMPOS) {
        const valor = Number(item[campo]);
        if (item[campo] === undefined || item[campo] === "" || !Number.isFinite(valor)) {
          invalidos.push({ item, motivo: `Campo ${campo} ausente ou inválido: "${item[campo]}".` });
          continue;
        }
        validos.push({
          series_code: `${contrato.prefixo}.${sufixo}`,
          observed_at: item.report_date_as_yyyy_mm_dd.slice(0, 10),
          value: valor,
          unit: "contratos",
          source_code: SOURCE_CODE,
          published_at: pub.publishedAt,
          published_at_is_estimated: pub.estimado,
          published_at_basis: pub.basis,
          metadata: { fonte: "CFTC COT Disaggregated Futures Only", contrato: item.market_and_exchange_names, ...pub.extra }
        });
      }
    }

    return { validos, invalidos };
  };
}

function criarColetorCot(chave) {
  const contrato = CONTRATOS[chave];
  if (!contrato) throw new Error(`Contrato COT desconhecido: ${chave}`);

  const campos = [":updated_at", "report_date_as_yyyy_mm_dd", "market_and_exchange_names", ...CAMPOS.map((c) => c.campo)];
  const params = new URLSearchParams({
    $select: campos.join(","),
    $where: `cftc_contract_market_code='${contrato.codigoCftc}'`,
    $order: "report_date_as_yyyy_mm_dd",
    $limit: "50000"
  });

  return {
    codigo: `cftc-cot-${chave}`,
    seriesCodes: CAMPOS.map((c) => `${contrato.prefixo}.${c.sufixo}`),
    get timeoutMs() {
      return env.collectors.sourceTimeoutMs;
    },
    get tentativasRetry() {
      return env.collectors.retryTentativas;
    },
    download: ({ signal }) => baixar(`${URL_BASE}?${params}`, { signal, as: "json" }),
    parse,
    normalize: criarNormalize(contrato),
    persist: persistirObservacoes
  };
}

module.exports = { criarColetorCot, CONTRATOS, liberacaoPrevista, decidirPublicacao };
