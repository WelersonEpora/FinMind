"use strict";

const carteiraRepository = require("../repositories/carteira.repository");
const carteiraRodadaRepository = require("../repositories/carteira-rodada.repository");
const { CONTAS, ESPECIFICACOES } = require("../carteiras/especificacoes");
const { parametrosPadrao } = require("../carteiras/parametros");
const { somarDiasUteis } = require("../carteiras/calendario");
const { NotFoundError } = require("../shared/errors");
const { hojeEmSaoPaulo, CONTAS_DISPONIVEIS } = require("./carteira.service");

// As telas das carteiras virtuais (ADR 0127, etapa 5): só leitura do que a rotina diária gravou. Tudo pelo espaço
// (os repositórios são escopados; a rota confere o vínculo, ADR 0007).

const plano = (registro) => (typeof registro?.get === "function" ? registro.get({ plain: true }) : registro);
const arred2 = (v) => Math.round(v * 100) / 100;

async function carteiraETrilhas(workspaceId, carteiraId, deps) {
  const repo = (deps.carteiraRepository || carteiraRepository).forWorkspace(workspaceId);
  const carteira = plano(await repo.buscar(carteiraId));
  if (!carteira) throw new NotFoundError("Carteira não encontrada.");
  const trilhas = (await repo.listarTrilhas(carteiraId)).map(plano);
  return { carteira, trilhas, rRepo: (deps.carteiraRodadaRepository || carteiraRodadaRepository).forWorkspace(workspaceId) };
}

// O que a tela de criação precisa: as contas, os ativos de cada uma, os parâmetros padrão (Cartilha v1.0) e a
// primeira data de início possível (o próximo dia útil).
function obterOpcoes(deps = {}) {
  const hoje = deps.hoje || hojeEmSaoPaulo(deps.agora);
  const ativosDa = (conta) => Object.keys(ESPECIFICACOES).filter((a) => ESPECIFICACOES[a].conta === conta);
  return {
    opcoes: {
      contas: Object.entries(CONTAS).map(([codigo, c]) => ({ codigo, rotulo: c.rotulo, moeda: c.moeda, disponivel: CONTAS_DISPONIVEIS.includes(codigo) })),
      ativos: Object.entries(ESPECIFICACOES).map(([codigo, e]) => ({ codigo, conta: e.conta, unidade: e.unidade, moedaPreco: e.moedaPreco })),
      padroes: Object.fromEntries(Object.keys(CONTAS).map((conta) => [conta, parametrosPadrao(conta, ativosDa(conta))])),
      inicioMinimo: somarDiasUteis(hoje, 1)
    }
  };
}

// O maior recuo do patrimônio desde o pico anterior, em % (negativo ou zero).
function maiorRecuo(serie, inicial) {
  let pico = inicial;
  let pior = 0;
  for (const { patrimonio } of serie) {
    pico = Math.max(pico, patrimonio);
    pior = Math.min(pior, (patrimonio / pico - 1) * 100);
  }
  return arred2(pior);
}

// A visão geral: por trilha, o patrimônio do último dia liquidado, o retorno e o maior recuo sobre o capital inicial,
// as posições abertas e as encerradas; e a série diária de cada uma, para o gráfico.
async function obterPainel(workspaceId, carteiraId, deps = {}) {
  const { carteira, trilhas, rRepo } = await carteiraETrilhas(workspaceId, carteiraId, deps);
  const ids = trilhas.map((t) => t.id);
  const [serie, posicoes, ultima] = await Promise.all([rRepo.seriesPatrimonio(ids), rRepo.listarPosicoes(ids), rRepo.ultimaRodada(carteiraId)]);
  const inicial = Number(carteira.capital_inicial);

  const resumo = trilhas.map((t) => {
    const daTrilha = serie.filter((p) => p.trilhaId === t.id);
    const patrimonio = daTrilha.length ? daTrilha[daTrilha.length - 1].patrimonio : inicial;
    const minhas = posicoes.filter((p) => p.trilhaId === t.id);
    return {
      id: t.id,
      tipo: t.tipo,
      calculada: t.calculada,
      patrimonio,
      retornoPct: arred2((patrimonio / inicial - 1) * 100),
      maiorRecuoPct: maiorRecuo(daTrilha, inicial),
      abertas: minhas.filter((p) => p.situacao === "ABERTA").length,
      encerradas: minhas.filter((p) => p.situacao === "ENCERRADA").length,
      serie: daTrilha.map(({ data, patrimonio: valor }) => ({ data, patrimonio: valor }))
    };
  });

  return {
    painel: {
      ultimaRodada: ultima ? { data: ultima.data, decisao: ultima.decisao, liquidacao: ultima.liquidacao } : null,
      ultimoDiaLiquidado: serie.reduce((ultimo, p) => (ultimo && ultimo > p.data ? ultimo : p.data), null),
      trilhas: resumo
    }
  };
}

function paraRodada(r, tipoDaTrilha) {
  return {
    id: r.id,
    data: r.data,
    decisao: r.decisao,
    liquidacao: r.liquidacao,
    parametrosVersao: r.parametros_versao,
    motivo: r.detalhes?.motivo ?? null,
    detalhes: r.detalhes,
    intencoes: r.intencoes.map((i) => ({
      trilha: tipoDaTrilha(i.trilha_id),
      ativo: i.ativo,
      acao: i.acao,
      prioridade: i.prioridade,
      origem: i.origem,
      resultado: i.resultado,
      motivoBloqueio: i.motivo_bloqueio,
      detalheBloqueio: i.detalhe_bloqueio
    })),
    ordens: r.ordens.map((o) => paraOrdem(o, tipoDaTrilha))
  };
}

function paraOrdem(o, tipoDaTrilha) {
  return {
    id: o.id,
    trilha: tipoDaTrilha(o.trilhaId),
    data: o.dataExecucao,
    ativo: o.ativo,
    tipo: o.tipo,
    motivo: o.motivo,
    lado: o.lado,
    contrato: o.contrato?.ticker ?? null,
    quantidade: o.quantidade,
    semStop: o.semStop,
    situacao: o.situacao,
    motivoSituacao: o.motivoSituacao,
    precoExecucao: o.precoExecucao,
    quantidadeExecutada: o.quantidadeExecutada
  };
}

const tipoPorId = (trilhas) => {
  const mapa = new Map(trilhas.map((t) => [t.id, t.tipo]));
  return (id) => mapa.get(id) ?? null;
};

async function listarRodadas(workspaceId, carteiraId, deps = {}) {
  const { trilhas, rRepo } = await carteiraETrilhas(workspaceId, carteiraId, deps);
  const rodadas = await rRepo.listarRodadas(carteiraId);
  return { rodadas: rodadas.map((r) => paraRodada(r, tipoPorId(trilhas))) };
}

async function listarPosicoes(workspaceId, carteiraId, deps = {}) {
  const { trilhas, rRepo } = await carteiraETrilhas(workspaceId, carteiraId, deps);
  const tipo = tipoPorId(trilhas);
  const posicoes = await rRepo.listarPosicoes(trilhas.map((t) => t.id));
  return {
    posicoes: posicoes.map((p) => ({
      id: p.id,
      trilha: tipo(p.trilhaId),
      ativo: p.ativo,
      lado: p.lado,
      contrato: p.contrato?.ticker ?? null,
      situacao: p.situacao,
      dataEntrada: p.dataEntrada,
      entrada: p.entrada,
      stop: p.stop,
      stopInicial: p.stopInicial,
      alvo1: p.alvo1,
      alvo2: p.alvo2,
      alvo1Atingido: p.alvo1Atingido,
      reduzida: p.reduzida,
      quantidadeInicial: p.quantidadeInicial,
      quantidadeAberta: p.quantidadeAberta,
      risco1R: p.risco1R,
      ultimoAjuste: p.ultimoAjuste,
      resultadoR: p.resultadoR,
      resultadoMoeda: p.resultadoMoeda,
      dataSaida: p.dataSaida,
      motivoSaida: p.motivoSaida
    }))
  };
}

async function listarOperacoes(workspaceId, carteiraId, deps = {}) {
  const { trilhas, rRepo } = await carteiraETrilhas(workspaceId, carteiraId, deps);
  const ordens = await rRepo.listarOrdens(trilhas.map((t) => t.id));
  return { operacoes: ordens.map((o) => paraOrdem(o, tipoPorId(trilhas))) };
}

// A recomendação da IA (ADR 0127, §4). Na lista, o resumo e as recomendações de cada dia; no detalhe, também o que foi à
// IA e o que voltou (a instrução, o prompt, cada resposta bruta com os erros dela): a transparência do prompt.
function paraRecomendacao(r, { completa = false } = {}) {
  return {
    id: r.id,
    data: r.data,
    tipo: r.tipo,
    situacao: r.situacao,
    motivoFalha: r.motivo_falha,
    versaoPrompt: r.versao_prompt,
    modeloPedido: r.modelo_pedido,
    modeloDevolvido: r.modelo_devolvido,
    hashEntrada: r.hash_entrada,
    recomendacoes: r.recomendacoes,
    contrarias: r.contrarias || {},
    tokens: r.tokens,
    custoUsd: r.custo_usd == null ? null : Number(r.custo_usd),
    tentativas: r.tentativas,
    detalhes: r.detalhes,
    ...(completa ? { entrada: r.entrada, instrucao: r.instrucao, prompt: r.prompt, respostas: r.respostas } : {})
  };
}

async function listarRecomendacoes(workspaceId, carteiraId, deps = {}) {
  const { rRepo } = await carteiraETrilhas(workspaceId, carteiraId, deps);
  const linhas = await rRepo.listarRecomendacoes(carteiraId);
  return { recomendacoes: linhas.map((r) => paraRecomendacao(r)) };
}

async function obterRecomendacao(workspaceId, carteiraId, recomendacaoId, deps = {}) {
  const { rRepo } = await carteiraETrilhas(workspaceId, carteiraId, deps);
  const r = await rRepo.buscarRecomendacao(carteiraId, recomendacaoId);
  if (!r) throw new NotFoundError("Recomendação não encontrada.");
  return { recomendacao: paraRecomendacao(r, { completa: true }) };
}

module.exports = { obterOpcoes, obterPainel, listarRodadas, listarPosicoes, listarOperacoes, listarRecomendacoes, obterRecomendacao };
