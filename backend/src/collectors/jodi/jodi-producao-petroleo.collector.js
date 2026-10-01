"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { lerZip } = require("../../shared/utils/zip");
const { persistirObservacoes } = require("../base/persist-observations");

// JODI Oil (Joint Organisations Data Initiative) - produção mensal de petróleo por país, do arquivo mundial "primary"
// (petróleo bruto). Fatores do petróleo do FEL 1 "Decisões da OPEP+" (Alto) e "Oferta não-OPEP" (Médio): é o único
// dado gratuito encontrado de produção da OPEP por país. ADR 0042.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01:
//   - ZIP `world_primary_csv.zip` (23 MB, `Last-Modified` 2026-09-22 07:15 UTC, ~5 s), com um CSV de 285 MB:
//     REF_AREA (ISO 3166 alfa-2), TIME_PERIOD (AAAA-MM), ENERGY_PRODUCT, FLOW_BREAKDOWN, UNIT_MEASURE, OBS_VALUE,
//     ASSESSMENT_CODE. Mensal de 2002-01 a 2026-07.
//   - Filtro: CRUDEOIL / INDPROD (produção) / KBD (mil barris por dia): 34.656 linhas, 24.548 com valor, 104 países. O
//     valor ausente é "-" (o único texto encontrado). ASSESSMENT_CODE: 1 comparável, 2 consultar metadados, 3 não
//     avaliado (a maioria).
//   - Lacunas da fonte: Brasil até 2022-12, Rússia até 2023-03, Guiana sem dado; sem agregado mundial.
//
// Custo: descompactar 285 MB leva ~0,25 s e ~600 MB de memória; o filtro procura o trecho ",CRUDEOIL,INDPROD,KBD,"
// direto no Buffer, sem converter o arquivo em texto.
//
// published_at: o `Last-Modified` do ZIP (real, o instante desta versão do arquivo). Para os meses já presentes na 1ª
// coleta é um limite superior (o valor saiu antes). A fonte não guarda versões: uma revisão vira versão nova com o
// `Last-Modified` do arquivo que a trouxe (ADR 0008).

const URL_ZIP = "https://www.jodidata.org/_resources/files/downloads/oil-data/world_primary_csv.zip";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
const SOURCE_CODE = "JODI";
const PREFIXO_SERIE = "JODI.PETROLEO_PRODUCAO";
const CABECALHO = "REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE";
const FILTRO = Buffer.from(",CRUDEOIL,INDPROD,KBD,");
const TIMEOUT_MS = 180000;

async function download({ signal, fetchFn = fetch } = {}) {
  let resposta;
  try {
    resposta = await fetchFn(URL_ZIP, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar o JODI: ${err.message}`);
  }
  if (!resposta.ok) throw new UpstreamServiceError(`JODI respondeu com status ${resposta.status} (${new URL(URL_ZIP).pathname}).`);
  const ultimaModificacao = resposta.headers.get("last-modified");
  return { buffer: Buffer.from(await resposta.arrayBuffer()), ultimaModificacao };
}

// Linhas do CSV com a produção de petróleo em mil barris/dia, achadas pelo trecho fixo, sem decodificar o resto.
function linhasDeProducao(csv) {
  const linhas = [];
  let pos = 0;
  while ((pos = csv.indexOf(FILTRO, pos)) !== -1) {
    const inicio = csv.lastIndexOf(10, pos) + 1;
    let fim = csv.indexOf(10, pos);
    if (fim === -1) fim = csv.length;
    linhas.push(csv.toString("utf8", inicio, fim).trim());
    pos = fim;
  }
  return linhas;
}

function parse(rawData) {
  if (!rawData || !Buffer.isBuffer(rawData.buffer)) throw new UpstreamServiceError("Resposta do JODI em formato inesperado (esperava o ZIP).");
  let entradas;
  try {
    entradas = lerZip(rawData.buffer);
  } catch (err) {
    throw new UpstreamServiceError(`ZIP do JODI ilegível: ${err.message}`);
  }
  const csv = entradas.find((e) => e.nome.toLowerCase().endsWith(".csv"))?.conteudo;
  if (!csv) throw new UpstreamServiceError("ZIP do JODI sem o CSV.");
  const cabecalho = csv.toString("utf8", 0, csv.indexOf(10)).replace(/^﻿/, "").trim();
  if (cabecalho !== CABECALHO) throw new UpstreamServiceError(`CSV do JODI com colunas inesperadas: "${cabecalho}".`);

  const publicadoEm = rawData.ultimaModificacao ? new Date(rawData.ultimaModificacao) : null;
  if (publicadoEm && Number.isNaN(publicadoEm.getTime())) throw new UpstreamServiceError(`Last-Modified inválido no JODI: "${rawData.ultimaModificacao}".`);

  return linhasDeProducao(csv).map((linha) => {
    const [pais, periodo, , , , valor, avaliacao] = linha.split(",");
    return { pais, periodo, valor, avaliacao, publicadoEm };
  });
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  let ausentes = 0;
  for (const { pais, periodo, valor, avaliacao, publicadoEm } of itens) {
    if (valor === "-") {
      ausentes += 1;
      continue;
    }
    const value = Number(valor);
    let motivo = null;
    if (!/^[A-Z]{2}$/.test(pais || "")) motivo = `País em formato inesperado: "${pais}".`;
    else if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo || "")) motivo = `Mês em formato inesperado: "${periodo}".`;
    else if (!Number.isFinite(value) || value < 0 || String(valor).trim() === "") motivo = `Valor inválido: "${valor}".`;
    if (motivo) {
      invalidos.push({ item: { pais, periodo, valor }, motivo });
      continue;
    }
    validos.push({
      series_code: `${PREFIXO_SERIE}.${pais}.PRODUCAO`,
      observed_at: `${periodo}-01`,
      value,
      unit: "mil barris/dia",
      source_code: SOURCE_CODE,
      published_at: publicadoEm || undefined,
      published_at_is_estimated: false,
      published_at_basis: "file_last_modified",
      metadata: { fonte: "JODI Oil - World Database (primary)", pais, codigoAvaliacao: avaliacao || null }
    });
  }
  const avisos = ausentes > 0 ? [{ item: null, motivo: `${ausentes} meses de país sem valor ("-") no JODI: não gravados.` }] : [];
  return { validos, invalidos, avisos };
}

module.exports = {
  codigo: "jodi-producao-petroleo",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist: persistirObservacoes,
  linhasDeProducao,
  PREFIXO_SERIE
};
