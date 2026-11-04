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

// Função PURA: as linhas de buscarAsOf (um futuro por vencimento) -> os retornos log de cada pregão até `ate`, cada um
// do vencimento mais próximo com ajuste no pregão e no anterior: [{ data, r }].
function retornosDaCadeia(linhas, { ate, prefixo }) {
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
  const dias = [...porDia.keys()].sort((a, b) => a.localeCompare(b));
  const retornos = [];
  for (let i = 1; i < dias.length; i += 1) {
    const antes = porDia.get(dias[i - 1]);
    const depois = porDia.get(dias[i]);
    const comuns = [...depois.keys()].filter((k) => antes.has(k)).sort((a, b) => a.localeCompare(b));
    if (comuns.length) retornos.push({ data: dias[i], r: Math.log(depois.get(comuns[0]) / antes.get(comuns[0])) });
  }
  return retornos;
}

// Função PURA: -> { volatilidadeDiariaPct, pregoes, desde, ate } nos últimos `pregoes` retornos até `ate`, ou null sem
// retornos suficientes.
function medirVolatilidade(linhas, { ate, pregoes, prefixo }) {
  const retornos = retornosDaCadeia(linhas, { ate, prefixo });
  if (retornos.length < pregoes) return null;
  const janela = retornos.slice(-pregoes);
  const media = janela.reduce((s, x) => s + x.r, 0) / pregoes;
  const desvio = Math.sqrt(janela.reduce((s, x) => s + (x.r - media) ** 2, 0) / (pregoes - 1));
  return { volatilidadeDiariaPct: arred(desvio * 100, 3), pregoes, desde: janela[0].data, ate: janela.at(-1).data };
}

// Os ajustes de todos os vencimentos do futuro, com o que se sabia em `asOf`.
async function lerVencimentos({ prefixo, campo, asOf, desde, ate }, deps) {
  const repo = deps.observationRepository || observationRepository;
  const itens = await repo.listarUltimasDatasItens({ prefixoSerie: prefixo, campoReferencia: campo });
  const series = itens.filter((i) => decodificarFuturoB3(i.codigo)).map((i) => `${prefixo}.${i.codigo}.${campo}`);
  return series.length ? repo.buscarAsOf({ seriesCodes: series, asOf, observadoDesde: desde, observadoAte: ate }) : [];
}

// A volatilidade com o que se sabia no fim de `data` (horário de Brasília), até o pregão `ate`.
async function calcularVolatilidadeFuturo({ prefixo, campo = "SETTLE", data, ate = data, pregoes }, deps = {}) {
  const asOf = new Date(`${data}T23:59:59.999-03:00`);
  // Um ano de calendário cobre com folga os pregões pedidos.
  const desde = new Date(asOf.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const linhas = await lerVencimentos({ prefixo, campo, asOf, desde, ate }, deps);
  return linhas.length ? medirVolatilidade(linhas, { ate, pregoes, prefixo }) : null;
}

// O índice do futuro encadeado (base 100 no 1º pregão), com o que se sabe agora: [{ data, valor }]. Para os testes
// pré-registrados que medem o retorno depois de uma data (o E4 do ouro, ADR 0154).
async function calcularIndiceFuturo({ prefixo, campo = "SETTLE", desde }, deps = {}) {
  const asOf = new Date();
  const ate = asOf.toISOString().slice(0, 10);
  const retornos = retornosDaCadeia(await lerVencimentos({ prefixo, campo, asOf, desde, ate }, deps), { ate, prefixo });
  let acumulado = 0;
  return retornos.map(({ data, r }) => {
    acumulado += r;
    return { data, valor: 100 * Math.exp(acumulado) };
  });
}

module.exports = { retornosDaCadeia, medirVolatilidade, calcularVolatilidadeFuturo, calcularIndiceFuturo };
