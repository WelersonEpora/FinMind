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

  // Busca por PARTE do nome do coletor (ex.: "imea" acha "imea-milho-safra" e "imea-custo-milho"), não só o código exato.
  if (coletor) where.collector_code = { [Op.like]: `%${coletor}%` };
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

// Aceita um código ou uma lista de códigos - um observável que agrupa mais
// de um coletor (ex.: SELIC = bcb-selic-meta + bcb-selic-realizada, ver
// ADR 0006) mostra a execução mais recente entre todos eles.
async function buscarUltimaPorColetor(collectorCode) {
  const codigos = Array.isArray(collectorCode) ? collectorCode : [collectorCode];
  return CollectionExecution.findOne({
    where: { collector_code: { [Op.in]: codigos } },
    order: [["started_at", "DESC"]]
  });
}

module.exports = { criar, atualizar, buscarPorId, listar, buscarUltimaPorColetor };
