"use strict";

const carteiraRepository = require("../repositories/carteira.repository");
const carteiraRodadaRepository = require("../repositories/carteira-rodada.repository");
const precoMarketQuote = require("../shared/preco-market-quote");
const env = require("../config/env");
const { custoUsd } = require("../carteiras/recomendacao");
const { somarDias } = require("../carteiras/calendario");
const { METODO, diferencasDiarias, segmentar, medirSegmento, pontoDeEquilibrio } = require("../carteiras/medicao");
const { NotFoundError } = require("../shared/errors");
const { hojeEmSaoPaulo } = require("./carteira.service");

// A MEDIÇÃO de uma carteira (ADR 0127, §10; etapa 7): a pergunta principal (a recomendação da IA agrega valor sobre a
// regra fixa?) no segmento em vigor, com as datas, o parcial e, passadas as datas, a avaliação e a final; e o custo da
// IA no segmento, com o ponto de equilíbrio. Só leitura do que a rotina gravou (o patrimônio diário das trilhas IA e
// Determinística, as rodadas e as recomendações). As métricas secundárias (Cartilha, Sharpe, atribuição) ficam para uma
// sub-etapa (decisão do usuário, 2026-10-14).

const plano = (registro) => (typeof registro?.get === "function" ? registro.get({ plain: true }) : registro);
const PTAX = "BCB.PTAX.VENDA";

async function ptaxMaisRecente(hoje, deps) {
  const linhas = await precoMarketQuote.buscarLinhas(PTAX, { asOf: deps.agora || new Date(), observadoDesde: somarDias(hoje, -10), observadoAte: hoje }, deps);
  const ultima = linhas[linhas.length - 1];
  return ultima ? { data: ultima.observed_at, valor: Number(ultima.value) } : null;
}

// O custo da IA num trecho de datas: as chamadas (a do dia e a réplica semanal), os tokens, o custo em US$ e os dias em
// que a trilha IA ficou no fallback. Uma chamada gravada sem custo (sem os preços no .env naquele dia) é calculada pelos
// tokens com os preços de agora; sem preço nenhum, fica de fora, contada em `semPreco`, e o custo não é completo.
function custoDaIa(recomendacoes, inicio, fim, precos) {
  const doTrecho = recomendacoes.filter((r) => r.data >= inicio && r.data <= fim);
  const comChamada = doTrecho.filter((r) => r.tokens);
  const custoDe = (r) => (r.custo_usd != null ? Number(r.custo_usd) : custoUsd(r.tokens, precos));
  const semPreco = comChamada.filter((r) => custoDe(r) == null).length;
  return {
    chamadas: comChamada.length,
    dias: doTrecho.filter((r) => r.tipo === "PRINCIPAL").length,
    fallback: doTrecho.filter((r) => r.tipo === "PRINCIPAL" && r.situacao === "FALHA").length,
    tokens: comChamada.reduce((s, r) => s + (Number(r.tokens?.total) || 0), 0),
    custoUsd: comChamada.reduce((s, r) => s + (custoDe(r) ?? 0), 0),
    semPreco,
    completo: semPreco === 0
  };
}

async function obterMedicao(workspaceId, carteiraId, deps = {}) {
  const repo = (deps.carteiraRepository || carteiraRepository).forWorkspace(workspaceId);
  const carteira = plano(await repo.buscar(carteiraId));
  if (!carteira) throw new NotFoundError("Carteira não encontrada.");
  const trilhas = (await repo.listarTrilhas(carteiraId)).map(plano);
  const ia = trilhas.find((t) => t.tipo === "IA");
  const det = trilhas.find((t) => t.tipo === "DETERMINISTICA");
  const rRepo = (deps.carteiraRodadaRepository || carteiraRodadaRepository).forWorkspace(workspaceId);
  const hoje = deps.hoje || hojeEmSaoPaulo(deps.agora);
  const capital = Number(carteira.capital_inicial);

  const [serie, rodadas, recomendacoes] = await Promise.all([
    ia && det ? rRepo.seriesPatrimonio([ia.id, det.id]) : [],
    rRepo.rodadasParaMedicao(carteiraId),
    rRepo.listarRecomendacoes(carteiraId)
  ]);
  const diferencas = diferencasDiarias(
    serie.filter((p) => p.trilhaId === ia?.id),
    serie.filter((p) => p.trilhaId === det?.id),
    capital
  );

  // A chave de cada dia medido: a versão dos parâmetros da rodada e o modelo e o prompt da recomendação principal.
  const rodadaDe = new Map(rodadas.map((r) => [r.data, r]));
  const principalDe = new Map(recomendacoes.filter((r) => r.tipo === "PRINCIPAL").map((r) => [r.data, r]));
  const segmentos = segmentar(
    diferencas.map(({ data }) => ({
      data,
      parametrosVersao: rodadaDe.get(data)?.parametros_versao ?? null,
      modelo: principalDe.get(data)?.modelo_pedido ?? null,
      versaoPrompt: principalDe.get(data)?.versao_prompt ?? null
    }))
  );
  const atual = segmentos[segmentos.length - 1] || null;
  // Sem nenhum dia liquidado ainda, a contagem começa na data de início da carteira.
  const inicio = atual?.inicio ?? carteira.data_inicio;
  const medida = medirSegmento({ diferencas, inicio, hoje });

  const custo = custoDaIa(recomendacoes, inicio, hoje, deps.recomendacaoCarteira || env.recomendacaoCarteira);
  const ptax = await ptaxMaisRecente(hoje, deps);
  const custoConhecido = custo.completo ? custo.custoUsd : null;
  const custoMoeda = custoConhecido == null ? null : carteira.moeda === "USD" ? custoConhecido : ptax ? custoConhecido * ptax.valor : null;
  const vantagem = medida.parcial.acumulada;

  return {
    medicao: {
      hoje,
      capitalInicial: capital,
      moeda: carteira.moeda,
      metodo: METODO,
      segmento: atual
        ? { inicio: atual.inicio, parametrosVersao: atual.parametrosVersao, modelo: atual.modelo, versaoPrompt: atual.versaoPrompt }
        : { inicio, parametrosVersao: null, modelo: null, versaoPrompt: null },
      segmentosAnteriores: segmentos.slice(0, -1).map((s) => ({ inicio: s.inicio, fim: s.fim, parametrosVersao: s.parametrosVersao, modelo: s.modelo, versaoPrompt: s.versaoPrompt })),
      mudouEm: atual?.mudou ?? [],
      ...medida,
      custo: {
        ...custo,
        cambio: carteira.moeda === "USD" ? null : ptax,
        custoMoeda,
        vantagemMoeda: (vantagem / 100) * capital,
        pontoDeEquilibrio: pontoDeEquilibrio({ custoMoeda, vantagemAcumuladaPct: vantagem })
      }
    }
  };
}

module.exports = { obterMedicao };
