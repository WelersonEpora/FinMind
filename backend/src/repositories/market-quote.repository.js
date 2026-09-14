"use strict";

const { Op, fn, col } = require("sequelize");
const { MarketQuote } = require("../models");

async function buscarMaisRecente(instrumentCode) {
  return MarketQuote.findOne({
    where: { instrument_code: instrumentCode },
    order: [["reference_date", "DESC"]]
  });
}

const COLUNAS_ORDENACAO = { referenceDate: "reference_date", value: "value" };

async function buscarHistorico({ instrumentCode, dataInicio, dataFim, pagina, tamanhoPagina, ordenarPor, ordem }) {
  const where = { instrument_code: instrumentCode };

  if (dataInicio || dataFim) {
    where.reference_date = {};
    if (dataInicio) where.reference_date[Op.gte] = dataInicio;
    if (dataFim) where.reference_date[Op.lte] = dataFim;
  }

  const coluna = COLUNAS_ORDENACAO[ordenarPor] || COLUNAS_ORDENACAO.referenceDate;

  const { rows, count } = await MarketQuote.findAndCountAll({
    where,
    order: [[coluna, ordem || "DESC"]],
    limit: tamanhoPagina,
    offset: (pagina - 1) * tamanhoPagina
  });

  return { registros: rows, total: count };
}

async function buscarEstatisticas(instrumentCode) {
  const resultado = await MarketQuote.findOne({
    where: { instrument_code: instrumentCode },
    attributes: [
      [fn("MIN", col("reference_date")), "primeiraData"],
      [fn("MAX", col("reference_date")), "ultimaData"],
      [fn("COUNT", col("id")), "totalObservacoes"]
    ],
    raw: true
  });

  return {
    primeiraData: resultado?.primeiraData || null,
    ultimaData: resultado?.ultimaData || null,
    totalObservacoes: Number(resultado?.totalObservacoes || 0)
  };
}

function valorMudou(existente, dados) {
  return Number(existente.value) !== Number(dados.value) || existente.unit !== dados.unit;
}

// Upsert pela chave natural (instrument_code, source_code, modality,
// reference_date) - único índice único da tabela (ver migration). Reexecutar
// a coleta pro mesmo dia com o mesmo valor não gera update nem duplicata.
async function upsertPorChaveNatural(dados) {
  const existente = await MarketQuote.findOne({
    where: {
      instrument_code: dados.instrument_code,
      source_code: dados.source_code,
      modality: dados.modality,
      reference_date: dados.reference_date
    }
  });

  if (!existente) {
    await MarketQuote.create(dados);
    return "criado";
  }

  if (!valorMudou(existente, dados)) {
    return "ignorado";
  }

  await existente.update({
    value: dados.value,
    unit: dados.unit,
    collection_execution_id: dados.collection_execution_id,
    metadata: dados.metadata
  });
  return "atualizado";
}

module.exports = { buscarMaisRecente, buscarHistorico, buscarEstatisticas, upsertPorChaveNatural };
