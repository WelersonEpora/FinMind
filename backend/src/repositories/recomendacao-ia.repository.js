"use strict";

const { randomUUID } = require("node:crypto");
const { Op, UniqueConstraintError } = require("sequelize");
const { RecomendacaoIa } = require("../models");

// A recomendação da IA compartilhada pelas carteiras (ADR 0127, adendo de 2026-10-16), dado GLOBAL (ADR 0007): uma
// linha por chamada; append-only.

const chaveDe = ({ data, tipo, hash_entrada: hashEntrada, versao_prompt: versaoPrompt, modelo_pedido: modeloPedido }) => ({
  data,
  tipo,
  hash_entrada: hashEntrada,
  versao_prompt: versaoPrompt,
  modelo_pedido: modeloPedido
});

// A VALIDA desta chave (data, tipo, hash da entrada, versão do prompt e modelo), ou null.
async function buscarValida(chave) {
  return RecomendacaoIa.findOne({ where: { ...chaveDe(chave), situacao: "VALIDA" }, raw: true });
}

// Já houve réplica (válida ou não) desta combinação de ativos, com este prompt e modelo, entre as datas (a semana)?
async function existeReplicaEntre({ ativos, versao_prompt: versaoPrompt, modelo_pedido: modeloPedido }, inicio, fim) {
  const n = await RecomendacaoIa.count({ where: { tipo: "REPLICA", ativos, versao_prompt: versaoPrompt, modelo_pedido: modeloPedido, data: { [Op.between]: [inicio, fim] } } });
  return n > 0;
}

// Grava a chamada e devolve a linha. Duas VALIDAS da mesma chave (duas rotinas ao mesmo tempo): fica a primeira.
async function registrar(registro) {
  try {
    return (await RecomendacaoIa.create({ ...registro, id: randomUUID() })).get({ plain: true });
  } catch (erro) {
    if (erro instanceof UniqueConstraintError && registro.situacao === "VALIDA") return buscarValida(registro);
    throw erro;
  }
}

module.exports = { buscarValida, existeReplicaEntre, registrar };
