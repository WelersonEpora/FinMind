"use strict";

const { Op } = require("sequelize");
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

// As leituras de um ativo para a Qualidade da IA (ADR 0064), em ordem de data, só com o que a avaliação usa: da
// entrada, o preço recebido e os horizontes; das leituras, horizonte, tendência, faixa e confiança. O prompt, a resposta
// e os fatores (dezenas de milhares de caracteres por leitura) ficam no banco. Filtros opcionais: período da data da
// análise e versão da configuração.
async function listarParaAvaliacao({ ativo, desde, ate, versaoConfiguracao }) {
  const where = { ativo };
  if (desde || ate) where.data_analise = { ...(desde ? { [Op.gte]: desde } : {}), ...(ate ? { [Op.lte]: ate } : {}) };
  if (versaoConfiguracao != null) where.versao_configuracao = versaoConfiguracao;
  return AnaliseDiaria.findAll({
    where,
    attributes: [
      "data_analise",
      "created_at",
      "versao_prompt",
      "versao_metodologia",
      "versao_configuracao",
      [
        sequelize.literal(
          "jsonb_build_object('precoReferencia', entrada->'precoReferencia', 'referenciaHorizontes', entrada->'referenciaHorizontes', 'horizontes', entrada->'horizontes')"
        ),
        "entrada"
      ],
      [
        sequelize.literal(
          "(SELECT COALESCE(jsonb_agg(jsonb_build_object('horizonte', l->'horizonte', 'tendencia', l->'tendencia', 'faixa', l->'faixa', 'confianca', l->'confianca')), '[]'::jsonb) FROM jsonb_array_elements(leituras) AS l)"
        ),
        "leituras"
      ]
    ],
    order: [["data_analise", "ASC"]],
    raw: true
  });
}

// As versões da configuração que um ativo já teve (o filtro da Qualidade da IA).
async function listarVersoesConfiguracao(ativo) {
  const linhas = await AnaliseDiaria.findAll({
    where: { ativo },
    attributes: [[sequelize.fn("DISTINCT", sequelize.col("versao_configuracao")), "versao"]],
    raw: true
  });
  return linhas.map((l) => Number(l.versao)).sort((a, b) => a - b);
}

module.exports = { substituirAnaliseDoDia, existeAnaliseDoDia, buscarAnaliseDoDia, listarParaAvaliacao, listarVersoesConfiguracao };
