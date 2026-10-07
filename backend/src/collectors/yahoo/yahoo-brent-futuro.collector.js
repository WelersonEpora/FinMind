"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { decodificarFuturoB3 } = require("../../shared/utils/b3-contrato");
const { persistirObservacoes } = require("../base/persist-observations");

// Brent FUTURO (o instrumento operado na Pepperstone, P2 do ADR 0055) pelo Yahoo Finance: o contrato Brent da NYMEX
// (BZ, "Brent Crude Oil Last Day Financial"), liquidado financeiramente pelo ICE Brent. FONTE NÃO OFICIAL E
// PROVISÓRIA, autorizada pelo usuário em 2026-10-07 com os riscos registrados (ADR 0096): a oficial (ICE, arquivos de
// fim de dia) é paga e depende do Comitê. Só aquisição de dados: a troca do preço de referência da leitura é outra
// decisão.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-07 (endpoint `query1.finance.yahoo.com/v8/finance/chart/<símbolo>`, JSON,
// sem chave nem documentação oficial; com o user-agent do FinMind responde 200, com o do curl 429):
//   - Um símbolo por vencimento (`BZZ26.NYM`, `BZF27.NYM`...), com o histórico desde a listagem (2018 a 2020 nos
//     vencimentos ativos). O contrato SOME no dia seguinte ao vencimento ("Not Found": o `BZX26.NYM` em 01/10/2026):
//     o histórico de cada vencimento é o que o FinMind guardar enquanto ele negocia.
//   - O fechamento diário é o AJUSTE (janela de 14:28 a 14:30 de Nova York), não o último negócio das 17:00: em 21
//     pregões de set-out/2026, nos dias em que os dois se afastaram (até US$ 1,19), o diário bateu com o ajuste.
//   - A barra do dia aparece com o pregão aberto (preço do momento): só os pregões ANTERIORES ao dia de hoje em Nova
//     York são gravados.
//   - `BZ=F` é a série contínua do 1º vencimento, montada pelo Yahoo (não pelo FinMind), desde 2007-07-30 (~4.800
//     pregões, 58 sem fechamento): o único histórico dos vencimentos que já saíram. Rola no dia seguinte ao
//     vencimento (01/10/2026: de 103,53 no X26 para 102,31 no Z26).
//   - O volume tem dias repetidos (25 e 28/09/2026 com o mesmo número): não é gravado.
//
// Séries: `YAHOO.BZ.<TICKER>.SETTLE` por vencimento (como as da B3) e `YAHOO.BZ_CONTINUO.SETTLE` (a contínua).
// published_at (ESTIMADO): o fim do dia do pregão em Nova York. Uma correção do Yahoo vira versão nova (ADR 0008): a
// coleta diária relê o último mês.

const SOURCE_CODE = "YAHOO";
const PREFIXO_SERIE = "YAHOO.BZ";
const SERIE_CONTINUA = "YAHOO.BZ_CONTINUO.SETTLE";
const SIMBOLO_CONTINUO = "BZ=F";
const UNIT = "US$/barril";
const FUSO = "America/New_York";
const URL_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const LETRAS_DOS_MESES = "FGHJKMNQUVXZ";
// O 1º vencimento é sempre o de daqui a 2 meses (o BZ vence no último dia útil do 2º mês anterior ao do contrato):
// os 13 meses seguintes ao atual cobrem o 1º vencimento e mais um ano de curva. Um mês já vencido dá "Not Found".
const MESES_A_FRENTE = 13;
const PAUSA_ENTRE_PEDIDOS_MS = 300;
const TIMEOUT_BACKFILL_MS = 5 * 60 * 1000;
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatoDataNy = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const dataEmNy = (instante) => formatoDataNy.format(instante);

// Os tickers dos vencimentos a pedir: do mês seguinte ao de `agora` (em Nova York) até MESES_A_FRENTE meses depois.
function tickersAFrente(agora) {
  const [ano, mes] = dataEmNy(agora).split("-").map(Number);
  const tickers = [];
  for (let i = 1; i <= MESES_A_FRENTE; i += 1) {
    const indice = mes - 1 + i;
    const anoDoContrato = ano + Math.floor(indice / 12);
    tickers.push(`BZ${LETRAS_DOS_MESES[indice % 12]}${String(anoDoContrato % 100).padStart(2, "0")}`);
  }
  return tickers;
}

// O que pedir: os vencimentos e a contínua. -> [{ simbolo, ticker }] (ticker null na contínua).
function pedidos(agora) {
  return [...tickersAFrente(agora).map((ticker) => ({ simbolo: `${ticker}.NYM`, ticker })), { simbolo: SIMBOLO_CONTINUO, ticker: null }];
}

// Um símbolo: o corpo JSON, ou null se o Yahoo não tem o símbolo (vencimento já vencido ou ainda não listado).
// Rede, 429 ou 5xx: erro da fonte (a execução falha e o runner repete).
async function baixarSimbolo(simbolo, consulta, { signal, fetchFn }) {
  const url = `${URL_BASE}${encodeURIComponent(simbolo)}?${consulta}&interval=1d`;
  let response;
  try {
    response = await fetchFn(url, { signal, headers: { "user-agent": "FinMind/0.1 (coleta de dados de mercado)" } });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new UpstreamServiceError(`Falha de rede ao consultar o Yahoo (${simbolo}): ${err.message}`);
  }
  const texto = await response.text();
  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new UpstreamServiceError(`Yahoo (${simbolo}) respondeu ${response.status} sem JSON: ${texto.slice(0, 80).replace(/\s+/g, " ")}`);
  }
  if (response.status === 404 && corpo?.chart?.error?.code === "Not Found") return null;
  if (!response.ok) throw new UpstreamServiceError(`Yahoo (${simbolo}) respondeu com status ${response.status}.`);
  return corpo;
}

async function baixarTodos(consulta, { agora = new Date(), signal, fetchFn = fetch, esperar = dormir } = {}) {
  const respostas = [];
  for (const pedido of pedidos(agora)) {
    if (respostas.length) await esperar(PAUSA_ENTRE_PEDIDOS_MS);
    respostas.push({ ...pedido, corpo: await baixarSimbolo(pedido.simbolo, consulta, { signal, fetchFn }) });
  }
  return { agora: agora.toISOString(), respostas };
}

// Coleta diária: o último mês de cada símbolo (cobre cron perdido e pega correções do Yahoo).
const download = ({ signal, ...opcoes } = {}) => baixarTodos("range=1mo", { signal, ...opcoes });
// Backfill: o histórico inteiro que o Yahoo tem de cada símbolo.
const downloadIntervalo = ({ signal, ...opcoes } = {}) => baixarTodos(`period1=0&period2=${Math.floor(Date.now() / 1000)}`, { signal, ...opcoes });

// -> [{ serie, simbolo, ticker, data, valor, parcial }]. Formato inesperado ou símbolo trocado: erro da fonte (layout
// mudou). Nenhum vencimento encontrado: a fonte mudou ou caiu.
function parse(rawData) {
  if (!rawData || !Array.isArray(rawData.respostas)) {
    throw new UpstreamServiceError("Resposta do Yahoo em formato inesperado (esperava a lista de símbolos).");
  }
  const hojeNy = dataEmNy(new Date(rawData.agora));
  const encontrados = rawData.respostas.filter((r) => r.corpo);
  if (!encontrados.some((r) => r.ticker)) {
    throw new UpstreamServiceError(`O Yahoo não tem nenhum dos ${rawData.respostas.length - 1} vencimentos pedidos do Brent (BZ).`);
  }

  const itens = [];
  for (const { simbolo, ticker, corpo } of encontrados) {
    const resultado = corpo?.chart?.result?.[0];
    const meta = resultado?.meta;
    if (!meta || meta.symbol !== simbolo || meta.currency !== "USD" || meta.exchangeName !== "NYM") {
      throw new UpstreamServiceError(`Yahoo (${simbolo}): resposta inesperada (símbolo ${meta?.symbol}, moeda ${meta?.currency}, bolsa ${meta?.exchangeName}).`);
    }
    const instantes = resultado.timestamp || [];
    const fechamentos = resultado.indicators?.quote?.[0]?.close;
    if (!Array.isArray(fechamentos) || fechamentos.length !== instantes.length) {
      throw new UpstreamServiceError(`Yahoo (${simbolo}): a série de fechamentos não acompanha as datas.`);
    }
    const serie = ticker ? `${PREFIXO_SERIE}.${ticker}.SETTLE` : SERIE_CONTINUA;
    instantes.forEach((instante, i) => {
      const data = dataEmNy(new Date(instante * 1000));
      itens.push({ serie, simbolo, ticker, data, valor: fechamentos[i], parcial: data >= hojeNy });
    });
  }
  return itens;
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  const vistos = new Set();
  let semFechamento = 0;
  let emAndamento = 0;

  for (const item of itens) {
    if (item.parcial) {
      emAndamento += 1; // pregão de hoje, ainda aberto: entra na coleta de amanhã
      continue;
    }
    if (item.valor === null || item.valor === undefined) {
      semFechamento += 1;
      continue;
    }
    if (!Number.isFinite(item.valor)) {
      invalidos.push({ item, motivo: `${item.simbolo} ${item.data}: fechamento inválido ("${item.valor}").` });
      continue;
    }
    const chave = `${item.serie}|${item.data}`;
    if (vistos.has(chave)) {
      invalidos.push({ item, motivo: `${item.simbolo}: data repetida na resposta do Yahoo (${item.data}).` });
      continue;
    }
    vistos.add(chave);

    const contrato = item.ticker ? decodificarFuturoB3(item.ticker, "BZ") : null;
    validos.push({
      series_code: item.serie,
      observed_at: item.data,
      // Duas casas, como o preço do contrato (o JSON traz o float: 101.98999786376953).
      value: Math.round(item.valor * 100) / 100,
      unit: UNIT,
      source_code: SOURCE_CODE,
      published_at: zonedParaUtc(item.data, "23:59:59", FUSO),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: {
        fonte: "Yahoo Finance (chart v8, não oficial)",
        simbolo: item.simbolo,
        bolsa: "NYMEX",
        ...(contrato ? { ticker: item.ticker, vencimento: contrato.vencimento } : { serieContinua: "1º vencimento, montada pelo Yahoo" }),
        regraPublicacao: "fim_do_dia_do_pregao_ny"
      }
    });
  }

  // Defeito conhecido da fonte (não é falha): dias sem fechamento na série do Yahoo.
  const avisos = semFechamento
    ? [{ item: null, motivo: `${semFechamento} dia(s) sem fechamento na resposta do Yahoo: não gravados.` }]
    : [];
  return { validos, invalidos, avisos, detalhes: { pregaoEmAndamentoIgnorado: emAndamento } };
}

module.exports = {
  codigo: "yahoo-brent-futuro",
  get timeoutMs() {
    return Math.max(env.collectors.sourceTimeoutMs, 120000);
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist: persistirObservacoes,
  tickersAFrente,
  PREFIXO_SERIE,
  SERIE_CONTINUA,
  SOURCE_CODE,
  TIMEOUT_BACKFILL_MS
};
