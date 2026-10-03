"use strict";

const { AnaliseDiaria, sequelize } = require("../models");

// Grava a leitura do ativo no dia (ADR 0052): numa transação, apaga a que já existir no mesmo ativo e data e insere a
// nova. Reexecutar o dia termina com exatamente o resultado da última execução (mesmo critério da leitura de eventos).
async function substituirAnaliseDoDia(analise) {
  return sequelize.transaction(async (transaction) => {
    const apagadas = await AnaliseDiaria.destroy({ where: { ativo: analise.ativo, data_analise: analise.data_analise }, transaction });
    await AnaliseDiaria.create(analise, { transaction });
    return { substituiu: apagadas > 0 };
  });
}

// Já existe leitura do ativo nesta data? (o coletor pula a chamada à IA quando sim: uma leitura por dia.)
async function existeAnaliseDoDia(ativo, dataAnalise) {
  return (await AnaliseDiaria.count({ where: { ativo, data_analise: dataAnalise } })) > 0;
}

// A leitura do ativo numa data (ou null).
async function buscarAnaliseDoDia(ativo, dataAnalise) {
  return AnaliseDiaria.findOne({ where: { ativo, data_analise: dataAnalise } });
}

module.exports = { substituirAnaliseDoDia, existeAnaliseDoDia, buscarAnaliseDoDia };
