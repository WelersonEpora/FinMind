"use strict";

const { randomUUID } = require("node:crypto");
const { Carteira, CarteiraParametrosVersao, CarteiraTrilha, sequelize } = require("../models");

// Carteiras virtuais (ADR 0127), dado PRIVADO do espaço (ADR 0007, §6). Todo acesso passa por `forWorkspace(id)`: cada
// consulta filtra pelo espaço, e um id de carteira de outro espaço nunca é encontrado. Não há `findByPk` solto. A
// exceção é `listarAtivasParaRotina`, que só devolve os pares (espaço, carteira) para a rotina diária abrir cada uma
// pelo repositório escopado.
//
// As versões dos parâmetros são append-only: só `registrarVersao`, nenhum update nem delete.

const TRILHAS = Object.freeze([
  { tipo: "OPERADOR", calculada: false },
  { tipo: "IA", calculada: false },
  { tipo: "DETERMINISTICA", calculada: false },
  { tipo: "CAIXA", calculada: true },
  { tipo: "COMPRAR_E_SEGURAR", calculada: true },
  { tipo: "PERSISTENCIA", calculada: true }
]);

// Roda `fn` na transação recebida ou numa nova.
const naTransacao = (transaction, fn) => (transaction ? fn(transaction) : sequelize.transaction(fn));

function forWorkspace(workspaceId) {
  if (!workspaceId) throw new Error("carteira.repository: o espaço é obrigatório (ADR 0007).");
  const doEspaco = (extra = {}) => ({ workspace_id: workspaceId, ...extra });

  return {
    workspaceId,

    async listar({ transaction } = {}) {
      return Carteira.findAll({ where: doEspaco(), order: [["created_at", "ASC"]], transaction });
    },

    async buscar(carteiraId, { transaction } = {}) {
      return Carteira.findOne({ where: doEspaco({ id: carteiraId }), transaction });
    },

    async buscarPorNome(nome, { transaction } = {}) {
      return Carteira.findOne({ where: doEspaco({ nome }), transaction });
    },

    // A carteira, a versão 1 dos parâmetros e as seis trilhas, numa transação: nunca existe carteira sem trilhas.
    async criarComTrilhas({ carteira, parametros, motivo, autorUserId }, { transaction } = {}) {
      return naTransacao(transaction, async (t) => {
        const criada = await Carteira.create({ ...carteira, id: randomUUID(), workspace_id: workspaceId, situacao: "ATIVA", criada_por: autorUserId }, { transaction: t });
        await CarteiraParametrosVersao.create(
          {
            id: randomUUID(),
            workspace_id: workspaceId,
            carteira_id: criada.id,
            versao: 1,
            tipo: "INICIAL",
            vigente_desde: criada.data_inicio,
            parametros,
            motivo,
            autor_user_id: autorUserId
          },
          { transaction: t }
        );
        await CarteiraTrilha.bulkCreate(
          TRILHAS.map((trilha) => ({ ...trilha, id: randomUUID(), workspace_id: workspaceId, carteira_id: criada.id })),
          { transaction: t }
        );
        return criada;
      });
    },

    async listarTrilhas(carteiraId, { transaction } = {}) {
      return CarteiraTrilha.findAll({ where: doEspaco({ carteira_id: carteiraId }), order: [["created_at", "ASC"]], transaction });
    },

    async listarVersoes(carteiraId, { transaction } = {}) {
      return CarteiraParametrosVersao.findAll({ where: doEspaco({ carteira_id: carteiraId }), order: [["versao", "DESC"]], transaction });
    },

    // Uma versão nova (append-only). O número é o seguinte ao último desta carteira; a carteira tem de ser deste
    // espaço (a FK composta recusa a de outro).
    async registrarVersao({ carteiraId, tipo, vigenteDesde, parametros, motivo, autorUserId }, { transaction } = {}) {
      return naTransacao(transaction, async (t) => {
        const ultima = await CarteiraParametrosVersao.max("versao", { where: doEspaco({ carteira_id: carteiraId }), transaction: t });
        return CarteiraParametrosVersao.create(
          {
            id: randomUUID(),
            workspace_id: workspaceId,
            carteira_id: carteiraId,
            versao: (ultima || 0) + 1,
            tipo,
            vigente_desde: vigenteDesde,
            parametros,
            motivo,
            autor_user_id: autorUserId
          },
          { transaction: t }
        );
      });
    }
  };
}

// Só para a rotina diária (ADR 0007, §7): os pares, nada do conteúdo.
async function listarAtivasParaRotina({ transaction } = {}) {
  return Carteira.findAll({ where: { situacao: "ATIVA" }, attributes: ["workspace_id", "id"], order: [["created_at", "ASC"]], raw: true, transaction });
}

module.exports = { forWorkspace, listarAtivasParaRotina, TRILHAS };
