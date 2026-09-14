"use strict";

const { Op } = require("sequelize");
const { CollectionExecution } = require("../models");

async function criar(dados) {
  return CollectionExecution.create(dados);
}

async function atualizar(execucao, dados) {
  return execucao.update(dados);
}

async function buscarPorId(id) {
  return CollectionExecution.findByPk(id);
}

const COLUNAS_ORDENACAO = { iniciadoEm: "started_at", duracaoMs: "duration_ms", status: "status" };

async function listar({ coletor, status, dataInicio, dataFim, pagina, tamanhoPagina, ordenarPor, ordem }) {
  const where = {};

  if (coletor) where.collector_code = coletor;
  if (status) where.status = status;

  if (dataInicio || dataFim) {
    where.started_at = {};
    if (dataInicio) where.started_at[Op.gte] = dataInicio;
    if (dataFim) where.started_at[Op.lte] = dataFim;
  }

  const coluna = COLUNAS_ORDENACAO[ordenarPor] || COLUNAS_ORDENACAO.iniciadoEm;

  const { rows, count } = await CollectionExecution.findAndCountAll({
    where,
    order: [[coluna, ordem || "DESC"]],
    limit: tamanhoPagina,
    offset: (pagina - 1) * tamanhoPagina
  });

  return { registros: rows, total: count };
}

async function buscarUltimaPorColetor(collectorCode) {
  return CollectionExecution.findOne({
    where: { collector_code: collectorCode },
    order: [["started_at", "DESC"]]
  });
}

module.exports = { criar, atualizar, buscarPorId, listar, buscarUltimaPorColetor };
