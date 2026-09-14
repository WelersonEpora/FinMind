"use strict";

const marketDataService = require("./market-data.service");
const marketQuoteRepository = require("../repositories/market-quote.repository");
const collectionExecutionRepository = require("../repositories/collection-execution.repository");
const { NotFoundError } = require("../shared/errors");

// Catálogo estático dos observáveis conhecidos pelo FinMind - sem tabela
// própria de propósito (ver docs/decisoes-tecnicas.md, "não criar tabela
// sem necessidade real"). Um novo ativo = uma entrada nova aqui + um novo
// coletor (ver collectors/base/README.md), até que o especialista David
// justifique uma modelagem de domínio própria.
const CATALOGO_OBSERVAVEIS = [
  {
    instrumentCode: "USD_BRL",
    nome: "Dólar (USD/BRL)",
    unidade: "R$/US$",
    fonteCollectorCode: "bcb-usd-brl-venda",
    frequencia: "DIARIA"
  }
];

// Heurística operacional simples (não é regra de negócio do especialista de
// mercado): uma série diária sem observação nos últimos dias corridos é
// tratada como "atrasada" - folga de 4 dias cobre um fim de semana + 1 dia
// de tolerância pra latência de publicação da fonte.
const DIAS_TOLERANCIA_FRESCOR = 4;

function calcularSituacao(dataReferencia) {
  if (!dataReferencia) return "SEM_COLETA";
  const diffDias = (Date.now() - new Date(`${dataReferencia}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24);
  return diffDias <= DIAS_TOLERANCIA_FRESCOR ? "EM_DIA" : "ATRASADA";
}

function buscarNoCatalogo(codigo) {
  return CATALOGO_OBSERVAVEIS.find((item) => item.instrumentCode === codigo);
}

async function listarObservaveis(deps = {}) {
  const observaveis = await Promise.all(
    CATALOGO_OBSERVAVEIS.map(async (item) => {
      const { cotacao } = await marketDataService.obterCotacaoAtual(item.instrumentCode, deps);
      return {
        codigo: item.instrumentCode,
        nome: item.nome,
        fonte: cotacao?.fonte ?? null,
        valor: cotacao?.valor ?? null,
        unidade: cotacao?.unidade ?? item.unidade,
        dataReferencia: cotacao?.dataReferencia ?? null,
        frequencia: item.frequencia,
        situacao: calcularSituacao(cotacao?.dataReferencia)
      };
    })
  );

  return { observaveis };
}

async function obterDetalheObservavel(codigo, deps = {}) {
  const item = buscarNoCatalogo(codigo);
  if (!item) {
    throw new NotFoundError("Observável não encontrado.");
  }

  const repoQuote = deps.marketQuoteRepository || marketQuoteRepository;
  const repoExecucao = deps.collectionExecutionRepository || collectionExecutionRepository;

  const { cotacao, mensagem } = await marketDataService.obterCotacaoAtual(item.instrumentCode, deps);
  const estatisticas = await repoQuote.buscarEstatisticas(item.instrumentCode);
  const ultimaExecucao = await repoExecucao.buscarUltimaPorColetor(item.fonteCollectorCode);

  return {
    observavel: {
      codigo: item.instrumentCode,
      nome: item.nome,
      unidade: item.unidade,
      frequencia: item.frequencia,
      situacao: calcularSituacao(cotacao?.dataReferencia),
      cotacaoAtual: cotacao,
      mensagem: cotacao ? null : mensagem,
      cobertura: { primeiraData: estatisticas.primeiraData, ultimaData: estatisticas.ultimaData },
      totalObservacoes: estatisticas.totalObservacoes,
      ultimaColeta: ultimaExecucao
        ? {
            status: ultimaExecucao.status,
            iniciadoEm: ultimaExecucao.started_at,
            finalizadoEm: ultimaExecucao.finished_at
          }
        : null
    }
  };
}

module.exports = { listarObservaveis, obterDetalheObservavel };
