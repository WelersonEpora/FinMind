"use strict";

const env = require("../../config/env");
const marketQuoteRepository = require("../../repositories/market-quote.repository");
const { UpstreamServiceError } = require("../../shared/errors");

// SGS série 1 = "Taxa de câmbio - Livre - Dólar americano (venda) - diário"
// (fechamento diário / PTAX venda do Banco Central - NÃO é cotação
// intradiária/tempo real). Confirmado em docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md.
const SERIE_SGS_DOLAR_VENDA = 1;
const URL_BASE = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIE_SGS_DOLAR_VENDA}/dados`;

const INSTRUMENT_CODE = "USD_BRL";
const SOURCE_CODE = "BCB_SGS_1";
const MODALITY = "venda";

const REGEX_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function converterDataReferencia(dataBr) {
  const match = REGEX_DATA_BR.exec(dataBr);
  if (!match) return null;

  const [, dia, mes, ano] = match;
  const dataIso = `${ano}-${mes}-${dia}`;
  const data = new Date(`${dataIso}T00:00:00Z`);
  return Number.isNaN(data.getTime()) ? null : dataIso;
}

async function buscarJson(url, signal) {
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar a API do BCB: ${err.message}`);
  }

  if (!response.ok) {
    throw new UpstreamServiceError(`API do BCB respondeu com status ${response.status}.`);
  }

  return response.json();
}

async function download({ signal }) {
  return buscarJson(`${URL_BASE}/ultimos/10?formato=json`, signal);
}

// Usado só pelo backfill (scripts/backfill-dolar.js) - a API do BCB rejeita
// (HTTP 406) intervalos maiores que ~10 anos, então um backfill muito longo
// precisaria ser chamado em blocos; não implementado aqui por não haver
// necessidade real ainda (backfill usado é de poucos meses).
async function downloadIntervalo({ dataInicial, dataFinal, signal }) {
  return buscarJson(`${URL_BASE}?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`, signal);
}

function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta da API do BCB em formato inesperado (esperava um array).");
  }
  return rawData;
}

function normalize(rawItems) {
  const validos = [];
  const invalidos = [];

  for (const item of rawItems) {
    const referenceDate = converterDataReferencia(item?.data);
    const value = Number(String(item?.valor).replace(",", "."));

    if (!referenceDate) {
      invalidos.push({ item, motivo: `Data em formato inesperado: "${item?.data}".` });
      continue;
    }
    if (!Number.isFinite(value) || value <= 0) {
      invalidos.push({ item, motivo: `Valor inválido: "${item?.valor}".` });
      continue;
    }

    validos.push({
      instrument_code: INSTRUMENT_CODE,
      source_code: SOURCE_CODE,
      modality: MODALITY,
      reference_date: referenceDate,
      value,
      unit: "BRL",
      metadata: { fonte: "BCB SGS", serie: SERIE_SGS_DOLAR_VENDA, dataOriginal: item.data }
    });
  }

  return { validos, invalidos };
}

async function persist(validos, { execucaoId }) {
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const falhas = [];

  for (const dados of validos) {
    try {
      const acao = await marketQuoteRepository.upsertPorChaveNatural({ ...dados, collection_execution_id: execucaoId });
      if (acao === "criado") criados += 1;
      else if (acao === "atualizado") atualizados += 1;
      else ignorados += 1;
    } catch (err) {
      falhas.push({ item: dados, motivo: err.message });
    }
  }

  return { criados, atualizados, ignorados, falhas };
}

module.exports = {
  codigo: "bcb-usd-brl-venda",
  get timeoutMs() {
    return env.collectors.bcbSgsTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist
};
