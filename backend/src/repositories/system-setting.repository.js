"use strict";

const { SystemSetting } = require("../models");

// Configurações da plataforma (tabela GLOBAL `system_setting`, chave -> valor em texto). Hoje, as chaves do Gemini
// cadastradas na tela, cifradas (ADR 0156).

async function obter(chave) {
  const linha = await SystemSetting.findByPk(chave);
  return linha ? linha.get({ plain: true }) : null;
}

async function gravar(chave, valor, descricao) {
  await SystemSetting.upsert({ key: chave, value: valor, description: descricao ?? null });
}

async function remover(chave) {
  return SystemSetting.destroy({ where: { key: chave } });
}

module.exports = { obter, gravar, remover };
