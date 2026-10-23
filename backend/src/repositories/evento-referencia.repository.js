"use strict";

const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");
const { EventoReferencia } = require("../models");

// Os eventos de referência do teste de captura (ADR 0144).

// Os de um ativo num período (pela data do evento), do mais antigo ao mais recente.
async function listar({ ativo, dataInicio, dataFim }) {
  return EventoReferencia.findAll({
    where: { ativo, data: { [Op.between]: [dataInicio, dataFim] } },
    order: [
      ["data", "ASC"],
      ["origem", "ASC"],
      ["titulo", "ASC"]
    ]
  });
}

// Os candidatos gerados: grava os que ainda não existem (pela `chave`) e nunca mexe nos que existem, para não apagar a
// avaliação. -> quantos foram criados.
async function inserirCandidatos(candidatos) {
  if (candidatos.length === 0) return 0;
  const existentes = new Set(
    (await EventoReferencia.findAll({ where: { chave: candidatos.map((c) => c.chave) }, attributes: ["chave"] })).map((r) => r.chave)
  );
  const novos = candidatos.filter((c) => !existentes.has(c.chave)).map((c) => ({ id: randomUUID(), ...c }));
  if (novos.length > 0) await EventoReferencia.bulkCreate(novos);
  return novos.length;
}

async function criar(campos) {
  return EventoReferencia.create({ id: randomUUID(), ...campos });
}

async function buscarPorId(id) {
  return EventoReferencia.findByPk(id);
}

async function atualizar(id, campos) {
  await EventoReferencia.update(campos, { where: { id } });
  return EventoReferencia.findByPk(id);
}

async function remover(id) {
  await EventoReferencia.destroy({ where: { id } });
}

module.exports = { listar, inserirCandidatos, criar, buscarPorId, atualizar, remover };
