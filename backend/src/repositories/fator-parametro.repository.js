"use strict";

const crypto = require("node:crypto");
const { FatorParametroVersao, User, sequelize } = require("../models");

// Versões dos parâmetros da camada C de um fator (ADR 0050). Append-only: nada aqui altera ou apaga uma versão.

const comAutor = { model: User, as: "autor", attributes: ["id", "name"] };

function paraSaida(linha) {
  if (!linha) return null;
  return {
    versao: linha.versao,
    parametros: linha.parametros,
    motivo: linha.motivo,
    alteradoPor: linha.autor ? { id: linha.autor.id, nome: linha.autor.name } : { id: linha.alterado_por, nome: null },
    alteradoEm: linha.created_at
  };
}

// A versão em vigor (a de número maior), ou null quando o fator ainda usa os padrões do código.
async function buscarVigente(fatorCodigo) {
  return paraSaida(await FatorParametroVersao.findOne({ where: { fator_codigo: fatorCodigo }, include: [comAutor], order: [["versao", "DESC"]] }));
}

// Todas as versões, da mais recente para a mais antiga.
async function listarVersoes(fatorCodigo) {
  const linhas = await FatorParametroVersao.findAll({ where: { fator_codigo: fatorCodigo }, include: [comAutor], order: [["versao", "DESC"]] });
  return linhas.map(paraSaida);
}

// Grava a próxima versão numa transação. Dois admins salvando ao mesmo tempo: o índice único (fator, versão) barra o
// segundo, que recebe o erro de unicidade (o service responde 409).
async function criarVersao({ fatorCodigo, parametros, motivo, alteradoPor }) {
  return sequelize.transaction(async (transaction) => {
    const maior = (await FatorParametroVersao.max("versao", { where: { fator_codigo: fatorCodigo }, transaction })) || 0;
    const criada = await FatorParametroVersao.create(
      { id: crypto.randomUUID(), fator_codigo: fatorCodigo, versao: maior + 1, parametros, motivo, alterado_por: alteradoPor },
      { transaction }
    );
    return criada.versao;
  });
}

module.exports = { buscarVigente, listarVersoes, criarVersao };
