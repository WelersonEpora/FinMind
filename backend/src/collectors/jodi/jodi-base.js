"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { lerZip } = require("../../shared/utils/zip");
const { persistirObservacoes } = require("../base/persist-observations");

// Base dos coletores do JODI Oil (Joint Organisations Data Initiative): um ZIP mundial com um CSV, do qual cada
// coletor tira UMA combinação de produto, fluxo e unidade, uma série por país. Hoje: a produção de petróleo bruto, do
// arquivo "primary" (ADR 0042), e a demanda total de derivados, do arquivo "secondary" (ADR 0046).
//
// Os dois arquivos têm as mesmas colunas: REF_AREA (ISO 3166 alfa-2), TIME_PERIOD (AAAA-MM), ENERGY_PRODUCT,
// FLOW_BREAKDOWN, UNIT_MEASURE, OBS_VALUE, ASSESSMENT_CODE (1 comparável, 2 consultar metadados, 3 não avaliado). O
// valor ausente é "-".
//
// Custo: o CSV é descompactado inteiro na memória (285 MB no primary, 650 MB no secondary); o filtro procura o trecho
// fixo (",<PRODUTO>,<FLUXO>,<UNIDADE>,") direto no Buffer, sem converter o arquivo em texto.
//
// published_at: o `Last-Modified` do ZIP (real, o instante desta versão do arquivo). Para os meses já presentes na 1ª
// coleta é um limite superior (o valor saiu antes). A fonte não guarda versões: uma revisão vira versão nova com o
// `Last-Modified` do arquivo que a trouxe (ADR 0008).

const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
const SOURCE_CODE = "JODI";
const CABECALHO = "REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE";
const TIMEOUT_MS = 180000;

// Linhas do CSV que contêm o trecho fixo, achadas sem decodificar o resto.
function linhasComTrecho(csv, filtro) {
  const linhas = [];
  let pos = 0;
  while ((pos = csv.indexOf(filtro, pos)) !== -1) {
    const inicio = csv.lastIndexOf(10, pos) + 1;
    let fim = csv.indexOf(10, pos);
    if (fim === -1) fim = csv.length;
    linhas.push(csv.toString("utf8", inicio, fim).trim());
    pos = fim;
  }
  return linhas;
}

// `produto`, `fluxo`, `unidade`: a combinação do CSV. As séries ficam `<prefixoSerie>.<PAIS>.<campo>`.
function criarColetorJodi({ codigo, url, arquivo, produto, fluxo, unidade, prefixoSerie, campo, unit }) {
  const filtro = Buffer.from(`,${produto},${fluxo},${unidade},`);

  async function download({ signal, fetchFn = fetch } = {}) {
    let resposta;
    try {
      resposta = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
    } catch (err) {
      throw new UpstreamServiceError(`Falha de rede ao consultar o JODI: ${err.message}`);
    }
    if (!resposta.ok) throw new UpstreamServiceError(`JODI respondeu com status ${resposta.status} (${new URL(url).pathname}).`);
    const ultimaModificacao = resposta.headers.get("last-modified");
    return { buffer: Buffer.from(await resposta.arrayBuffer()), ultimaModificacao };
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

    return linhasComTrecho(csv, filtro).map((linha) => {
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
        series_code: `${prefixoSerie}.${pais}.${campo}`,
        observed_at: `${periodo}-01`,
        value,
        unit,
        source_code: SOURCE_CODE,
        published_at: publicadoEm || undefined,
        published_at_is_estimated: false,
        published_at_basis: "file_last_modified",
        metadata: { fonte: `JODI Oil - World Database (${arquivo})`, pais, codigoAvaliacao: avaliacao || null }
      });
    }
    const avisos = ausentes > 0 ? [{ item: null, motivo: `${ausentes} meses de país sem valor ("-") no JODI: não gravados.` }] : [];
    return { validos, invalidos, avisos };
  }

  return {
    codigo,
    timeoutMs: TIMEOUT_MS,
    get tentativasRetry() {
      return env.collectors.retryTentativas;
    },
    download,
    parse,
    normalize,
    persist: persistirObservacoes,
    PREFIXO_SERIE: prefixoSerie
  };
}

module.exports = { criarColetorJodi, linhasComTrecho };
