"use strict";

const { Op } = require("sequelize");
const { GeopoliticaLeitura, GeopoliticaEvento, sequelize } = require("../models");

// Grava a leitura do dia (ADR 0047): numa transação, apaga a leitura que já existir na mesma data (os eventos saem
// em cascata) e insere a nova com os seus eventos. Reexecutar o dia termina sempre com exatamente o resultado da
// última execução, sem duplicata nem evento órfão (mesmo critério do AgroMind, ADR 0027 de lá).
async function substituirLeituraDoDia(leitura, eventos) {
  return sequelize.transaction(async (transaction) => {
    const apagadas = await GeopoliticaLeitura.destroy({ where: { data_referencia: leitura.data_referencia }, transaction });
    const criada = await GeopoliticaLeitura.create(leitura, { transaction });
    if (eventos.length > 0) {
      await GeopoliticaEvento.bulkCreate(
        eventos.map((evento) => ({ ...evento, leitura_id: criada.id })),
        { transaction }
      );
    }
    return { substituiu: apagadas > 0 };
  });
}

// Já existe leitura gravada nesta data? (o coletor pula a chamada à IA quando sim: uma leitura por dia.)
async function existeLeituraDoDia(dataReferencia) {
  return (await GeopoliticaLeitura.count({ where: { data_referencia: dataReferencia } })) > 0;
}

// A leitura de uma data, com os eventos de um ativo em ordem de relevância (ou null).
async function buscarLeituraComEventos(dataReferencia, ativo) {
  return GeopoliticaLeitura.findOne({
    where: { data_referencia: dataReferencia },
    include: [{ model: GeopoliticaEvento, as: "eventos", where: { ativo }, required: false }],
    order: [[{ model: GeopoliticaEvento, as: "eventos" }, "ordem", "ASC"]]
  });
}

// A leitura mais recente (ou null), sem os eventos: a metodologia da tela Eventos (modelo e versão do prompt).
async function buscarUltimaLeitura() {
  return GeopoliticaLeitura.findOne({ order: [["data_referencia", "DESC"]] });
}

// Eventos para a tela, do mais recente para o mais antigo, com a data da leitura de cada um.
async function listarEventos({ ativo, tipo, aceito, dataInicio, dataFim, pagina, tamanhoPagina, ordem }) {
  const where = {};
  if (ativo) where.ativo = ativo;
  if (tipo) where.tipo = tipo;
  if (aceito !== undefined) where.aceito = aceito;

  const whereLeitura = {};
  if (dataInicio || dataFim) {
    whereLeitura.data_referencia = {};
    if (dataInicio) whereLeitura.data_referencia[Op.gte] = dataInicio;
    if (dataFim) whereLeitura.data_referencia[Op.lte] = dataFim;
  }

  const { rows, count } = await GeopoliticaEvento.findAndCountAll({
    where,
    include: [
      {
        model: GeopoliticaLeitura,
        as: "leitura",
        where: whereLeitura,
        attributes: ["data_referencia"]
      }
    ],
    order: [
      [{ model: GeopoliticaLeitura, as: "leitura" }, "data_referencia", ordem || "DESC"],
      ["ativo", "ASC"],
      ["ordem", "ASC"]
    ],
    limit: tamanhoPagina,
    offset: (pagina - 1) * tamanhoPagina
  });
  return { registros: rows, total: count };
}

// Uma leitura pelo id, sem os eventos: o detalhe da IA (prompt, resposta e pesquisa) da tela Eventos.
async function buscarLeituraPorId(id) {
  return GeopoliticaLeitura.findByPk(id);
}

module.exports = { existeLeituraDoDia, substituirLeituraDoDia, buscarLeituraComEventos, buscarUltimaLeitura, listarEventos, buscarLeituraPorId };
