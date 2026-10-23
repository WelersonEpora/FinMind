"use strict";

const { randomUUID } = require("node:crypto");
const { RevisaoEvento } = require("../models");

// As revisões dos eventos de magnitude 3 (ADR 0149).

// As revisões de um ativo, pela chave natural do evento.
async function listarPorChaves(chaves) {
  if (chaves.length === 0) return [];
  return RevisaoEvento.findAll({ where: { chave: chaves } });
}

async function buscarPorChave(chave) {
  return RevisaoEvento.findOne({ where: { chave } });
}

async function criar(campos) {
  return RevisaoEvento.create({ id: randomUUID(), ...campos });
}

async function remover(chave) {
  await RevisaoEvento.destroy({ where: { chave } });
}

module.exports = { listarPorChaves, buscarPorChave, criar, remover };
