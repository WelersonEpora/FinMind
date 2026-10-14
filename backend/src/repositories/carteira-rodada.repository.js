"use strict";

const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");
const {
  CarteiraRodada,
  CarteiraRodadaLeitura,
  CarteiraIntencao,
  CarteiraPosicao,
  CarteiraPosicaoEvento,
  CarteiraOrdem,
  CarteiraLancamento,
  CarteiraPatrimonioDiario,
  CarteiraRecomendacao,
  sequelize
} = require("../models");

// A rodada diária e o razão das carteiras virtuais (ADR 0127, §3 e §9), dado PRIVADO do espaço (ADR 0007, §6): só por
// `forWorkspace(id)`, e cada consulta filtra pelo espaço. Posições e ordens saem e entram no formato do domínio
// (carteiras/motor.js), com os números convertidos (o Postgres devolve DECIMAL como texto).

const num = (v) => (v == null ? null : Number(v));
const naTransacao = (transaction, fn) => (transaction ? fn(transaction) : sequelize.transaction(fn));

function posicaoDoBanco(p) {
  return {
    id: p.id,
    trilhaId: p.trilha_id,
    ativo: p.ativo,
    lado: p.lado,
    contrato: p.contrato,
    origem: p.origem,
    dataEntrada: p.data_entrada,
    entrada: num(p.entrada),
    distancia: num(p.distancia),
    stopInicial: num(p.stop_inicial),
    stop: num(p.stop),
    alvo1: num(p.alvo1),
    alvo2: num(p.alvo2),
    quantidadeInicial: num(p.quantidade_inicial),
    quantidadeAberta: num(p.quantidade_aberta),
    risco1R: num(p.risco_1r),
    alvo1Atingido: p.alvo1_atingido,
    reduzida: p.reduzida,
    ultimoAjuste: num(p.ultimo_ajuste),
    resultadoR: num(p.resultado_r),
    resultadoMoeda: num(p.resultado_moeda),
    situacao: p.situacao,
    dataSaida: p.data_saida,
    motivoSaida: p.motivo_saida
  };
}

function posicaoParaBanco(p, workspaceId, trilhaId, { encerrada = false, data = null } = {}) {
  return {
    id: p.id,
    workspace_id: workspaceId,
    trilha_id: trilhaId,
    ativo: p.ativo,
    lado: p.lado,
    contrato: p.contrato,
    origem: p.origem ?? null,
    data_entrada: p.dataEntrada,
    entrada: p.entrada,
    distancia: p.distancia,
    stop_inicial: p.stopInicial,
    stop: p.stop,
    alvo1: p.alvo1,
    alvo2: p.alvo2,
    quantidade_inicial: p.quantidadeInicial,
    quantidade_aberta: p.quantidadeAberta,
    risco_1r: p.risco1R,
    alvo1_atingido: p.alvo1Atingido,
    reduzida: p.reduzida,
    ultimo_ajuste: p.ultimoAjuste,
    resultado_r: p.resultadoR,
    resultado_moeda: p.resultadoMoeda ?? 0,
    situacao: encerrada ? "ENCERRADA" : "ABERTA",
    data_saida: encerrada ? data : null,
    motivo_saida: encerrada ? p.motivoSaida ?? null : null
  };
}

function ordemDoBanco(o) {
  return {
    id: o.id,
    trilhaId: o.trilha_id,
    rodadaId: o.rodada_id,
    dataExecucao: o.data_execucao,
    tipo: o.tipo,
    motivo: o.motivo,
    ativo: o.ativo,
    lado: o.lado,
    contrato: o.contrato,
    quantidade: num(o.quantidade),
    distancia: num(o.distancia),
    semStop: o.sem_stop,
    precoInformado: num(o.preco_informado),
    stopInformado: num(o.stop_informado),
    posicaoId: o.posicao_id,
    situacao: o.situacao,
    detalhes: o.detalhes ?? null
  };
}

const eventoDoBanco = (e) => ({
  id: e.id,
  posicaoId: e.posicao_id,
  data: e.data,
  tipo: e.tipo,
  preco: num(e.preco),
  quantidade: num(e.quantidade),
  detalhes: e.detalhes ?? null,
  registradoEm: e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at
});

// As ordens que a liquidação leu mudaram antes de ela gravar (o operador registrou ou cancelou no meio): a rotina lê de
// novo e liquida outra vez.
class OrdensMudaramError extends Error {
  constructor() {
    super("As ordens da rodada mudaram durante a liquidação.");
    this.code = "ORDENS_MUDARAM";
  }
}

function forWorkspace(workspaceId) {
  if (!workspaceId) throw new Error("carteira-rodada.repository: o espaço é obrigatório (ADR 0007).");
  const doEspaco = (extra = {}) => ({ workspace_id: workspaceId, ...extra });

  return {
    workspaceId,

    async buscarRodada(carteiraId, data, { transaction } = {}) {
      return CarteiraRodada.findOne({ where: doEspaco({ carteira_id: carteiraId, data }), raw: true, transaction });
    },

    async ultimaRodada(carteiraId, { transaction } = {}) {
      return CarteiraRodada.findOne({ where: doEspaco({ carteira_id: carteiraId }), order: [["data", "DESC"]], raw: true, transaction });
    },

    async listarPendentes(carteiraId, { transaction } = {}) {
      return CarteiraRodada.findAll({ where: doEspaco({ carteira_id: carteiraId, liquidacao: "PENDENTE" }), order: [["data", "ASC"]], raw: true, transaction });
    },

    // A rodada com tudo o que a decisão produziu, numa transação: a cópia das leituras, as recomendações da IA (a
    // principal e, uma vez por semana, a réplica), as intenções e as ordens.
    async criarRodada({ carteiraId, data, decisao, parametrosVersao = null, detalhes = null, leituras = [], recomendacoes = [], intencoes = [], ordens = [] }, { transaction } = {}) {
      return naTransacao(transaction, async (t) => {
        const rodada = await CarteiraRodada.create(
          { id: randomUUID(), workspace_id: workspaceId, carteira_id: carteiraId, data, decisao, parametros_versao: parametrosVersao, decidida_em: new Date(), liquidacao: "PENDENTE", detalhes },
          { transaction: t }
        );
        const filho = (linha) => ({ id: randomUUID(), workspace_id: workspaceId, rodada_id: rodada.id, ...linha });
        if (leituras.length) await CarteiraRodadaLeitura.bulkCreate(leituras.map(filho), { transaction: t });
        if (recomendacoes.length) await CarteiraRecomendacao.bulkCreate(recomendacoes.map((r) => filho({ ...r, data })), { transaction: t });
        if (intencoes.length) await CarteiraIntencao.bulkCreate(intencoes.map(filho), { transaction: t });
        if (ordens.length) {
          await CarteiraOrdem.bulkCreate(
            ordens.map((o) =>
              filho({
                trilha_id: o.trilhaId,
                data_execucao: data,
                ativo: o.ativo,
                tipo: o.tipo,
                motivo: o.motivo,
                lado: o.lado,
                contrato: o.contrato,
                quantidade: o.quantidade,
                distancia: o.distancia ?? null,
                sem_stop: o.semStop === true,
                posicao_id: o.posicaoId ?? null,
                situacao: "CRIADA",
                detalhes: o.detalhes ?? null
              })
            ),
            { transaction: t }
          );
        }
        return rodada.get({ plain: true });
      });
    },

    async posicoesAbertas(trilhaId, { transaction } = {}) {
      const linhas = await CarteiraPosicao.findAll({ where: doEspaco({ trilha_id: trilhaId, situacao: "ABERTA" }), order: [["data_entrada", "ASC"]], raw: true, transaction });
      return linhas.map(posicaoDoBanco);
    },

    // As encerradas com resultado em R, para a trava de perdas seguidas.
    async encerradas(trilhaId, { transaction } = {}) {
      const linhas = await CarteiraPosicao.findAll({
        where: doEspaco({ trilha_id: trilhaId, situacao: "ENCERRADA", resultado_r: { [Op.ne]: null } }),
        attributes: ["data_saida", "resultado_r"],
        order: [["data_saida", "ASC"]],
        raw: true,
        transaction
      });
      return linhas.map((l) => ({ dataSaida: l.data_saida, resultadoR: num(l.resultado_r) }));
    },

    // O patrimônio diário antes de `ate` (exclusive), em ordem; os `limite` mais recentes.
    async seriePatrimonio(trilhaId, { ate, limite = 60 }, { transaction } = {}) {
      const linhas = await CarteiraPatrimonioDiario.findAll({
        where: doEspaco({ trilha_id: trilhaId, data: { [Op.lt]: ate } }),
        attributes: ["data", "patrimonio"],
        order: [["data", "DESC"]],
        limit: limite,
        raw: true,
        transaction
      });
      return linhas.reverse().map((l) => ({ data: l.data, patrimonio: num(l.patrimonio) }));
    },

    // Leitura para as telas (etapa 5). As trilhas recebidas são as da carteira (o serviço as lê pelo repositório dela).

    // As rodadas mais recentes, com as intenções e as ordens de cada uma.
    async listarRodadas(carteiraId, { limite = 30, transaction } = {}) {
      const rodadas = await CarteiraRodada.findAll({ where: doEspaco({ carteira_id: carteiraId }), order: [["data", "DESC"]], limit: limite, raw: true, transaction });
      const ids = rodadas.map((r) => r.id);
      if (!ids.length) return [];
      const [intencoes, ordens] = await Promise.all([
        CarteiraIntencao.findAll({ where: doEspaco({ rodada_id: ids }), order: [["prioridade", "ASC"]], raw: true, transaction }),
        CarteiraOrdem.findAll({ where: doEspaco({ rodada_id: ids }), order: [["created_at", "ASC"]], raw: true, transaction })
      ]);
      return rodadas.map((r) => ({
        ...r,
        intencoes: intencoes.filter((i) => i.rodada_id === r.id),
        ordens: ordens.filter((o) => o.rodada_id === r.id).map((o) => ({ ...ordemDoBanco(o), motivoSituacao: o.motivo_situacao, precoExecucao: num(o.preco_execucao), quantidadeExecutada: num(o.quantidade_executada) }))
      }));
    },

    // Todas as rodadas da carteira, só o que a medição precisa (a data e a versão dos parâmetros), em ordem.
    async rodadasParaMedicao(carteiraId, { transaction } = {}) {
      return CarteiraRodada.findAll({
        where: doEspaco({ carteira_id: carteiraId }),
        attributes: ["data", "decisao", "liquidacao", "parametros_versao"],
        order: [["data", "ASC"]],
        raw: true,
        transaction
      });
    },

    // As intenções de todas as rodadas da carteira, com a data da rodada (as métricas secundárias da medição, etapa 7b).
    async intencoesParaMedicao(carteiraId, { transaction } = {}) {
      const rodadas = await CarteiraRodada.findAll({ where: doEspaco({ carteira_id: carteiraId }), attributes: ["id", "data"], raw: true, transaction });
      if (!rodadas.length) return [];
      const dataDe = new Map(rodadas.map((r) => [r.id, r.data]));
      const linhas = await CarteiraIntencao.findAll({
        where: doEspaco({ rodada_id: [...dataDe.keys()] }),
        attributes: ["rodada_id", "trilha_id", "ativo", "acao", "origem", "referencia", "resultado", "motivo_bloqueio"],
        raw: true,
        transaction
      });
      return linhas.map((i) => ({
        data: dataDe.get(i.rodada_id),
        trilhaId: i.trilha_id,
        ativo: i.ativo,
        acao: i.acao,
        origem: i.origem,
        referencia: i.referencia ?? null,
        resultado: i.resultado,
        motivoBloqueio: i.motivo_bloqueio
      }));
    },

    // A versão do prompt e o modelo da leitura de tendência de cada ativo, por rodada (a medição registra as mudanças).
    async leiturasParaMedicao(carteiraId, { transaction } = {}) {
      const rodadas = await CarteiraRodada.findAll({ where: doEspaco({ carteira_id: carteiraId }), attributes: ["id", "data"], raw: true, transaction });
      if (!rodadas.length) return [];
      const dataDe = new Map(rodadas.map((r) => [r.id, r.data]));
      const linhas = await CarteiraRodadaLeitura.findAll({
        where: doEspaco({ rodada_id: [...dataDe.keys()], situacao: "OK" }),
        attributes: ["rodada_id", "ativo", "versao_prompt", "modelo"],
        raw: true,
        transaction
      });
      return linhas.map((l) => ({ data: dataDe.get(l.rodada_id), ativo: l.ativo, versaoPrompt: l.versao_prompt, modelo: l.modelo }));
    },

    // Os lançamentos do razão das trilhas, só o que a atribuição por ativo precisa.
    async lancamentosParaMedicao(trilhaIds, { transaction } = {}) {
      const linhas = await CarteiraLancamento.findAll({ where: doEspaco({ trilha_id: trilhaIds }), attributes: ["trilha_id", "data", "tipo", "ativo", "valor"], raw: true, transaction });
      return linhas.map((l) => ({ trilhaId: l.trilha_id, data: l.data, tipo: l.tipo, ativo: l.ativo, valor: num(l.valor) }));
    },

    // Todas as posições das trilhas (abertas primeiro, depois as encerradas da mais recente).
    async listarPosicoes(trilhaIds, { transaction } = {}) {
      const linhas = await CarteiraPosicao.findAll({
        where: doEspaco({ trilha_id: trilhaIds }),
        order: [["situacao", "ASC"], ["data_saida", "DESC"], ["data_entrada", "DESC"]],
        transaction,
        raw: true
      });
      return linhas.map(posicaoDoBanco);
    },

    // As ordens das trilhas, da mais recente; com o que a liquidação fez delas.
    async listarOrdens(trilhaIds, { limite = 200, transaction } = {}) {
      const linhas = await CarteiraOrdem.findAll({ where: doEspaco({ trilha_id: trilhaIds }), order: [["data_execucao", "DESC"], ["created_at", "DESC"]], limit: limite, raw: true, transaction });
      return linhas.map((o) => ({ ...ordemDoBanco(o), motivoSituacao: o.motivo_situacao, precoExecucao: num(o.preco_execucao), quantidadeExecutada: num(o.quantidade_executada) }));
    },

    // O patrimônio diário inteiro das trilhas, em ordem.
    async seriesPatrimonio(trilhaIds, { transaction } = {}) {
      const linhas = await CarteiraPatrimonioDiario.findAll({ where: doEspaco({ trilha_id: trilhaIds }), attributes: ["trilha_id", "data", "patrimonio"], order: [["data", "ASC"]], raw: true, transaction });
      return linhas.map((l) => ({ trilhaId: l.trilha_id, data: l.data, patrimonio: num(l.patrimonio) }));
    },

    // Já houve réplica da recomendação nesta carteira entre as datas (a semana)?
    async existeReplicaEntre(carteiraId, inicio, fim, { transaction } = {}) {
      const rodadas = await CarteiraRodada.findAll({ where: doEspaco({ carteira_id: carteiraId, data: { [Op.between]: [inicio, fim] } }), attributes: ["id"], raw: true, transaction });
      if (!rodadas.length) return false;
      const n = await CarteiraRecomendacao.count({ where: doEspaco({ rodada_id: rodadas.map((r) => r.id), tipo: "REPLICA" }), transaction });
      return n > 0;
    },

    // Todas as recomendações da carteira, da mais recente, sem os textos longos (instrução, prompt, respostas, entrada):
    // o seletor de dia da tela precisa da carteira inteira (a avaliação é de 6 e 12 meses), e sem os textos a linha é leve.
    async listarRecomendacoes(carteiraId, { transaction } = {}) {
      const rodadas = await CarteiraRodada.findAll({ where: doEspaco({ carteira_id: carteiraId }), attributes: ["id"], raw: true, transaction });
      if (!rodadas.length) return [];
      return CarteiraRecomendacao.findAll({
        where: doEspaco({ rodada_id: rodadas.map((r) => r.id) }),
        attributes: { exclude: ["instrucao", "prompt", "respostas", "entrada"] },
        order: [["data", "DESC"], ["tipo", "ASC"]],
        raw: true,
        transaction
      });
    },

    // Uma recomendação inteira, só se for de uma rodada desta carteira.
    async buscarRecomendacao(carteiraId, recomendacaoId, { transaction } = {}) {
      const rec = await CarteiraRecomendacao.findOne({ where: doEspaco({ id: recomendacaoId }), raw: true, transaction });
      if (!rec) return null;
      const rodada = await CarteiraRodada.findOne({ where: doEspaco({ id: rec.rodada_id, carteira_id: carteiraId }), attributes: ["id"], raw: true, transaction });
      return rodada ? rec : null;
    },

    async ordensCriadas(rodadaId, { transaction } = {}) {
      const linhas = await CarteiraOrdem.findAll({ where: doEspaco({ rodada_id: rodadaId, situacao: "CRIADA" }), order: [["created_at", "ASC"]], raw: true, transaction });
      return linhas.map(ordemDoBanco);
    },

    // --- O diário do operador (etapa 6) ---

    // Uma operação do operador numa transação com a rodada TRAVADA (SELECT ... FOR UPDATE). A liquidação trava a mesma
    // linha antes de gravar: uma ordem nunca entra numa rodada que acabou de ser liquidada.
    async comRodadaTravada(rodadaId, fn, { transaction } = {}) {
      return naTransacao(transaction, async (t) => {
        const rodada = await CarteiraRodada.findOne({ where: doEspaco({ id: rodadaId }), lock: true, raw: true, transaction: t });
        return fn({ rodada, transaction: t });
      });
    },

    async criarOrdem(ordem, { transaction } = {}) {
      const linha = await CarteiraOrdem.create(
        {
          id: randomUUID(),
          workspace_id: workspaceId,
          rodada_id: ordem.rodadaId,
          trilha_id: ordem.trilhaId,
          data_execucao: ordem.dataExecucao,
          ativo: ordem.ativo,
          tipo: ordem.tipo,
          motivo: ordem.motivo,
          lado: ordem.lado,
          contrato: ordem.contrato,
          quantidade: ordem.quantidade,
          distancia: ordem.distancia ?? null,
          sem_stop: false,
          preco_informado: ordem.precoInformado ?? null,
          stop_informado: ordem.stopInformado ?? null,
          posicao_id: ordem.posicaoId ?? null,
          situacao: "CRIADA",
          detalhes: ordem.detalhes ?? null
        },
        { transaction }
      );
      return ordemDoBanco(linha.get({ plain: true }));
    },

    async buscarOrdem(ordemId, trilhaId, { transaction } = {}) {
      const linha = await CarteiraOrdem.findOne({ where: doEspaco({ id: ordemId, trilha_id: trilhaId }), raw: true, transaction });
      return linha ? ordemDoBanco(linha) : null;
    },

    // Muda uma ordem que ainda aguarda a liquidação (editar ou cancelar). -> quantas mudaram (0: já não estava CRIADA).
    async atualizarOrdemCriada(ordemId, campos, { transaction } = {}) {
      const [n] = await CarteiraOrdem.update(campos, { where: doEspaco({ id: ordemId, situacao: "CRIADA" }), transaction });
      return n;
    },

    async ordensCriadasDaTrilha(trilhaId, rodadaId, { transaction } = {}) {
      const linhas = await CarteiraOrdem.findAll({ where: doEspaco({ trilha_id: trilhaId, rodada_id: rodadaId, situacao: "CRIADA" }), order: [["created_at", "ASC"]], raw: true, transaction });
      return linhas.map(ordemDoBanco);
    },

    // Todas as ordens de uma trilha, da mais recente, com os detalhes (o checklist do operador).
    async ordensDaTrilha(trilhaId, { transaction } = {}) {
      const linhas = await CarteiraOrdem.findAll({ where: doEspaco({ trilha_id: trilhaId }), order: [["data_execucao", "DESC"], ["created_at", "DESC"]], raw: true, transaction });
      return linhas.map((o) => ({ ...ordemDoBanco(o), motivoSituacao: o.motivo_situacao, precoExecucao: num(o.preco_execucao), quantidadeExecutada: num(o.quantidade_executada), registradaEm: o.created_at }));
    },

    async buscarPosicao(posicaoId, trilhaId, { transaction } = {}) {
      const linha = await CarteiraPosicao.findOne({ where: doEspaco({ id: posicaoId, trilha_id: trilhaId }), raw: true, transaction });
      return linha ? posicaoDoBanco(linha) : null;
    },

    async registrarEvento({ posicaoId, data, tipo, preco = null, quantidade = null, detalhes = null }, { transaction } = {}) {
      const linha = await CarteiraPosicaoEvento.create({ id: randomUUID(), workspace_id: workspaceId, posicao_id: posicaoId, data, tipo, preco, quantidade, detalhes }, { transaction });
      return eventoDoBanco(linha.get({ plain: true }));
    },

    async eventosDasPosicoes(posicaoIds, { transaction } = {}) {
      if (!posicaoIds.length) return [];
      const linhas = await CarteiraPosicaoEvento.findAll({ where: doEspaco({ posicao_id: posicaoIds }), order: [["data", "ASC"], ["created_at", "ASC"]], raw: true, transaction });
      return linhas.map(eventoDoBanco);
    },

    // Os stops movidos pelo operador (o evento STOP_MOVIDO: o novo stop em `preco`, a vigência em `detalhes`).
    async movimentosDeStop(posicaoIds, { transaction } = {}) {
      if (!posicaoIds.length) return [];
      const linhas = await CarteiraPosicaoEvento.findAll({ where: doEspaco({ posicao_id: posicaoIds, tipo: "STOP_MOVIDO" }), raw: true, transaction });
      return linhas.map(eventoDoBanco).map((e) => ({ posicaoId: e.posicaoId, stop: e.preco, vigenteDesde: e.detalhes?.vigenteDesde, registradoEm: e.registradoEm }));
    },

    // O resultado da liquidação de um dia, numa transação: por trilha, as posições (novas, atualizadas e encerradas), os
    // eventos, os lançamentos, a situação de cada ordem e o patrimônio do dia; e a rodada como LIQUIDADA. Trava a rodada
    // antes (o diário do operador trava a mesma linha) e confere que as ordens são as que a liquidação leu (`ordensLidas`,
    // os ids): se o operador registrou ou cancelou no meio, nada é gravado (OrdensMudaramError) e a rotina refaz.
    async gravarLiquidacao({ rodadaId, data, trilhas, ordensLidas = null }, { transaction } = {}) {
      return naTransacao(transaction, async (t) => {
        await CarteiraRodada.findOne({ where: doEspaco({ id: rodadaId }), attributes: ["id"], lock: true, raw: true, transaction: t });
        if (ordensLidas) {
          const agora = await CarteiraOrdem.findAll({ where: doEspaco({ rodada_id: rodadaId, situacao: "CRIADA" }), attributes: ["id"], raw: true, transaction: t });
          const lidas = new Set(ordensLidas);
          if (agora.length !== lidas.size || agora.some((o) => !lidas.has(o.id))) throw new OrdensMudaramError();
        }
        for (const { trilhaId, idsAntes, resultado } of trilhas) {
          const existentes = new Set(idsAntes);
          const posicoes = [
            ...resultado.estado.posicoes.map((p) => posicaoParaBanco(p, workspaceId, trilhaId)),
            ...resultado.encerradas.map((p) => posicaoParaBanco(p, workspaceId, trilhaId, { encerrada: true, data }))
          ];
          for (const linha of posicoes) {
            if (existentes.has(linha.id)) {
              const campos = { ...linha };
              for (const chave of ["id", "workspace_id", "trilha_id"]) delete campos[chave];
              await CarteiraPosicao.update(campos, { where: doEspaco({ id: linha.id, trilha_id: trilhaId }), transaction: t });
            } else {
              await CarteiraPosicao.create(linha, { transaction: t });
            }
          }
          if (resultado.eventos.length) {
            await CarteiraPosicaoEvento.bulkCreate(
              resultado.eventos.map((e) => ({ id: randomUUID(), workspace_id: workspaceId, posicao_id: e.posicaoId, data: e.data, tipo: e.tipo, preco: e.preco, quantidade: e.quantidade })),
              { transaction: t }
            );
          }
          if (resultado.lancamentos.length) {
            await CarteiraLancamento.bulkCreate(
              resultado.lancamentos.map((l) => ({
                id: randomUUID(),
                workspace_id: workspaceId,
                trilha_id: trilhaId,
                rodada_id: rodadaId,
                data: l.data,
                tipo: l.tipo,
                ativo: l.ativo,
                posicao_id: l.posicaoId,
                valor: l.valor,
                cambio: l.cambio,
                descricao: l.descricao
              })),
              { transaction: t }
            );
          }
          for (const r of resultado.resolucoes) {
            await CarteiraOrdem.update(
              {
                situacao: r.situacao,
                motivo_situacao: r.motivo,
                preco_execucao: r.preco ?? null,
                quantidade_executada: r.quantidade ?? (r.situacao === "EXECUTADA" ? r.ordem.quantidade : null),
                posicao_id: r.posicaoId ?? r.ordem.posicaoId ?? null
              },
              { where: doEspaco({ id: r.ordem.id, situacao: "CRIADA" }), transaction: t }
            );
          }
          await CarteiraPatrimonioDiario.upsert(
            { id: randomUUID(), workspace_id: workspaceId, trilha_id: trilhaId, data, patrimonio: resultado.estado.patrimonio },
            { conflictFields: ["trilha_id", "data"], transaction: t }
          );
        }
        await CarteiraRodada.update({ liquidacao: "LIQUIDADA", liquidada_em: new Date() }, { where: doEspaco({ id: rodadaId, liquidacao: "PENDENTE" }), transaction: t });
      });
    }
  };
}

module.exports = { forWorkspace, posicaoDoBanco, ordemDoBanco, OrdensMudaramError };
