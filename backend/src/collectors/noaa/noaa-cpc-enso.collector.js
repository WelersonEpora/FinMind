"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// NOAA CPC - o índice do El Niño e da La Niña (ENSO), para o café (análise do café de 2026-10-19, item E6; autorização
// do usuário em 2026-10-21, ADR 0134). Vai ao F1 (clima) como contexto de regime, sem pressão própria.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-21, sem chave, dois arquivos texto da mesma pasta:
//   RONI.ascii.txt  o RONI (Relative Oceanic Niño Index), o índice que o CPC usa desde 2026 para dizer a força do
//                   evento ("SEAS YR ANOM"); jul-set/2026: +1,69
//   oni.ascii.txt   o ONI clássico ("SEAS YR TOTAL ANOM"), para comparação; jul-set/2026: +2,16
// Uma linha por trimestre móvel (DJF, JFM... NDJ), desde DJF/1950, a anomalia em °C.
//
// Séries `NOAA_CPC.ENSO.RONI` e `NOAA_CPC.ENSO.ONI`. observed_at = o 1º dia do mês central do trimestre (JAS/2026 ->
// 2026-08-01; DJF/1950 -> 1950-01-01). published_at ESTIMADO: o dia 14 do mês seguinte ao fim do trimestre (a discussão
// mensal do CPC sai na 2ª quinta-feira, entre os dias 8 e 14). O CPC recalcula os trimestres recentes todo mês: a
// revisão vista depois entra como versão nova, com o instante da coleta (point-in-time.service.js).

const URL_BASE = "https://www.cpc.ncep.noaa.gov/data/indices";
const SOURCE_CODE = "NOAA_CPC";
const PREFIXO_SERIE = "NOAA_CPC.ENSO";
const INDICES = [
  { campo: "RONI", arquivo: "RONI.ascii.txt" },
  { campo: "ONI", arquivo: "oni.ascii.txt" }
];
const TRIMESTRES = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"];
const DIA_PUBLICACAO = 14;

async function download({ signal }) {
  const textos = await Promise.all(INDICES.map((indice) => baixar(`${URL_BASE}/${indice.arquivo}`, { signal })));
  return INDICES.map((indice, i) => ({ campo: indice.campo, texto: textos[i] }));
}

// Os arquivos -> [{ campo, trimestre, ano, anomalia }] (a anomalia é a última coluna, em texto).
function parse(arquivos) {
  const itens = [];
  for (const { campo, texto } of arquivos) {
    const linhas = String(texto).trim().split(/\r?\n/);
    if (!/^\s*SEAS\s+YR\b.*\bANOM\s*$/.test(linhas[0] || "")) {
      throw new UpstreamServiceError(`Arquivo do ${campo} em formato inesperado (cabeçalho "${(linhas[0] || "").trim()}").`);
    }
    for (const linha of linhas.slice(1)) {
      const colunas = linha.trim().split(/\s+/);
      if (colunas.length < 3) continue;
      itens.push({ campo, trimestre: colunas[0], ano: colunas[1], anomalia: colunas.at(-1) });
    }
  }
  return itens;
}

// O trimestre -> o mês central (1 a 12) e o ano dele, e a data de publicação estimada. O ano do arquivo é o do mês
// central (DJF/1951 é dez/1950 a fev/1951, centrado em jan/1951; NDJ/1950, em dez/1950).
function datasDoTrimestre(trimestre, ano) {
  const i = TRIMESTRES.indexOf(trimestre);
  if (i < 0) return null;
  const mesCentral = i + 1;
  const observedAt = `${ano}-${String(mesCentral).padStart(2, "0")}-01`;
  // O trimestre termina no mês central + 1; a publicação, no mês seguinte a esse.
  const publicacao = new Date(Date.UTC(ano, mesCentral + 1, DIA_PUBLICACAO, 23, 59, 59));
  return { observedAt, publishedAt: publicacao };
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  for (const item of itens) {
    const ano = Number(item.ano);
    const datas = Number.isInteger(ano) && ano >= 1950 ? datasDoTrimestre(item.trimestre, ano) : null;
    const anomalia = Number(item.anomalia);
    if (!datas || !Number.isFinite(anomalia) || Math.abs(anomalia) > 10) {
      invalidos.push({ item, motivo: `Trimestre, ano ou anomalia inesperados: ${item.trimestre} ${item.ano} ${item.anomalia}.` });
      continue;
    }
    validos.push({
      series_code: `${PREFIXO_SERIE}.${item.campo}`,
      observed_at: datas.observedAt,
      value: anomalia,
      unit: "°C",
      source_code: SOURCE_CODE,
      published_at: datas.publishedAt,
      published_at_is_estimated: true,
      metadata: { fonte: "NOAA CPC", indice: item.campo, trimestre: `${item.trimestre}/${ano}`, publishedAtBasis: "rule" }
    });
  }
  return { validos, invalidos };
}

module.exports = {
  codigo: "noaa-cpc-enso",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist: persistirObservacoes,
  datasDoTrimestre,
  SOURCE_CODE,
  PREFIXO_SERIE
};
