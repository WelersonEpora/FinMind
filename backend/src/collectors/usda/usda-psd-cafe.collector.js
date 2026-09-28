"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { lerZip } = require("../../shared/utils/zip");
const { persistirObservacoes } = require("../base/persist-observations");
const { extrairPsdCafe } = require("./usda-psd-cafe.parser");

// USDA FAS PSD - balanço do café verde por país (produção total, de arábica e de robusta, estoque final, consumo,
// exportação e importação), pelo arquivo de download público `psd_coffee_csv.zip`. ADR 0031.
//
// POR QUE O CSV E NÃO A API DA PSD (ADR 0014): é o mesmo dado, sem chave (`FAS_API_KEY`), num arquivo só (~440 KB).
//
// VERIFICADO POR CHAMADA REAL em 2026-09-28 (ver o ADR): 94 países (sem agregado mundial), safras 1960-2026,
// 19 atributos, todos em mil sacas de 60 kg. Brasil 2025: 63.000 (arábica 38.000, robusta 25.000).
//
// LIMITES conhecidos:
//   - O arquivo guarda só o valor ATUAL de cada país × safra × atributo, com o mês (`Calendar_Year`/`Month`) da última
//     revisão. Não há histórico de revisões a carregar (sem backfill): o vintage começa a ser construído agora, como
//     no IMEA (ADR 0018). A primeira coleta é a carga.
//   - published_at: só o MÊS da última revisão, sem dia. Vale o fim do mês em UTC (limite superior; o relatório
//     semestral sai entre os dias 18 e 25, pela listagem do ESMIS), marcado como ESTIMADO. Uma revisão vista numa
//     coleta posterior entra com o instante da coleta (regra do serviço point-in-time para dado estimado).
//   - Sem mês de revisão (`Month` "00": todas as safras de 1960 a 1998 e parte das de 1999 a 2003): a fonte não diz
//     quando o valor foi publicado, e vale o instante da coleta (regra do ADR 0008 para dado sem published_at). O
//     número está certo, mas uma leitura "o que se sabia em D" anterior à primeira coleta não o enxerga.

const URL_ARQUIVO = "https://apps.fas.usda.gov/psdonline/downloads/psd_coffee_csv.zip";
const SOURCE_CODE = "USDA_FAS_PSD";
const TIMEOUT_MS = 2 * 60 * 1000;
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";

async function download({ signal, fetchFn = fetch } = {}) {
  let response;
  try {
    response = await fetchFn(URL_ARQUIVO, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(URL_ARQUIVO).host}: ${err.message}`);
  }
  if (!response.ok) {
    throw new UpstreamServiceError(`${new URL(URL_ARQUIVO).host} respondeu com status ${response.status} (${new URL(URL_ARQUIVO).pathname}).`);
  }
  let entradas;
  try {
    entradas = lerZip(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    throw new UpstreamServiceError(`O arquivo da PSD do café não é um ZIP legível: ${err.message}`);
  }
  const csv = entradas.find((e) => /\.csv$/i.test(e.nome));
  if (!csv) throw new UpstreamServiceError(`O ZIP da PSD do café não traz um CSV (entradas: ${entradas.map((e) => e.nome).join(", ") || "nenhuma"}).`);
  return { texto: csv.conteudo.toString("utf8"), ultimaModificacao: response.headers?.get?.("last-modified") || null };
}

function parse(rawData) {
  let resultado;
  try {
    resultado = extrairPsdCafe(rawData?.texto);
  } catch (err) {
    throw new UpstreamServiceError(err.message);
  }
  if (resultado.observacoes.length === 0 && resultado.invalidos.length === 0) {
    throw new UpstreamServiceError("O CSV da PSD do café não traz nenhum dos atributos coletados (os IDs mudaram?).");
  }
  const ultimaModificacao = rawData?.ultimaModificacao ?? null;
  return [
    ...resultado.observacoes.map((observacao) => ({ observacao, ultimaModificacao })),
    ...resultado.invalidos.map((invalido) => ({ invalido }))
  ];
}

// Último segundo do mês "AAAA-MM" em UTC.
function fimDoMesUtc(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 1) - 1000);
}

function normalize(entradas) {
  const validos = [];
  const invalidos = [];

  for (const { observacao: o, invalido, ultimaModificacao } of entradas) {
    if (invalido) {
      invalidos.push({ item: invalido.item, motivo: invalido.motivo });
      continue;
    }
    validos.push({
      series_code: o.seriesCode,
      observed_at: o.observedAt,
      value: o.valor,
      unit: o.unidade,
      source_code: SOURCE_CODE,
      // Sem mês de revisão, sem published_at: o serviço usa o instante da coleta (basis "collected_at").
      ...(o.mesRevisao ? { published_at: fimDoMesUtc(o.mesRevisao), published_at_basis: "lag_rule" } : {}),
      published_at_is_estimated: true,
      metadata: {
        fonte: "USDA FAS - PSD Online (café verde)",
        produto: "cafe",
        pais: o.pais,
        nomePais: o.nomePais,
        metrica: o.campo,
        safra: o.safra,
        mesRevisao: o.mesRevisao,
        ...(ultimaModificacao ? { arquivoModificadoEm: ultimaModificacao } : {})
      }
    });
  }

  // Ordem cronológica de publicação (o serviço compara cada valor com a última versão da série); os sem data por último.
  validos.sort((a, b) => (a.published_at?.getTime() ?? Infinity) - (b.published_at?.getTime() ?? Infinity));
  return { validos, invalidos };
}

const persist = (validos, contexto, deps = {}) => persistirObservacoes(validos, contexto, deps);

module.exports = {
  codigo: "usda-psd-cafe",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist,
  fimDoMesUtc,
  SOURCE_CODE,
  URL_ARQUIVO
};
