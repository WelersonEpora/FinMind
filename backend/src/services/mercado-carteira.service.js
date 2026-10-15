"use strict";

const observationRepository = require("../repositories/observation.repository");
const marketQuoteRepository = require("../repositories/market-quote.repository");
const precoMarketQuote = require("../shared/preco-market-quote");
const { decodificarFuturoB3 } = require("../shared/utils/b3-contrato");
const { limiteDoVencimento } = require("./centro-decisao.service");
const { CONFIGURACOES } = require("../shared/analise-diaria");
const { ESPECIFICACOES, valorDoPonto } = require("../carteiras/especificacoes");
const { calcularAtr } = require("../carteiras/atr");
const { somarDias, somarDiasUteis } = require("../carteiras/calendario");

// O mercado das carteiras virtuais (ADR 0127): só dado GLOBAL, nunca do espaço (ADR 0007, §7). Lê as séries que já
// existem: os futuros por vencimento (observation, point-in-time), a PTAX e a Selic (market_quote).
//
//   para a DECISÃO de D: até o ajuste de D−1, conhecido no instante `agora` (a madrugada de D). Por ativo: o contrato
//     (o primeiro com limite a mais de N dias úteis de D e com a liquidez mínima no último pregão), o ATR(14) dele, o
//     último ajuste, a variação de 30 dias (a Persistência) e o valor do ponto (com a PTAX de D−1).
//   para a LIQUIDAÇÃO de D: a barra de D (ajuste, máxima, mínima e médio) de cada contrato pedido e, pela conta, o dia
//     útil e o juro do caixa: na B3, a PTAX de D (o dia útil do BCB, o câmbio) e a Selic realizada; na conta
//     internacional (em dólar, etapa 8), o Brent contínuo de D (o pregão da NYMEX) e a meta do Fed (o ponto médio da
//     faixa, decisão do usuário em 2026-10-14). Os dois juros em taxa diária de 252 dias úteis.
//
// Calendário: segunda a sexta. Um feriado aparece como um dia sem barra nem o dado do dia útil da conta (o motor expira
// as ordens dele). O dia sem dado é reconhecido como feriado quando já existe dado de um dia POSTERIOR (o do dia útil ou o
// ajuste de um dos contratos): a liquidação segue sem esperar. Sem essa prova, espera até DIAS_DE_ESPERA (o dado pode só
// estar atrasado). Na conta internacional, o ouro é o da B3 (GLD) e o petróleo, o da NYMEX: num feriado só de uma das
// bolsas, o ativo dela fica sem barra no dia (as ordens dele expiram e a posição não é marcada).

// O prefixo das séries do futuro de cada ativo e se ele tem o número de contratos negociados (o Brent do Yahoo não).
const FUTUROS = Object.freeze({
  MILHO: { prefixo: "B3.CCM", contratos: true },
  CAFE: { prefixo: "B3.ICF", contratos: true },
  SOJA: { prefixo: "B3.SJC", contratos: true },
  // O dólar: o minidólar (WDO), onde está a liquidez; o mesmo ajuste do DOL (ADR 0118). A variação de 30 dias (a
  // Persistência) vem da PTAX, a série da faixa LATERAL e da Qualidade da IA: o WDO embute o diferencial de juros e
  // converge para a PTAX até o vencimento (~0,5 p.p. a menos em 30 dias). Decisão do usuário, 2026-10-15 (ADR 0127).
  DOLAR: { prefixo: "B3.WDO", contratos: true, variacaoPela: "BCB.PTAX.VENDA" },
  OURO: { prefixo: "B3.GLD", contratos: true },
  PETROLEO: { prefixo: "YAHOO.BZ", contratos: false }
});

// Janela de busca da decisão: o ATR(14) pede 15 pregões e a variação, 30 dias corridos.
const DIAS_DE_HISTORICO = 60;
const PTAX = "BCB.PTAX.VENDA";
// O dia útil da conta internacional: o pregão da NYMEX, pelo Brent contínuo (o mesmo coletor do petróleo).
const BRENT_CONTINUO = "YAHOO.BZ_CONTINUO.SETTLE";
const META_FED = ["FRED.DFEDTARL", "FRED.DFEDTARU"];
// Até quantos dias corridos a liquidação de um dia espera pelo dado dele, sem dado de um dia posterior, antes de tratá-lo
// como sem pregão.
const DIAS_DE_ESPERA = 4;

const linhasPorSerie = (linhas) => {
  const mapa = new Map();
  for (const l of linhas) {
    if (!mapa.has(l.series_code)) mapa.set(l.series_code, new Map());
    mapa.get(l.series_code).set(String(l.observed_at).slice(0, 10), Number(l.value));
  }
  return mapa;
};

// O limite T1 do horizonte MEDIO de cada ativo (a faixa LATERAL da Persistência): o da configuração da leitura diária.
function t1DoMedio(ativo) {
  return CONFIGURACOES[ativo]?.FAIXAS?.MEDIO?.t1 ?? null;
}

async function ptaxAte(data, asOf, deps) {
  const linhas = await precoMarketQuote.buscarLinhas(PTAX, { asOf, observadoDesde: somarDias(data, -10), observadoAte: data }, deps);
  const ultima = linhas[linhas.length - 1];
  return ultima ? { data: ultima.observed_at, valor: ultima.value } : null;
}

// A variação de 30 dias corridos do último ponto (em ordem crescente) contra o último ponto até 30 dias antes dele. -> %
// ou null (sem histórico).
function variacao30d(pontos) {
  const ultimo = pontos[pontos.length - 1];
  const base = ultimo ? [...pontos].reverse().find((p) => p.data <= somarDias(ultimo.data, -30)) : null;
  return base ? (ultimo.valor / base.valor - 1) * 100 : null;
}

// O mercado de um ativo para a decisão de D. -> { contrato, atr, ajuste, dataAjuste, variacao30dPct, valorDoPonto } ou
// null, com o motivo em `semMercado`.
async function lerAtivoParaDecisao(ativo, { data, conta, parametros, asOf, cambio }, deps) {
  const repo = deps.observationRepository || observationRepository;
  const futuro = FUTUROS[ativo];
  const ate = somarDias(data, -1);
  const regra = parametros.ativos[ativo];
  const limiteMinimo = somarDiasUteis(data, regra.diasUteisMinimosAteOLimite);
  const candidatos = (await repo.listarUltimasDatasItens({ prefixoSerie: futuro.prefixo, campoReferencia: "SETTLE" }))
    .map((item) => decodificarFuturoB3(item.codigo))
    .filter(Boolean)
    .map((c) => ({ ...c, limite: limiteDoVencimento(c) }))
    .filter((c) => c.limite > limiteMinimo)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  if (candidatos.length === 0) return { semMercado: "SEM_CONTRATO" };

  const campos = futuro.contratos ? ["SETTLE", "HIGH", "LOW", "CONTRACTS"] : ["SETTLE", "HIGH", "LOW"];
  const linhas = await repo.buscarAsOf({
    seriesCodes: candidatos.flatMap((c) => campos.map((campo) => `${futuro.prefixo}.${c.ticker}.${campo}`)),
    asOf,
    observadoDesde: somarDias(data, -DIAS_DE_HISTORICO),
    observadoAte: ate
  });
  const series = linhasPorSerie(linhas);
  const ajustes = (c) => series.get(`${futuro.prefixo}.${c.ticker}.SETTLE`) || new Map();
  const ultimoPregao = [...series.entries()]
    .filter(([codigo]) => codigo.endsWith(".SETTLE"))
    .flatMap(([, dias]) => [...dias.keys()])
    .reduce((maior, d) => (d > maior ? d : maior), "");
  if (!ultimoPregao) return { semMercado: "SEM_PRECO" };

  // O primeiro vencimento que negociou no último pregão com a liquidez mínima (o Brent, sem esse dado, só pelo ajuste).
  const minimo = regra.liquidezMinima;
  const contrato = candidatos.find((c) => {
    if (!ajustes(c).has(ultimoPregao)) return false;
    if (!futuro.contratos) return true;
    return (series.get(`${futuro.prefixo}.${c.ticker}.CONTRACTS`)?.get(ultimoPregao) ?? 0) >= minimo;
  });
  if (!contrato) return { semMercado: "SEM_LIQUIDEZ" };

  const diasDoContrato = [...ajustes(contrato).keys()].sort();
  const maximas = series.get(`${futuro.prefixo}.${contrato.ticker}.HIGH`) || new Map();
  const minimas = series.get(`${futuro.prefixo}.${contrato.ticker}.LOW`) || new Map();
  const barras = diasDoContrato.map((d) => ({ data: d, ajuste: ajustes(contrato).get(d), maxima: maximas.get(d), minima: minimas.get(d) }));
  const ultima = barras[barras.length - 1];

  return {
    contrato: { ticker: contrato.ticker, limite: contrato.limite },
    atr: calcularAtr(barras, parametros.execucao.periodoAtr),
    ajuste: ultima.ajuste,
    dataAjuste: ultima.data,
    variacao30dPct: futuro.variacaoPela
      ? variacao30d((await precoMarketQuote.buscarLinhas(futuro.variacaoPela, { asOf, observadoDesde: somarDias(data, -DIAS_DE_HISTORICO), observadoAte: ate }, deps)).map((l) => ({ data: String(l.observed_at).slice(0, 10), valor: Number(l.value) })))
      : variacao30d(barras.map((b) => ({ data: b.data, valor: b.ajuste }))),
    valorDoPonto: valorDoPonto(ativo, conta, cambio)
  };
}

// -> { mercado: { ATIVO: {...} | null }, semMercado: { ATIVO: motivo }, cambio, t1PorAtivo }
async function lerMercadoParaDecisao({ data, conta, ativos, parametros, agora = new Date() }, deps = {}) {
  const asOf = agora;
  const ptax = await ptaxAte(somarDias(data, -1), asOf, deps);
  const cambio = ptax?.valor ?? null;
  const mercado = {};
  const semMercado = {};
  for (const ativo of ativos) {
    const lido = await lerAtivoParaDecisao(ativo, { data, conta, parametros, asOf, cambio }, deps);
    if (lido.semMercado) {
      mercado[ativo] = null;
      semMercado[ativo] = lido.semMercado;
    } else mercado[ativo] = lido;
  }
  return { mercado, semMercado, cambio, t1PorAtivo: Object.fromEntries(ativos.map((a) => [a, t1DoMedio(a)])) };
}

// A Selic realizada (% a.a.) do dia ou do último dia antes dele, em taxa diária (252 dias úteis).
async function taxaCaixaDoDia(data, deps) {
  const repo = deps.marketQuoteRepository || marketQuoteRepository;
  const linhas = await repo.buscarSerie({ instrumentCode: "SELIC", modality: "realizada", dataInicio: somarDias(data, -10), dataFim: data });
  const ultima = linhas[linhas.length - 1];
  if (!ultima) return null;
  return Math.pow(1 + Number(ultima.value) / 100, 1 / 252) - 1;
}

// A meta do Fed (o ponto médio da faixa) do dia ou do último dia antes dele, em taxa diária (252 dias úteis).
async function taxaFedDoDia(data, agora, deps) {
  const repo = deps.observationRepository || observationRepository;
  const series = linhasPorSerie(await repo.buscarAsOf({ seriesCodes: META_FED, asOf: agora, observadoDesde: somarDias(data, -10), observadoAte: data }));
  const ultimo = (codigo) => {
    const dias = [...(series.get(codigo)?.entries() || [])].sort(([a], [b]) => a.localeCompare(b));
    return dias.length ? dias[dias.length - 1][1] : null;
  };
  const [inferior, superior] = META_FED.map(ultimo);
  if (inferior == null || superior == null) return null;
  return Math.pow(1 + (inferior + superior) / 2 / 100, 1 / 252) - 1;
}

// O dia útil de cada conta: o dado que o prova (`doDia`: { util, cambio }), a prova de um dia útil posterior
// (`haPosterior`), o motivo da espera e o juro do caixa no dia.
const CALENDARIOS = {
  B3: {
    semDia: "SEM_PTAX_DO_DIA",
    async doDia(data, agora, deps) {
      const ptax = await ptaxAte(data, agora, deps);
      const doDia = ptax?.data === data ? ptax.valor : null;
      return { util: doDia != null, cambio: doDia ?? ptax?.valor ?? null };
    },
    async haPosterior(data, hoje, agora, deps) {
      const ultima = await ptaxAte(hoje, agora, deps);
      return Boolean(ultima && ultima.data > data);
    },
    taxaDoDia: (data, agora, deps) => taxaCaixaDoDia(data, deps)
  },
  INTERNACIONAL: {
    semDia: "SEM_PREGAO_NYMEX_DO_DIA",
    async doDia(data, agora, deps) {
      const repo = deps.observationRepository || observationRepository;
      const linhas = await repo.buscarAsOf({ seriesCodes: [BRENT_CONTINUO], asOf: agora, observadoDesde: data, observadoAte: data });
      return { util: linhas.length > 0, cambio: null };
    },
    async haPosterior(data, hoje, agora, deps) {
      const repo = deps.observationRepository || observationRepository;
      return (await repo.buscarAsOf({ seriesCodes: [BRENT_CONTINUO], asOf: agora, observadoDesde: somarDias(data, 1), observadoAte: hoje })).length > 0;
    },
    taxaDoDia: (data, agora, deps) => taxaFedDoDia(data, agora, deps)
  }
};

// A prova de que D não teve o dado que falta (feriado): já existe o mesmo dado de um dia depois de D, conhecido no
// instante `agora`. Falta o dia útil da conta: há um posterior? Falta a barra: algum dos contratos tem ajuste posterior?
async function haDadoPosterior({ data, hoje, agora, calendario, diaUtil, temBarra, tickers }, deps) {
  if (!diaUtil && !(await calendario.haPosterior(data, hoje, agora, deps))) return false;
  if (!temBarra) {
    const ajustes = Object.entries(tickers).flatMap(([ativo, lista]) => lista.map((ticker) => `${FUTUROS[ativo].prefixo}.${ticker}.SETTLE`));
    if (ajustes.length) {
      const repo = deps.observationRepository || observationRepository;
      const depois = await repo.buscarAsOf({ seriesCodes: ajustes, asOf: agora, observadoDesde: somarDias(data, 1), observadoAte: hoje });
      if (!depois.length) return false;
    }
  }
  return true;
}

// A liquidação de D. `tickers`: { ATIVO: [ticker] } dos contratos com posição ou ordem; `conta`: a da carteira (o
// calendário e o juro do caixa). -> { pendente } (o dado do dia ainda pode chegar) ou { barras, cambio, taxaCaixaDia,
// diaUtil }.
async function lerMercadoParaLiquidacao({ data, tickers, conta = "B3", agora = new Date(), hoje }, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const calendario = CALENDARIOS[conta];
  if (!calendario) throw new Error(`Conta sem calendário: ${conta}`);
  const dia = await calendario.doDia(data, agora, deps);
  const seriesCodes = Object.entries(tickers).flatMap(([ativo, lista]) =>
    lista.flatMap((ticker) => ["SETTLE", "HIGH", "LOW", "AVG"].map((campo) => `${FUTUROS[ativo].prefixo}.${ticker}.${campo}`))
  );
  const linhas = seriesCodes.length ? await repo.buscarAsOf({ seriesCodes, asOf: agora, observadoDesde: data, observadoAte: data }) : [];
  const series = linhasPorSerie(linhas);
  const barras = {};
  for (const [ativo, lista] of Object.entries(tickers)) {
    for (const ticker of lista) {
      const valor = (campo) => series.get(`${FUTUROS[ativo].prefixo}.${ticker}.${campo}`)?.get(data);
      if (valor("SETTLE") == null) continue;
      barras[ticker] = { ajuste: valor("SETTLE"), maxima: valor("HIGH"), minima: valor("LOW"), medio: valor("AVG") };
    }
  }
  // Dentro da espera, só liquida com o dia útil da conta (o calendário do caixa) e, havendo contrato a marcar, com a
  // barra dele. Passada a espera (ou provado o feriado), o dia sem dado é um feriado: sem barra, as ordens expiram; o
  // câmbio é o último conhecido (nada é marcado sem barra) e o caixa não rende.
  const temBarra = Object.keys(barras).length > 0;
  const completo = dia.util && (seriesCodes.length === 0 || temBarra);
  if (!completo && somarDias(data, DIAS_DE_ESPERA) > hoje && !(await haDadoPosterior({ data, hoje, agora, calendario, diaUtil: dia.util, temBarra, tickers }, deps))) {
    return { pendente: !dia.util ? calendario.semDia : "SEM_BARRA_DO_DIA" };
  }
  const taxa = dia.util ? await calendario.taxaDoDia(data, agora, deps) : 0;
  return { barras, cambio: dia.cambio, taxaCaixaDia: taxa ?? 0, diaUtil: dia.util };
}

module.exports = { FUTUROS, lerMercadoParaDecisao, lerMercadoParaLiquidacao, t1DoMedio, ESPECIFICACOES };
