"use strict";

const observationRepository = require("../repositories/observation.repository");
const { buscarNoCatalogo } = require("./observaveis.service");
const { classificarNaFaixa } = require("../shared/analise-diaria-base");

// O realizado de uma leitura diária de tendência (ADR 0063 e adendo): para cada horizonte, em que faixa o preço DE FATO
// caiu, ao lado da faixa que a IA leu. Só mede e classifica, com as faixas gravadas com a leitura; quem compara com a
// leitura é a Qualidade da IA (qualidade-ia.service.js, ADR 0064). Calculado sob demanda, nunca gravado (como um fator,
// ADR 0008): a camada point-in-time só acumula versões, então um cálculo passado se refaz com o mesmo `agora`.
//
// Regras:
//   - a BASE DA AVALIAÇÃO segue de onde os horizontes contam (shared/analise-diaria-base.js::REFERENCIA_HORIZONTES):
//     desde 2026-10-07 (ADR 0106), o preço que a IA recebeu (o do pregão anterior; num horizonte com contrato próprio,
//     o dele), e a variação vai dele ao fim do horizonte; nas leituras que contavam da data da análise (2026-10-03 a
//     2026-10-07, e quando o preço estava defasado), o último preço até a data da análise, conhecido depois; na v1 do
//     petróleo, o último preço recebido;
//   - o alvo é a data-alvo gravada com a leitura (a data de onde os horizontes contam + os dias);
//   - o preço realizado é o último observado até a data-alvo, na versão mais recente (a revisão conta: é o preço que de
//     fato houve), na MESMA série ou contrato da base (sem a troca de vencimento no meio da medida);
//   - um horizonte só é apurado quando o período está completo: a série já tem dado na data-alvo ou depois dela (uma
//     série à vista chega com atraso, como o Brent da EIA, semanal); num futuro, também quando a data-alvo passou há mais
//     que a tolerância da série, porque um contrato vencido nunca terá dado depois dela;
//   - preço longe da data (mais que a tolerância) não serve: SEM_BASE na base, SEM_PRECO no alvo (num futuro, o
//     contrato venceu ou não negociou); nenhum preço novo depois da base (feriado, fim de semana): SEM_PREGAO;
//   - um horizonte com contrato próprio (o milho e o café desde a configuração v3, ADR 0078) é apurado nele, com a base
//     dele; cada horizonte devolve a série e a base que usou.

const SITUACOES = Object.freeze(["APURADO", "A_APURAR", "AGUARDANDO_DADO", "SEM_PRECO", "SEM_PREGAO", "SEM_BASE"]);

const TOLERANCIA_PADRAO_DIAS = 4;

// As séries que já foram preço de referência de uma leitura (ADR 0064), pelo código gravado em
// `entrada.precoReferencia.serie`. Para as leituras gravadas antes do `seriesCode` e para a tolerância de cada série.
// SÓ CRESCE: uma série que deixa de ser a referência (o WTI, trocado pelo Brent) continua aqui, porque as leituras
// antigas a usam. Não depende da lista de séries do Centro de Decisão, que pode mudar.
const SERIES_DE_REFERENCIA = Object.freeze({
  BRENT: { observavel: "PETROLEO_PRECOS_EIA", seriesCode: "EIA.PETROLEO_PRECOS.BRENT" },
  WTI: { observavel: "PETROLEO_PRECOS_EIA", seriesCode: "EIA.PETROLEO_PRECOS.WTI" },
  BRENT_FUTURO: { observavel: "BRENT_FUTURO_PRECOS", futuro: { prefixo: "YAHOO.BZ", campo: "SETTLE", campoContratos: null } },
  GLD: { observavel: "GLD_PRECOS", futuro: { prefixo: "B3.GLD", campo: "SETTLE" } },
  CCM: { observavel: "CCM_PRECOS", futuro: { prefixo: "B3.CCM", campo: "SETTLE" } },
  ICF: { observavel: "ICF_PRECOS", futuro: { prefixo: "B3.ICF", campo: "SETTLE" } },
  // A soja (ADR 0116): o SJC da B3.
  SJC: { observavel: "SJC_PRECOS", futuro: { prefixo: "B3.SJC", campo: "SETTLE" } }
});

function diasEntre(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000);
}

function hojeEmSaoPaulo(agora) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

// A série do preço de uma leitura: o `seriesCode` gravado com ela ou, nas antigas, o do mapa (num futuro, com o contrato
// gravado). -> { seriesCode, futuro, tolerancia } ou null (série desconhecida, futuro sem contrato).
function resolverSerie(precoReferencia) {
  if (!precoReferencia) return null;
  const def = SERIES_DE_REFERENCIA[precoReferencia.serie];
  if (!def) return null;
  const ticker = precoReferencia.contrato?.ticker;
  const derivado = def.futuro ? (ticker ? `${def.futuro.prefixo}.${ticker}.${def.futuro.campo}` : null) : def.seriesCode;
  const seriesCode = precoReferencia.seriesCode || derivado;
  if (!seriesCode) return null;
  return { seriesCode, futuro: Boolean(def.futuro), tolerancia: buscarNoCatalogo(def.observavel)?.toleranciaDias ?? TOLERANCIA_PADRAO_DIAS };
}

// A base da avaliação (pontos em ordem crescente). -> { data, valor, naDataDaAnalise, confirmada } ou null (sem preço até
// a data da análise dentro da tolerância). `confirmada`: o preço da data da análise já chegou ou não pode mais chegar (a
// série tem dado nela ou depois dela; num futuro, também passada a tolerância); até lá, a base é provisória (o Brent da EIA chega com uma
// semana de atraso; o ajuste da B3, no dia seguinte). Na referência antiga (petróleo v1), o preço que a IA recebeu.
// `recebido`: o preço que a IA recebeu ({ dataReferencia, valor }); num horizonte com contrato próprio, o dele.
function baseDaAvaliacao(analise, pontos, { tolerancia, hoje, futuro = false, recebido = analise.precoReferencia }) {
  if (analise.referenciaHorizontes?.tipo !== "DATA_DA_ANALISE") {
    return { data: recebido.dataReferencia, valor: recebido.valor, naDataDaAnalise: false, doPrecoRecebido: true, confirmada: true };
  }
  const confirmada = pontos.some((p) => p.data >= analise.data) || (futuro && diasEntre(analise.data, hoje) > tolerancia);
  const ultimo = [...pontos].reverse().find((p) => p.data <= analise.data);
  if (!ultimo || !ultimo.valor || diasEntre(ultimo.data, analise.data) > tolerancia) return confirmada ? null : { data: null, valor: null, naDataDaAnalise: false, confirmada };
  return { data: ultimo.data, valor: ultimo.valor, naDataDaAnalise: ultimo.data === analise.data, confirmada };
}

// Um horizonte (`dataAlvo` gravada com a leitura), a partir dos pontos da série e da base da avaliação.
function apurarHorizonte({ codigo, dataAlvo, t1, t2 }, { base, pontos, hoje, tolerancia, futuro = false }) {
  const resultado = { horizonte: codigo, dataAlvo, situacao: null, preco: null, dataPreco: null, variacaoPct: null, faixa: null };
  if (!dataAlvo) return { ...resultado, situacao: "SEM_BASE" };
  if (dataAlvo > hoje) return { ...resultado, situacao: "A_APURAR" };

  const completo = pontos.some((p) => p.data >= dataAlvo) || (futuro && diasEntre(dataAlvo, hoje) > tolerancia);
  if (!completo) return { ...resultado, situacao: "AGUARDANDO_DADO" };
  if (!base) return { ...resultado, situacao: "SEM_BASE" };

  const ultimo = [...pontos].reverse().find((p) => p.data <= dataAlvo);
  if (!ultimo || diasEntre(ultimo.data, dataAlvo) > tolerancia) return { ...resultado, situacao: "SEM_PRECO" };
  if (ultimo.data <= base.data) return { ...resultado, situacao: "SEM_PREGAO", preco: ultimo.valor, dataPreco: ultimo.data };

  const variacaoPct = ((ultimo.valor - base.valor) / Math.abs(base.valor)) * 100;
  return {
    ...resultado,
    situacao: "APURADO",
    preco: ultimo.valor,
    dataPreco: ultimo.data,
    variacaoPct,
    faixa: t1 == null || t2 == null ? null : classificarNaFaixa(variacaoPct, { t1, t2 })
  };
}

function semBase(analise) {
  return { seriesCode: null, base: null, horizontes: analise.horizontes.map((h) => ({ horizonte: h.codigo, dataAlvo: h.dataAlvo ?? null, situacao: "SEM_BASE" })) };
}

// Várias leituras de uma vez (a Qualidade da IA): UMA consulta para todas as séries e contratos, da base mais antiga até
// hoje. `analises`: o que analise-diaria.service.js::leituraGravada devolve. -> { realizados (um por leitura, na mesma
// ordem: { seriesCode, base, horizontes }), pontosPorSerie (Map seriesCode -> [{ data, valor }], o que foi consultado; o
// gráfico da Qualidade da IA desenha a linha do preço com eles), hoje }. `diasDePreco`: os pontos começam, no máximo,
// tantos dias antes de hoje, mesmo sem leitura tão antiga (o passado do gráfico).
async function apurarRealizadosComPontos(analises, { agora = new Date(), diasDePreco = 0 } = {}, deps = {}) {
  const hoje = hojeEmSaoPaulo(agora);
  const series = analises.map((a) => (a.precoReferencia?.valor ? resolverSerie(a.precoReferencia) : null));
  // A série de cada horizonte (ADR 0078): a do contrato gravado com ele ou, sem ele, a da leitura.
  const seriesDosHorizontes = analises.map((a, i) =>
    a.horizontes.map((h) => (series[i] && h.seriesCode ? { ...series[i], seriesCode: h.seriesCode } : series[i]))
  );
  const codigos = [...new Set(seriesDosHorizontes.flat().concat(series).filter(Boolean).map((s) => s.seriesCode))];
  if (codigos.length === 0) return { realizados: analises.map(semBase), pontosPorSerie: new Map(), hoje };

  const desde = analises
    .filter((_, i) => series[i])
    .map((a) => a.precoReferencia.dataReferencia)
    .reduce((menor, d) => (d < menor ? d : menor), new Date(Date.parse(`${hoje}T00:00:00Z`) - diasDePreco * 86400000).toISOString().slice(0, 10));
  const repo = deps.observationRepository || observationRepository;
  const linhas = await repo.buscarAsOf({ seriesCodes: codigos, asOf: agora, observadoDesde: desde, observadoAte: hoje });
  const pontosPorSerie = new Map(codigos.map((c) => [c, []]));
  for (const l of linhas) pontosPorSerie.get(l.series_code)?.push({ data: String(l.observed_at).slice(0, 10), valor: Number(l.value) });
  for (const pontos of pontosPorSerie.values()) pontos.sort((a, b) => a.data.localeCompare(b.data));

  // A base e os pontos de uma série, a partir do preço que a IA recebeu nela.
  const contextoDa = (analise, serie, recebido) => {
    const pontos = pontosPorSerie.get(serie.seriesCode).filter((p) => p.data >= recebido.dataReferencia);
    const base = baseDaAvaliacao(analise, pontos, { tolerancia: serie.tolerancia, hoje, futuro: serie.futuro, recebido });
    return { base, pontos, hoje, tolerancia: serie.tolerancia, futuro: serie.futuro };
  };

  const realizados = analises.map((analise, i) => {
    const serie = series[i];
    if (!serie) return semBase(analise);
    const contexto = contextoDa(analise, serie, analise.precoReferencia);
    const horizontes = analise.horizontes.map((h, k) => {
      const doHorizonte = seriesDosHorizontes[i][k];
      // O horizonte com contrato próprio (ADR 0078): a base e o preço no contrato dele.
      const ctx =
        doHorizonte.seriesCode === serie.seriesCode
          ? contexto
          : contextoDa(analise, doHorizonte, h.precoRecebido?.dataReferencia ? h.precoRecebido : analise.precoReferencia);
      return { ...apurarHorizonte(h, ctx), seriesCode: doHorizonte.seriesCode, base: ctx.base };
    });
    return { seriesCode: serie.seriesCode, base: contexto.base, horizontes };
  });
  return { realizados, pontosPorSerie, hoje };
}

async function apurarRealizados(analises, opcoes = {}, deps = {}) {
  return (await apurarRealizadosComPontos(analises, opcoes, deps)).realizados;
}

// Uma leitura (o Centro de Decisão).
async function apurarRealizado(analise, { agora = new Date() } = {}, deps = {}) {
  const [resultado] = await apurarRealizados([analise], { agora }, deps);
  return resultado;
}

module.exports = { apurarRealizado, apurarRealizados, apurarRealizadosComPontos, apurarHorizonte, baseDaAvaliacao, resolverSerie, SERIES_DE_REFERENCIA, SITUACOES };
