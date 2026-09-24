"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// Reservas internacionais brasileiras (BCB), diárias - a metade "Reservas" da linha "Relatório Focus e Reservas
// (BCB)" do relatório FEL 1 (ouro; "Banco Central do Brasil: reservas internacionais brasileiras", pela API de
// dados abertos). Escopo estrito do FEL 1: uma série, o total. ADR 0023.
//
// VERIFICADO POR CHAMADA REAL em 2026-09-23:
//   - SGS 13621 = "Reservas internacionais - Total - diária", US$ (milhões), periodicidade D (serviço web do SGS,
//     getUltimoValorXML). Desde 1998-09-01, só em dia útil.
//   - A mensal oficial (SGS 3546, "Reservas internacionais - Total - mensal", desde 1971) é o fim de mês desta
//     diária: 32 de 32 meses iguais (jan/2024 a ago/2026). Por isso só a diária é coletada.
//   - A variante "conceito liquidez" (SGS 13982, desde 2008) inclui linhas com recompra e empréstimos em moeda
//     estrangeira e difere do total desde nov/2024: não é a série "Total" e não é coletada.
//   - A API do SGS rejeita pedido de mais de 10 anos: o intervalo é dividido em janelas.
//
// published_at (ESTIMADO, a fonte não informa): na quarta 23/09/2026 à noite o último valor era o de terça 22/09 -
// o valor de D sai no dia útil seguinte. Vale o fim do dia (UTC) da PRÓXIMA DATA DA PRÓPRIA SÉRIE (o próximo dia
// útil do BCB: feriado sai da fonte). O ponto mais recente ainda não tem a data seguinte: fica sem published_at e o
// serviço usa collected_at (ADR 0008) - conservador.
//
// Vai para `observation` (e não para `market_quote`, como o dólar): o relatório FEL 1 exige saber quando o dado
// ficou disponível (defasagem de publicação) e a fonte não informa se revisa - se revisar, a versão nova entra
// sozinha (ADR 0008).

const SERIE_SGS = 13621;
const URL_BASE = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIE_SGS}/dados`;
const SOURCE_CODE = "BCB_SGS";
const SERIES_CODE = "BCB_SGS.RESERVAS_INTERNACIONAIS";
const UNIT = "US$ milhões";
const PRIMEIRA_DATA = "1998-09-01";
const PONTOS_NA_COLETA_DIARIA = 10;
const ANOS_POR_JANELA = 10;
const TIMEOUT_BACKFILL_MS = 5 * 60 * 1000;
// A API do SGS às vezes devolve XML/HTML no lugar de JSON (visto em 2026-09-23 numa janela de 10 anos; passou na
// repetição - mesmo achado do backfill da Selic) e demora até ~20 s por janela.
const TENTATIVAS_POR_JANELA = 3;
const PAUSA_ENTRE_TENTATIVAS_MS = 2000;
const REGEX_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function paraIsoDeBr(dataBr) {
  const m = REGEX_DATA_BR.exec(dataBr ?? "");
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? null : iso;
}

function paraBrDeIso(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// [dataInicial, dataFinal] (ISO) em janelas consecutivas de até 10 anos (limite da API).
function dividirEmJanelas(dataInicial, dataFinal) {
  const janelas = [];
  let inicio = dataInicial;
  while (inicio <= dataFinal) {
    const fimJanela = `${Number(inicio.slice(0, 4)) + ANOS_POR_JANELA - 1}-12-31`;
    const fim = fimJanela < dataFinal ? fimJanela : dataFinal;
    janelas.push({ dataInicial: inicio, dataFinal: fim });
    inicio = `${Number(fim.slice(0, 4)) + 1}-01-01`;
  }
  return janelas;
}

// Baixa como texto e só então interpreta: uma resposta que não é JSON vira erro da fonte (com o começo do corpo), não
// um SyntaxError.
async function baixarJson(url, { signal, baixarFn }) {
  const texto = await baixarFn(url, { signal });
  try {
    return JSON.parse(texto);
  } catch {
    throw new UpstreamServiceError(`SGS ${SERIE_SGS}: resposta não é JSON (${String(texto).slice(0, 80).replace(/\s+/g, " ")}).`);
  }
}

function download({ signal, baixarFn = baixar } = {}) {
  return baixarJson(`${URL_BASE}/ultimos/${PONTOS_NA_COLETA_DIARIA}?formato=json`, { signal, baixarFn });
}

async function baixarJanela(janela, { signal, baixarFn, esperar }) {
  const url = `${URL_BASE}?formato=json&dataInicial=${paraBrDeIso(janela.dataInicial)}&dataFinal=${paraBrDeIso(janela.dataFinal)}`;
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      const corpo = await baixarJson(url, { signal, baixarFn });
      if (!Array.isArray(corpo)) throw new UpstreamServiceError(`SGS ${SERIE_SGS}: resposta inesperada para ${janela.dataInicial} a ${janela.dataFinal}.`);
      return corpo;
    } catch (err) {
      if (tentativa >= TENTATIVAS_POR_JANELA || signal?.aborted) throw err;
      await esperar(PAUSA_ENTRE_TENTATIVAS_MS);
    }
  }
}

// Backfill: as janelas em sequência, concatenadas (a data de publicação de um ponto depende do ponto seguinte,
// inclusive na virada de janela).
async function downloadIntervalo({
  dataInicial = PRIMEIRA_DATA,
  dataFinal = new Date().toISOString().slice(0, 10),
  signal,
  baixarFn = baixar,
  esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  const pontos = [];
  for (const janela of dividirEmJanelas(dataInicial, dataFinal)) {
    pontos.push(...(await baixarJanela(janela, { signal, baixarFn, esperar })));
  }
  return pontos;
}

// Cada ponto ganha a próxima data da série (a data estimada de publicação) ou null (o mais recente).
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do SGS em formato inesperado (esperava um array).");
  }
  const itens = rawData.map((item) => ({ item, data: paraIsoDeBr(item?.data) }));
  const datas = [...new Set(itens.map((i) => i.data).filter(Boolean))].sort();
  const seguinte = new Map(datas.map((d, i) => [d, datas[i + 1] ?? null]));
  return itens.map((i) => ({ ...i, diaPublicacao: i.data ? seguinte.get(i.data) : null }));
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  const vistos = new Set();

  for (const { item, data, diaPublicacao } of itens) {
    if (!data) {
      invalidos.push({ item, motivo: `Data em formato inesperado: "${item?.data}".` });
      continue;
    }
    const valor = Number(item?.valor);
    if (item?.valor === null || item?.valor === "" || !Number.isFinite(valor) || valor <= 0) {
      invalidos.push({ item, motivo: `Valor inválido: "${item?.valor}".` });
      continue;
    }
    if (vistos.has(data)) {
      invalidos.push({ item, motivo: `Data repetida na resposta do SGS: ${data}.` });
      continue;
    }
    vistos.add(data);

    validos.push({
      series_code: SERIES_CODE,
      observed_at: data,
      value: valor,
      unit: UNIT,
      source_code: SOURCE_CODE,
      // Sem a data seguinte na fonte (ponto mais recente): sem published_at -> collected_at (ADR 0008).
      ...(diaPublicacao ? { published_at: fimDoDiaUtc(diaPublicacao), published_at_is_estimated: true, published_at_basis: "lag_rule" } : {}),
      metadata: {
        fonte: "BCB SGS",
        serieSgs: SERIE_SGS,
        dataOriginal: item.data,
        regraPublicacao: diaPublicacao ? "proxima_data_da_serie" : "sem_data_seguinte_na_fonte"
      }
    });
  }

  return { validos, invalidos };
}

module.exports = {
  codigo: "bcb-reservas-internacionais",
  get timeoutMs() {
    return env.collectors.bcbSgsTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist: persistirObservacoes,
  dividirEmJanelas,
  SERIE_SGS,
  SERIES_CODE,
  SOURCE_CODE,
  PRIMEIRA_DATA,
  TIMEOUT_BACKFILL_MS
};
