"use strict";

const { randomUUID } = require("node:crypto");
const observationRepository = require("../repositories/observation.repository");
const { paraDate } = require("../shared/utils/date-utils");

// Camada point-in-time (ADR 0008). Duas operações:
//   registrarObservacoes - escrita append-only (novo / mesmo valor / revisão)
//   obterAsOf            - "o que se sabia em tal instante?"
//
// Padrão do projeto: último parâmetro `deps = {}` para injeção em teste.
// `deps.transaction` só é usado em verificação de integração (rollback).

// Tolerância para um published_at REAL (informado pela fonte) que apareça
// levemente à frente do relógio local (desvio de relógio).
const TOLERANCIA_RELOGIO_MS = 5 * 60 * 1000;

function mesmoValor(a, b) {
  return Number(a).toFixed(6) === Number(b).toFixed(6);
}

// Normaliza uma observação bruta de um coletor para uma versão a inserir, ou
// devolve { erro }. Regra de published_at (ver ADR 0008):
//   - sem published_at: usa collected_at (limite conservador) e marca estimado;
//   - estimado por regra documentada: nunca depois de collected_at (se o valor
//     já estava em mãos, já estava publicado);
//   - real (não estimado) no futuro do relógio local: rejeitado.
function montarVersao(obs, coletadoEm) {
  if (!obs?.series_code || !obs?.source_code || !obs?.unit) {
    return { erro: "series_code, source_code e unit são obrigatórios." };
  }
  try {
    paraDate(obs.observed_at);
  } catch {
    return { erro: `observed_at inválido: "${obs.observed_at}".` };
  }
  const valor = Number(obs.value);
  if (!Number.isFinite(valor)) return { erro: `value inválido: "${obs.value}".` };

  let publishedAt = obs.published_at;
  let estimado = Boolean(obs.published_at_is_estimated);
  let basis = obs.published_at_basis || (estimado ? "lag_rule" : "source");
  let clamped = false;

  if (!publishedAt) {
    publishedAt = coletadoEm;
    estimado = true;
    basis = "collected_at";
  } else if (!(publishedAt instanceof Date) || Number.isNaN(publishedAt.getTime())) {
    return { erro: "published_at inválido." };
  } else if (publishedAt.getTime() > coletadoEm.getTime()) {
    if (estimado) {
      publishedAt = coletadoEm;
      clamped = true;
    } else if (publishedAt.getTime() - coletadoEm.getTime() > TOLERANCIA_RELOGIO_MS) {
      return { erro: `published_at real (${publishedAt.toISOString()}) está no futuro em relação à coleta.` };
    } else {
      publishedAt = coletadoEm;
    }
  }

  return {
    versao: {
      series_code: obs.series_code,
      observed_at: obs.observed_at,
      published_at: publishedAt,
      collected_at: coletadoEm,
      value: valor,
      unit: obs.unit,
      source_code: obs.source_code,
      published_at_is_estimated: estimado,
      metadata: { publishedAtBasis: basis, ...(clamped ? { publishedAtClampedToCollectedAt: true } : {}), ...(obs.metadata || {}) }
    }
  };
}

// Escreve um lote de observações. NUNCA atualiza nem apaga: compara com a
// versão mais recente já guardada de cada (series_code, observed_at):
//   sem versão anterior      -> insere revision_seq 0            (criados)
//   mesmo valor              -> não escreve nada                 (ignorados)
//   valor diferente          -> insere versão nova, seq + 1      (atualizados = revisões)
// Valor diferente com published_at NÃO posterior à última versão é um
// conflito que o modelo append-only não representa - vai para `falhas`.
async function registrarObservacoes(observacoes, { execucaoId, coletadoEm = new Date() }, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const opcoes = { transaction: deps.transaction };
  const falhas = [];
  const paraInserir = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  const versoesValidas = [];
  for (const obs of observacoes) {
    const { versao, erro } = montarVersao(obs, coletadoEm);
    if (erro) falhas.push({ item: obs, motivo: erro });
    else versoesValidas.push(versao);
  }

  const porSerie = new Map();
  for (const v of versoesValidas) {
    if (!porSerie.has(v.series_code)) porSerie.set(v.series_code, []);
    porSerie.get(v.series_code).push(v);
  }

  for (const [seriesCode, versoes] of porSerie) {
    const ultimas = await repo.buscarUltimasVersoes(seriesCode, opcoes);

    for (const original of versoes) {
      const ultima = ultimas.get(original.observed_at);
      let v = original;

      // Revisão descoberta agora numa fonte cujo published_at é ESTIMADO por
      // regra (ex.: "1 dia útil depois de observed_at"): a regra descreve a
      // publicação ORIGINAL, não a da revisão. A revisão só foi vista agora,
      // então o único limite honesto é collected_at.
      if (ultima && !mesmoValor(ultima.value, v.value) && v.published_at_is_estimated) {
        v = {
          ...v,
          published_at: v.collected_at,
          metadata: { ...v.metadata, publishedAtBasis: "collected_at", publishedAtRuleIgnoredForRevision: true }
        };
      }

      if (!ultima) {
        paraInserir.push({ ...v, id: randomUUID(), revision_seq: 0, collection_execution_id: execucaoId });
        ultimas.set(v.observed_at, { value: v.value, published_at: v.published_at, revision_seq: 0 });
        criados += 1;
        continue;
      }

      if (mesmoValor(ultima.value, v.value)) {
        ignorados += 1;
        continue;
      }

      if (v.published_at.getTime() <= new Date(ultima.published_at).getTime()) {
        falhas.push({
          item: v,
          motivo: `Valor diferente (${ultima.value} → ${v.value}) com published_at (${v.published_at.toISOString()}) não posterior à última versão (${new Date(ultima.published_at).toISOString()}).`
        });
        continue;
      }

      const revisionSeq = Number(ultima.revision_seq) + 1;
      paraInserir.push({ ...v, id: randomUUID(), revision_seq: revisionSeq, collection_execution_id: execucaoId });
      ultimas.set(v.observed_at, { value: v.value, published_at: v.published_at, revision_seq: revisionSeq });
      atualizados += 1;
    }
  }

  if (paraInserir.length > 0) {
    const inseridas = await repo.inserirVersoes(paraInserir, opcoes);
    if (inseridas !== paraInserir.length) {
      // Não deveria acontecer (o plano já evita a chave única) - corrida
      // entre duas coletas simultâneas. Reporta em vez de esconder.
      falhas.push({ item: null, motivo: `${paraInserir.length - inseridas} versão(ões) planejada(s) não foram inseridas (colisão na chave única).` });
    }
  }

  return { criados, atualizados, ignorados, falhas };
}

function paraSaida(linha) {
  return {
    seriesCode: linha.series_code,
    observedAt: linha.observed_at,
    value: Number(linha.value),
    unit: linha.unit,
    publishedAt: linha.published_at,
    publishedAtIsEstimated: Boolean(Number(linha.published_at_is_estimated)),
    revisionSeq: Number(linha.revision_seq)
  };
}

// "Qual era o valor conhecido em `asOf`?" - published_at <= asOf, e para cada
// (série, período observado) a versão mais recente até esse instante.
// `estrito: true` = só o que o FinMind já tinha de fato coletado nesse
// instante (ver repository.buscarAsOf).
async function obterAsOf({ seriesCodes, asOf, observadoDesde, observadoAte, estrito = false }, deps = {}) {
  const repo = deps.observationRepository || observationRepository;

  const codigos = Array.isArray(seriesCodes) ? seriesCodes : [seriesCodes];
  if (codigos.length === 0 || codigos.some((c) => !c)) throw new Error("obterAsOf: informe ao menos um series_code.");
  if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) throw new Error("obterAsOf: asOf deve ser um Date válido.");

  const linhas = await repo.buscarAsOf({ seriesCodes: codigos, asOf, observadoDesde, observadoAte, estrito }, { transaction: deps.transaction });
  return linhas.map(paraSaida);
}

module.exports = { registrarObservacoes, obterAsOf, montarVersao, mesmoValor };
