"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { decodificarFuturoB3 } = require("../../shared/utils/b3-contrato");
const { persistirObservacoes } = require("../base/persist-observations");

// Futuros de bolsas de Nova York pelo Yahoo Finance, um coletor por produto (criarColetorFuturoYahoo). FONTE NÃO OFICIAL
// E PROVISÓRIA: endpoint sem documentação nem garantia; a fonte oficial de cada produto é paga.
//   - brent: o Brent da NYMEX (BZ, "Brent Crude Oil Last Day Financial"), liquidado financeiramente pelo ICE Brent: o
//     instrumento operado na Pepperstone (P2 do ADR 0055). Autorizado pelo usuário em 2026-10-07 (ADR 0096).
//   - kc: o café arábica "C" da ICE Futures U.S. (KC), para o basis B3 x Nova York, a curva de Nova York e o histórico
//     longo do café (análise do café de 2026-10-19, itens E1, E3 e E10). Autorizado pelo usuário em 2026-10-20 (ADR 0129).
// Só aquisição de dados: a troca do preço de referência de uma leitura é outra decisão.
//
// VERIFICADO POR CHAMADA REAL (endpoint `query1.finance.yahoo.com/v8/finance/chart/<símbolo>`, JSON, sem chave nem
// documentação oficial; com o user-agent do FinMind responde 200, com o do curl 429):
//   - Um símbolo por vencimento (`BZZ26.NYM`, `KCH27.NYB`...), com o histórico desde a listagem. O contrato SOME no dia
//     seguinte ao vencimento ("Not Found": o `BZX26.NYM` em 01/10/2026): o histórico de cada vencimento é o que o
//     FinMind guardar enquanto ele negocia.
//   - O fechamento diário é o AJUSTE, não o último negócio. Brent (2026-10-07): janela de 14:28 a 14:30 de Nova York;
//     em 21 pregões de set-out/2026, nos dias em que os dois se afastaram (até US$ 1,19), o diário bateu com o ajuste.
//     KC (2026-10-20): o pregão fecha às 13:30 de Nova York; no KCH27, o diário de 15, 16 e 19/10 (285,35, 294,50 e
//     302,25) difere do último negócio das 13:25 (287,25, 294,60 e 299,80): é o ajuste, apurado à parte.
//   - A barra do dia aparece com o pregão aberto (preço do momento): só os pregões ANTERIORES ao dia de hoje em Nova
//     York são gravados.
//   - `BZ=F` e `KC=F` são a série contínua do 1º vencimento, montada pelo Yahoo (não pelo FinMind): BZ desde
//     2007-07-30, KC desde 2000-01-03. É o único histórico dos vencimentos que já saíram. O BZ rola no dia seguinte ao
//     vencimento (01/10/2026: de 103,53 no X26 para 102,31 no Z26), sem ajuste.
//   - O volume tem dias repetidos (25 e 28/09/2026 no BZ; 15 e 16/10/2026 no KC): não é gravado.
//   - A MÁXIMA e a MÍNIMA do dia (`high`, `low`) vêm na mesma resposta. Gravadas por vencimento (no Brent desde
//     2026-10-14, para o ATR(14) e o stop do petróleo nas carteiras virtuais, adendo do ADR 0127, etapa 8). Um dia com a
//     faixa incoerente (máxima abaixo da mínima ou o ajuste fora dela) fica sem máxima e mínima, com aviso.
//
// Séries: `YAHOO.<RAIZ>.<TICKER>.SETTLE`, `.HIGH` e `.LOW` por vencimento (como as da B3) e `YAHOO.<RAIZ>_CONTINUO.SETTLE`
// (a contínua, só o ajuste). Cada produto guarda na unidade da bolsa (o KC em centavos de dólar por libra-peso): a
// conversão para US$/saca é um cálculo, fora do coletor.
// published_at (ESTIMADO): o fim do dia do pregão em Nova York. Uma correção do Yahoo vira versão nova (ADR 0008): a
// coleta diária relê o último mês.

const SOURCE_CODE = "YAHOO";
const FUSO = "America/New_York";
const URL_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const LETRAS_DOS_MESES = "FGHJKMNQUVXZ";
const PAUSA_ENTRE_PEDIDOS_MS = 300;
const TIMEOUT_BACKFILL_MS = 5 * 60 * 1000;
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Por produto: a raiz do ticker, o sufixo da bolsa no Yahoo, a moeda e a bolsa que o Yahoo informa (conferidas a cada
// resposta), a unidade gravada e os vencimentos a pedir: do mês `mesInicial` depois do atual (em Nova York) até
// `mesesAFrente` meses depois, só nos meses listados. Um mês já vencido ou ainda não listado dá "Not Found".
const PRODUTOS = {
  // O 1º vencimento do BZ é sempre o de daqui a 2 meses (vence no último dia útil do 2º mês anterior ao do contrato):
  // os 13 meses seguintes ao atual cobrem o 1º vencimento e mais um ano de curva.
  brent: {
    codigo: "yahoo-brent-futuro",
    nome: "Brent (BZ)",
    raiz: "BZ",
    sufixo: ".NYM",
    moeda: "USD",
    bolsaYahoo: "NYM",
    bolsa: "NYMEX",
    unit: "US$/barril",
    meses: LETRAS_DOS_MESES,
    mesInicial: 1,
    mesesAFrente: 13
  },
  // O KC tem 5 vencimentos por ano (março, maio, julho, setembro e dezembro), listados até ~18 meses à frente (em
  // 2026-10-20: do Z26 ao H28). O do mês atual ainda negocia até perto do meio do mês: entra no pedido.
  kc: {
    codigo: "yahoo-kc-futuro",
    nome: "café arábica (KC)",
    raiz: "KC",
    sufixo: ".NYB",
    moeda: "USX",
    bolsaYahoo: "NYB",
    bolsa: "ICE Futures U.S.",
    unit: "US¢/lb",
    meses: "HKNUZ",
    mesInicial: 0,
    mesesAFrente: 18
  }
};

const formatoDataNy = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const dataEmNy = (instante) => formatoDataNy.format(instante);

function criarColetorFuturoYahoo(chave) {
  const produto = PRODUTOS[chave];
  if (!produto) throw new Error(`Produto do Yahoo desconhecido: ${chave}.`);
  const { raiz } = produto;
  const PREFIXO_SERIE = `YAHOO.${raiz}`;
  const SERIE_CONTINUA = `YAHOO.${raiz}_CONTINUO.SETTLE`;
  const SIMBOLO_CONTINUO = `${raiz}=F`;

  // Os tickers dos vencimentos a pedir, a partir do mês de `agora` em Nova York.
  function tickersAFrente(agora) {
    const [ano, mes] = dataEmNy(agora).split("-").map(Number);
    const tickers = [];
    for (let i = produto.mesInicial; i <= produto.mesesAFrente; i += 1) {
      const indice = mes - 1 + i;
      const letra = LETRAS_DOS_MESES[indice % 12];
      if (!produto.meses.includes(letra)) continue;
      const anoDoContrato = ano + Math.floor(indice / 12);
      tickers.push(`${raiz}${letra}${String(anoDoContrato % 100).padStart(2, "0")}`);
    }
    return tickers;
  }

  // O que pedir: os vencimentos e a contínua. -> [{ simbolo, ticker }] (ticker null na contínua).
  function pedidos(agora) {
    return [...tickersAFrente(agora).map((ticker) => ({ simbolo: `${ticker}${produto.sufixo}`, ticker })), { simbolo: SIMBOLO_CONTINUO, ticker: null }];
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

  // -> [{ serie, simbolo, ticker, data, valor, maxima, minima, parcial }] (máxima e mínima só nos vencimentos). Formato
  // inesperado ou símbolo trocado: erro da fonte (layout mudou). Nenhum vencimento encontrado: a fonte mudou ou caiu.
  function parse(rawData) {
    if (!rawData || !Array.isArray(rawData.respostas)) {
      throw new UpstreamServiceError("Resposta do Yahoo em formato inesperado (esperava a lista de símbolos).");
    }
    const hojeNy = dataEmNy(new Date(rawData.agora));
    const encontrados = rawData.respostas.filter((r) => r.corpo);
    if (!encontrados.some((r) => r.ticker)) {
      throw new UpstreamServiceError(`O Yahoo não tem nenhum dos ${rawData.respostas.length - 1} vencimentos pedidos do ${produto.nome}.`);
    }

    const itens = [];
    for (const { simbolo, ticker, corpo } of encontrados) {
      const resultado = corpo?.chart?.result?.[0];
      const meta = resultado?.meta;
      if (!meta || meta.symbol !== simbolo || meta.currency !== produto.moeda || meta.exchangeName !== produto.bolsaYahoo) {
        throw new UpstreamServiceError(`Yahoo (${simbolo}): resposta inesperada (símbolo ${meta?.symbol}, moeda ${meta?.currency}, bolsa ${meta?.exchangeName}).`);
      }
      const instantes = resultado.timestamp || [];
      const cotacoes = resultado.indicators?.quote?.[0];
      const fechamentos = cotacoes?.close;
      if (!Array.isArray(fechamentos) || fechamentos.length !== instantes.length) {
        throw new UpstreamServiceError(`Yahoo (${simbolo}): a série de fechamentos não acompanha as datas.`);
      }
      const serie = ticker ? `${PREFIXO_SERIE}.${ticker}.SETTLE` : SERIE_CONTINUA;
      instantes.forEach((instante, i) => {
        const data = dataEmNy(new Date(instante * 1000));
        const faixa = ticker ? { maxima: cotacoes.high?.[i] ?? null, minima: cotacoes.low?.[i] ?? null } : {};
        itens.push({ serie, simbolo, ticker, data, valor: fechamentos[i], ...faixa, parcial: data >= hojeNy });
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
    let faixaIncoerente = 0;

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

      const contrato = item.ticker ? decodificarFuturoB3(item.ticker, raiz) : null;
      // Duas casas, como o preço do contrato (o JSON traz o float: 101.98999786376953).
      const duasCasas = (v) => Math.round(v * 100) / 100;
      const observacao = (seriesCode, value) => ({
        series_code: seriesCode,
        observed_at: item.data,
        value,
        unit: produto.unit,
        source_code: SOURCE_CODE,
        published_at: zonedParaUtc(item.data, "23:59:59", FUSO),
        published_at_is_estimated: true,
        published_at_basis: "lag_rule",
        metadata: {
          fonte: "Yahoo Finance (chart v8, não oficial)",
          simbolo: item.simbolo,
          bolsa: produto.bolsa,
          ...(contrato ? { ticker: item.ticker, vencimento: contrato.vencimento } : { serieContinua: "1º vencimento, montada pelo Yahoo" }),
          regraPublicacao: "fim_do_dia_do_pregao_ny"
        }
      });
      const ajuste = duasCasas(item.valor);
      validos.push(observacao(item.serie, ajuste));
      if (item.ticker && Number.isFinite(item.maxima) && Number.isFinite(item.minima)) {
        const maxima = duasCasas(item.maxima);
        const minima = duasCasas(item.minima);
        if (minima <= ajuste && ajuste <= maxima) {
          validos.push(observacao(`${PREFIXO_SERIE}.${item.ticker}.HIGH`, maxima), observacao(`${PREFIXO_SERIE}.${item.ticker}.LOW`, minima));
        } else {
          faixaIncoerente += 1;
        }
      }
    }

    // Defeito conhecido da fonte (não é falha): dias sem fechamento na série do Yahoo.
    const avisos = [];
    if (semFechamento) avisos.push({ item: null, motivo: `${semFechamento} dia(s) sem fechamento na resposta do Yahoo: não gravados.` });
    if (faixaIncoerente) avisos.push({ item: null, motivo: `${faixaIncoerente} dia(s) com a máxima e a mínima incoerentes com o ajuste: gravados sem a faixa.` });
    return { validos, invalidos, avisos, detalhes: { pregaoEmAndamentoIgnorado: emAndamento } };
  }

  return {
    codigo: produto.codigo,
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

module.exports = { criarColetorFuturoYahoo, PRODUTOS };
