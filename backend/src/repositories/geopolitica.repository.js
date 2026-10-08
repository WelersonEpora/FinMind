"use strict";

const { Op } = require("sequelize");
const { GeopoliticaLeitura, GeopoliticaEvento, sequelize } = require("../models");
const { leituraDoAtivo } = require("../shared/eventos-mercado");

// Grava a leitura do dia (ADR 0047): numa transação, apaga a leitura que já existir na mesma data (os eventos saem
// em cascata) e insere a nova com os seus eventos. Reexecutar o dia termina sempre com exatamente o resultado da
// última execução, sem duplicata nem evento órfão (mesmo critério do AgroMind, ADR 0027 de lá).
async function substituirLeituraDoDia(leitura, eventos) {
  return sequelize.transaction(async (transaction) => {
    // Só a leitura da MESMA frente (ADR 0115): refazer a da soja não apaga a principal, e vice-versa.
    const frente = leitura.frente || "PRINCIPAL";
    const apagadas = await GeopoliticaLeitura.destroy({ where: { data_referencia: leitura.data_referencia, frente }, transaction });
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
async function existeLeituraDoDia(dataReferencia, frente = "PRINCIPAL") {
  return (await GeopoliticaLeitura.count({ where: { data_referencia: dataReferencia, frente } })) > 0;
}

// A leitura de uma data, com os eventos de um ativo em ordem de relevância (ou null).
async function buscarLeituraComEventos(dataReferencia, ativo) {
  return GeopoliticaLeitura.findOne({
    where: { data_referencia: dataReferencia, frente: leituraDoAtivo(ativo) },
    include: [{ model: GeopoliticaEvento, as: "eventos", where: { ativo }, required: false }],
    order: [[{ model: GeopoliticaEvento, as: "eventos" }, "ordem", "ASC"]]
  });
}

// A leitura mais recente (ou null), sem os eventos: a metodologia da tela Eventos (modelo e versão do prompt).
async function buscarUltimaLeitura(frente = "PRINCIPAL") {
  return GeopoliticaLeitura.findOne({ where: { frente }, order: [["data_referencia", "DESC"]] });
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

// Os eventos ACEITOS de um ativo marcados com um fator, das leituras de uma janela de datas, do mais recente para o mais
// antigo, com a data da leitura: o resultado de um fator de evento na Metodologia do Ativo (ADR 0050).
async function listarEventosAceitosDoFator({ ativo, fator, dataInicio, dataFim }) {
  return GeopoliticaEvento.findAll({
    where: { ativo, fator, aceito: true },
    include: [
      {
        model: GeopoliticaLeitura,
        as: "leitura",
        where: { data_referencia: { [Op.between]: [dataInicio, dataFim] } },
        attributes: ["data_referencia"]
      }
    ],
    order: [
      [{ model: GeopoliticaLeitura, as: "leitura" }, "data_referencia", "DESC"],
      ["ordem", "ASC"]
    ]
  });
}

// Os eventos ACEITOS de um ativo numa janela de datas, de qualquer fator (ou sem fator): a seção de eventos da base do
// prompt do ativo (ADR 0095), que tira depois os dos fatores de evento.
async function listarEventosAceitosDoAtivo({ ativo, dataInicio, dataFim }) {
  return GeopoliticaEvento.findAll({
    where: { ativo, aceito: true },
    include: [
      {
        model: GeopoliticaLeitura,
        as: "leitura",
        where: { data_referencia: { [Op.between]: [dataInicio, dataFim] } },
        attributes: ["data_referencia"]
      }
    ],
    order: [
      [{ model: GeopoliticaLeitura, as: "leitura" }, "data_referencia", "DESC"],
      ["ordem", "ASC"]
    ]
  });
}

// Os eventos ACEITOS de todos os ativos das leituras de uma janela de datas, com a data da leitura: o que a leitura do
// dia recebe para não repetir um fato já registrado (ADR 0092).
async function listarEventosAceitosRecentes({ dataInicio, dataFim }) {
  return GeopoliticaEvento.findAll({
    where: { aceito: true },
    attributes: ["ativo", "titulo", "fontes", "ordem"],
    include: [
      {
        model: GeopoliticaLeitura,
        as: "leitura",
        where: { data_referencia: { [Op.between]: [dataInicio, dataFim] } },
        attributes: ["data_referencia"]
      }
    ],
    order: [
      [{ model: GeopoliticaLeitura, as: "leitura" }, "data_referencia", "ASC"],
      ["ordem", "ASC"]
    ]
  });
}

// As datas com leitura de um ativo numa janela (o nível do ativo preenchido; as leituras anteriores ao ADR 0049 não
// têm o milho nem o café) e a data da 1ª leitura do ativo (ou null): os dias sem leitura da janela.
async function listarDatasDeLeitura({ ativo, dataInicio, dataFim }) {
  const coluna = `nivel_${ativo.toLowerCase()}`;
  const naJanela = await GeopoliticaLeitura.findAll({
    where: { data_referencia: { [Op.between]: [dataInicio, dataFim] }, [coluna]: { [Op.ne]: null } },
    attributes: ["data_referencia"],
    order: [["data_referencia", "ASC"]]
  });
  const primeira = await GeopoliticaLeitura.findOne({
    where: { [coluna]: { [Op.ne]: null } },
    attributes: ["data_referencia"],
    order: [["data_referencia", "ASC"]]
  });
  return { datas: naJanela.map((l) => l.data_referencia), primeiraData: primeira?.data_referencia ?? null };
}

module.exports = {
  existeLeituraDoDia,
  substituirLeituraDoDia,
  buscarLeituraComEventos,
  buscarUltimaLeitura,
  listarEventos,
  buscarLeituraPorId,
  listarEventosAceitosDoFator,
  listarEventosAceitosDoAtivo,
  listarEventosAceitosRecentes,
  listarDatasDeLeitura
};
