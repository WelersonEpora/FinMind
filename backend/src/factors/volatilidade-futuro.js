"use strict";

const observationRepository = require("../repositories/observation.repository");
const { decodificarFuturoB3 } = require("../shared/utils/b3-contrato");

// A VOLATILIDADE DIÁRIA DE UM FUTURO DA B3 (item E6 da análise do ouro de 2026-11-01; ADR 0152): o desvio padrão dos
// retornos diários dos últimos N pregões, a base das faixas de variação proporcionais à volatilidade. Não é fator nem
// regra de direção: mede o tamanho do movimento normal do preço.
//
// OBSERVÁVEL → MEDIDA:
//   <prefixo>.<ticker>.SETTLE (observation) - o ajuste de cada vencimento (ex.: B3.GLD.GLDZ26.SETTLE)
//   - o retorno de um pregão para o seguinte sai do vencimento mais próximo com ajuste NOS DOIS pregões: a troca de
//     contrato nunca vira retorno, e um vencimento sem negócio num dos dias fica de fora daquele par
//   - volatilidade = o desvio padrão dos últimos N retornos log, em %
// Função pura (medirVolatilidade) + carga point-in-time (calcularVolatilidadeFuturo). Nada é gravado.

const arred = (n, casas) => Math.round(n * 10 ** casas) / 10 ** casas;

// Função PURA: as linhas de buscarAsOf (um futuro por vencimento) -> { volatilidadeDiariaPct, pregoes, desde, ate } nos
// últimos `pregoes` retornos até `ate`, ou null sem retornos suficientes.
function medirVolatilidade(linhas, { ate, pregoes, prefixo }) {
  const porDia = new Map();
  for (const l of linhas) {
    const data = String(l.observed_at).slice(0, 10);
    if (data > ate) continue;
    const ticker = l.series_code.slice(prefixo.length + 1).split(".")[0];
    const contrato = decodificarFuturoB3(ticker);
    const valor = Number(l.value);
    if (!contrato || !(valor > 0)) continue;
    if (!porDia.has(data)) porDia.set(data, new Map());
    porDia.get(data).set(contrato.vencimento + ticker, valor);
  }
  const dias = [...porDia.keys()].sort();
  const retornos = [];
  for (let i = 1; i < dias.length; i += 1) {
    const antes = porDia.get(dias[i - 1]);
    const depois = porDia.get(dias[i]);
    const comuns = [...depois.keys()].filter((k) => antes.has(k)).sort();
    if (comuns.length) retornos.push({ data: dias[i], r: Math.log(depois.get(comuns[0]) / antes.get(comuns[0])) });
  }
  if (retornos.length < pregoes) return null;
  const janela = retornos.slice(-pregoes);
  const media = janela.reduce((s, x) => s + x.r, 0) / pregoes;
  const desvio = Math.sqrt(janela.reduce((s, x) => s + (x.r - media) ** 2, 0) / (pregoes - 1));
  return { volatilidadeDiariaPct: arred(desvio * 100, 3), pregoes, desde: janela[0].data, ate: janela.at(-1).data };
}

// A volatilidade com o que se sabia no fim de `data` (horário de Brasília), até o pregão `ate`.
async function calcularVolatilidadeFuturo({ prefixo, campo = "SETTLE", data, ate = data, pregoes }, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const asOf = new Date(`${data}T23:59:59.999-03:00`);
  // Um ano de calendário cobre com folga os pregões pedidos.
  const desde = new Date(asOf.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const itens = await repo.listarUltimasDatasItens({ prefixoSerie: prefixo, campoReferencia: campo });
  const series = itens.filter((i) => decodificarFuturoB3(i.codigo)).map((i) => `${prefixo}.${i.codigo}.${campo}`);
  if (!series.length) return null;
  const linhas = await repo.buscarAsOf({ seriesCodes: series, asOf, observadoDesde: desde, observadoAte: ate });
  return medirVolatilidade(linhas, { ate, pregoes, prefixo });
}

module.exports = { medirVolatilidade, calcularVolatilidadeFuturo };
