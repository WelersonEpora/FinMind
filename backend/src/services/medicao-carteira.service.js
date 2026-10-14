"use strict";

const carteiraRepository = require("../repositories/carteira.repository");
const carteiraRodadaRepository = require("../repositories/carteira-rodada.repository");
const { METODO, diferencasDiarias, segmentar, medirSegmento, mudancasDasLeituras } = require("../carteiras/medicao");
const secundarias = require("../carteiras/secundarias");
const { resolverVigente } = require("../carteiras/parametros");
const { NotFoundError } = require("../shared/errors");
const { hojeEmSaoPaulo } = require("./carteira.service");

// A MEDIÇÃO de uma carteira (ADR 0127, §10; etapa 7): a pergunta principal (a IA agrega valor ao processo, sobre uma
// regra sem nenhuma IA? IA − Persistência, revista pelo usuário em 2026-10-14) no segmento em vigor, com as datas, o
// parcial e, passadas as datas, a avaliação e a final; e as duas partes que a somam, sem veredito: a recomendação
// (IA − Determinística) e as leituras (Determinística − Persistência). Só leitura do
// que a rotina gravou (o patrimônio diário das trilhas, as rodadas e as recomendações). E as métricas secundárias (etapa
// 7b, carteiras/secundarias.js), só descritivas: a atribuição, o painel das seis trilhas e as métricas da Cartilha. O
// custo da IA saiu da medição (decisão do usuário, 2026-10-14; ADR 0127, D6).

const plano = (registro) => (typeof registro?.get === "function" ? registro.get({ plain: true }) : registro);
// As métricas secundárias no segmento (desde `inicio`), sem veredito.
function montarSecundarias({ trilhas, serie, posicoes, lancamentos, intencoes, ordensOperador, recomendacoes, parametros, diferencasIaDet, inicio, hoje, capital }) {
  const daTrilha = (tipo) => trilhas.find((t) => t.tipo === tipo);
  const serieDe = (t) => (t ? serie.filter((p) => p.trilhaId === t.id) : []);
  const posicoesDe = (t) => (t ? posicoes.filter((p) => p.trilhaId === t.id) : []);
  const [ia, det, caixa] = ["IA", "DETERMINISTICA", "CAIXA"].map(daTrilha);
  const ativos = Object.keys(parametros?.ativos || {});
  const tipoDaTrilha = new Map(trilhas.map((t) => [t.id, t.tipo]));
  const doSegmento = (x) => x.data >= inicio && x.data <= hoje;

  // O retorno diário do caixa (a taxa livre de risco), sobre o patrimônio do dia anterior.
  const retornoCaixa = new Map();
  let anterior = capital;
  for (const p of serieDe(caixa)) {
    retornoCaixa.set(p.data, p.patrimonio / anterior - 1);
    anterior = p.patrimonio;
  }

  const painel = [...trilhas]
    .sort((a, b) => secundarias.ORDEM_DAS_TRILHAS.indexOf(a.tipo) - secundarias.ORDEM_DAS_TRILHAS.indexOf(b.tipo))
    .map((t) =>
      secundarias.painelDaTrilha({
        tipo: t.tipo,
        serie: serieDe(t),
        posicoes: posicoesDe(t),
        custos: -lancamentos.filter((l) => l.trilhaId === t.id && doSegmento(l) && ["CUSTO", "CORRECAO_CUSTO"].includes(l.tipo)).reduce((s, l) => s + l.valor, 0),
        caixa: retornoCaixa,
        inicio,
        capital,
        minimoDias: METODO.minimoDias,
        limiteDrawdownPct: parametros?.carteira?.drawdownMaxPct
      })
    );

  const intencoesDoSegmento = intencoes.filter(doSegmento);
  return {
    atribuicao: {
      divergentes: secundarias.diasDivergentes({ diferencas: diferencasIaDet.filter(doSegmento), posicoesIa: posicoesDe(ia), posicoesDet: posicoesDe(det) }),
      porAtivo: ia && det ? secundarias.atribuicaoPorAtivo({ lancamentos: lancamentos.filter((l) => l.data <= hoje), iaId: ia.id, detId: det.id, inicio, ativos, capital }) : [],
      contrarias: secundarias.contrariasALeitura({
        principais: recomendacoes.filter((r) => r.tipo === "PRINCIPAL" && doSegmento(r)),
        intencoesIa: ia ? intencoesDoSegmento.filter((i) => i.trilhaId === ia.id) : [],
        posicoesIa: posicoesDe(ia),
        capital
      }),
      cortes: secundarias.cortesDoMotor({ intencoes: intencoesDoSegmento, tipoDaTrilha }),
      consistencia: secundarias.consistenciaDaReplica(recomendacoes.filter(doSegmento)),
      fallback: {
        dias: recomendacoes.filter((r) => r.tipo === "PRINCIPAL" && doSegmento(r)).length,
        falhas: recomendacoes.filter((r) => r.tipo === "PRINCIPAL" && r.situacao === "FALHA" && doSegmento(r)).length
      }
    },
    painel,
    cartilha: secundarias.cartilhaPorTrilha({ trilhas, posicoes, ordensOperador, ativos, inicio, capital })
  };
}

async function obterMedicao(workspaceId, carteiraId, deps = {}) {
  const repo = (deps.carteiraRepository || carteiraRepository).forWorkspace(workspaceId);
  const carteira = plano(await repo.buscar(carteiraId));
  if (!carteira) throw new NotFoundError("Carteira não encontrada.");
  const trilhas = (await repo.listarTrilhas(carteiraId)).map(plano);
  const [ia, det, per] = ["IA", "DETERMINISTICA", "PERSISTENCIA"].map((tipo) => trilhas.find((t) => t.tipo === tipo));
  const rRepo = (deps.carteiraRodadaRepository || carteiraRodadaRepository).forWorkspace(workspaceId);
  const hoje = deps.hoje || hojeEmSaoPaulo(deps.agora);
  const capital = Number(carteira.capital_inicial);

  const ids = trilhas.map((t) => t.id);
  const operador = trilhas.find((t) => t.tipo === "OPERADOR");
  const [serie, rodadas, recomendacoes, posicoes, lancamentos, intencoes, ordensOperador, versoes, leituras] = await Promise.all([
    ids.length ? rRepo.seriesPatrimonio(ids) : [],
    rRepo.rodadasParaMedicao(carteiraId),
    rRepo.listarRecomendacoes(carteiraId),
    ids.length ? rRepo.listarPosicoes(ids) : [],
    ids.length ? rRepo.lancamentosParaMedicao(ids) : [],
    rRepo.intencoesParaMedicao(carteiraId),
    operador ? rRepo.ordensDaTrilha(operador.id) : [],
    repo.listarVersoes(carteiraId),
    rRepo.leiturasParaMedicao(carteiraId)
  ]);
  const serieDe = (t) => serie.filter((p) => p.trilhaId === t?.id);
  const diferencas = diferencasDiarias(serieDe(ia), serieDe(per), capital);
  const diferencasIaDet = diferencasDiarias(serieDe(ia), serieDe(det), capital);
  const diferencasDetPer = diferencasDiarias(serieDe(det), serieDe(per), capital);

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
  // As partes explicam a principal: intervalo, mas sem veredito (um veredito só, o da principal).
  const parte = (difs) => {
    const m = medirSegmento({ diferencas: difs, inicio, hoje });
    const semVeredito = (c) => (c ? { ...c, veredito: undefined } : null);
    return { parcial: m.parcial, avaliacao: semVeredito(m.avaliacao), final: semVeredito(m.final), serie: m.serie };
  };

  const parametros = resolverVigente(versoes.map(plano), hoje) || resolverVigente(versoes.map(plano), "9999-12-31");

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
      mudancasDasLeituras: mudancasDasLeituras(leituras, inicio),
      ...medida,
      partes: { recomendacao: parte(diferencasIaDet), leituras: parte(diferencasDetPer) },
      secundarias: montarSecundarias({ trilhas, serie, posicoes, lancamentos, intencoes, ordensOperador, recomendacoes, parametros, diferencasIaDet, inicio, hoje, capital })
    }
  };
}

module.exports = { obterMedicao, montarSecundarias };
