"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirPorEdicao } = require("../base/persist-observations");
const { listarEdicoes, baixarEdicoes, csvDaEdicao } = require("./usda-area-plantada.collector");
const { extrairEstoques, ehOutroRelatorio, CULTURAS: BLOCOS } = require("./usda-grain-stocks.parser");

// USDA NASS - Grain Stocks: estoques de milho (e, desde 2026-10-08, de soja: fase 1 da soja, só aquisição, ADR 0113)
// dos EUA em 1º de março, junho, setembro e dezembro, por posição (na
// fazenda, fora da fazenda e total), lidos do CSV de cada edição publicada no ESMIS. ADR 0035.
//
// POR QUE O ESMIS E NÃO A API DO QUICKSTATS: a API guarda só o valor revisado (os estoques de 2025 foram
// sobrescritos no relatório anual de jan/2026, e o 1º de setembro mudou 1,3%). O ESMIS guarda cada edição como
// saiu, com a data do release: o vintage real, como no WASDE e na área plantada (ADR 0027), de quem reaproveita a
// listagem e o download.
//
// POR QUE ESTE DADO (o WASDE já tem o estoque final): o WASDE só traz o estoque de fim de ano-safra (1º de
// setembro). Os de 1º de dezembro, março e junho não estão em nenhuma outra fonte nossa, e o de setembro sai aqui
// antes de chegar ao WASDE do mês seguinte.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01 (ver o ADR): 103 edições com ZIP (CSV), de 2001-06-29 a 2026-09-30;
// as 102 do Grain Stocks lidas sem erro, em três layouts; a data de dentro do CSV igual à da listagem nas 102; na
// fazenda + fora da fazenda = total em todos os valores. A 103ª (2003-02-27) é outro relatório listado por engano:
// vira aviso.
//
// SÉRIES: `USDA.GRAIN_STOCKS.CORN.<POSICAO>` (TOTAL, ON_FARM, OFF_FARM), em mil bushels, como publicado.
// observed_at = a data do estoque (1º de março, junho, setembro ou dezembro). Cada edição traz os trimestres do
// ano anterior e do corrente, cada um uma versão.
//
// published_at: a data do release é REAL (listagem do ESMIS, conferida com o CSV). O horário não: o relatório sai
// ao meio-dia de Washington, e aqui vale o FIM DO DIA em UTC (como no WASDE).

const PUBLICACAO = "grain-stocks";
// Um coletor por grão, com as mesmas edições; a soja tem fonte própria (o descarte das edições já ingeridas olha a
// fonte; ver o WASDE, ADR 0111).
const CULTURAS = {
  milho: { codigo: "usda-grain-stocks-milho", sourceCode: "USDA_NASS_GRAIN_STOCKS", prefixoSerie: "USDA.GRAIN_STOCKS.CORN", bloco: BLOCOS.milho, scriptBackfill: "backfill:usda-grain-stocks" },
  soja: { codigo: "usda-grain-stocks-soja", sourceCode: "USDA_NASS_GRAIN_STOCKS_SOJA", prefixoSerie: "USDA.GRAIN_STOCKS.SOYBEANS", bloco: BLOCOS.soja, scriptBackfill: "backfill:usda-grain-stocks-soja" }
};
// O CSV começa na edição de 2001-06-29; antes só TXT/PDF.
const DATA_INICIAL = "2001-06-01";
const TIMEOUT_MS = 5 * 60 * 1000;

// Coleta diária: a edição mais recente (sai uma por trimestre; as já gravadas são descartadas no persist).
async function download({ signal, fetchFn, esperar } = {}) {
  const edicoes = await listarEdicoes(PUBLICACAO, { maxEdicoes: 1, signal, fetchFn, esperar });
  return baixarEdicoes(edicoes, { signal, fetchFn, esperar });
}

// Backfill: todas as edições com ZIP, de `dataInicial` em diante.
async function downloadIntervalo({ dataInicial = DATA_INICIAL, signal, fetchFn, esperar } = {}) {
  const edicoes = await listarEdicoes(PUBLICACAO, { desde: dataInicial, signal, fetchFn, esperar });
  return baixarEdicoes(edicoes, { signal, fetchFn, esperar });
}

function persistir(cultura, validos, contexto, deps, exigirCargaInicial) {
  const mensagemSemCarga = ({ valores }) =>
    `Carga histórica do Grain Stocks (USDA, ${cultura.bloco.nome}) ainda não feita (${valores} valores não gravados): rode "npm run ${cultura.scriptBackfill}" antes da coleta diária.`;
  return persistirPorEdicao(validos, contexto, deps, { sourceCode: cultura.sourceCode, exigirCargaInicial, mensagemSemCarga });
}

// Cada edição vira { data, slug, arquivo, outroRelatorio | dataLiberacao, titulo, valores | erro }. Falha ao ler
// UMA edição não aborta as demais.
function parse(cultura, rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do ESMIS em formato inesperado (esperava uma lista de edições).");
  }
  return rawData.map((item) => {
    const base = { data: item.data, slug: item.slug, arquivo: item.arquivo || null };
    if (item.semArquivo) return { ...base, erro: "A edição não tem o arquivo ZIP (CSV) no ESMIS." };
    try {
      const csv = csvDaEdicao(item.buffer);
      if (ehOutroRelatorio(csv)) return { ...base, outroRelatorio: true };
      return { ...base, ...extrairEstoques(csv, cultura.bloco) };
    } catch (err) {
      return { ...base, erro: `Falha ao ler o CSV: ${err.message}` };
    }
  });
}

function normalize(cultura, edicoes) {
  const validos = [];
  const invalidos = [];
  const avisos = [];

  for (const edicao of edicoes) {
    const ident = `Grain Stocks ${edicao.data} (${edicao.arquivo || edicao.slug})`;
    if (edicao.outroRelatorio) {
      avisos.push({ item: { edicao: ident }, motivo: "A listagem do Grain Stocks traz um arquivo de outro relatório nesta data (defeito conhecido da fonte): ignorado." });
      continue;
    }
    if (edicao.erro) {
      invalidos.push({ item: { edicao: ident }, motivo: edicao.erro });
      continue;
    }
    // Barra um arquivo trocado: a data de dentro do CSV é a do release.
    if (edicao.dataLiberacao !== edicao.data) {
      invalidos.push({ item: { edicao: ident }, motivo: `data do CSV (${edicao.dataLiberacao || "ausente"}) não confere com a do release (${edicao.data}).` });
      continue;
    }

    for (const { observedAt, posicao, valor, revisado } of edicao.valores) {
      validos.push({
        series_code: `${cultura.prefixoSerie}.${posicao}`,
        observed_at: observedAt,
        value: valor,
        unit: "mil bu",
        source_code: cultura.sourceCode,
        published_at: fimDoDiaUtc(edicao.data),
        published_at_is_estimated: false,
        published_at_basis: "source",
        metadata: {
          fonte: "USDA NASS (ESMIS)",
          produto: cultura.bloco.nome,
          relatorio: "Grain Stocks",
          posicao,
          dataRelease: edicao.data,
          arquivo: edicao.arquivo,
          ...(revisado && { marcadoComoRevisado: true })
        }
      });
    }
  }

  // Ordem cronológica: o serviço point-in-time compara com a última versão de cada série.
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos, avisos };
}

// Coletor de um grão de CULTURAS ("milho", "soja").
function criarColetorGrainStocks(chave) {
  const cultura = CULTURAS[chave];
  if (!cultura) throw new Error(`Grão do Grain Stocks desconhecido: ${chave} (conhecidos: ${Object.keys(CULTURAS).join(", ")}).`);
  return {
    codigo: cultura.codigo,
    timeoutMs: TIMEOUT_MS,
    get tentativasRetry() {
      return env.collectors.retryTentativas;
    },
    download,
    downloadIntervalo,
    parse: (rawData) => parse(cultura, rawData),
    normalize: (edicoes) => normalize(cultura, edicoes),
    persist: (validos, contexto, deps = {}) => persistir(cultura, validos, contexto, deps, true),
    persistirBackfill: (validos, contexto, deps = {}) => persistir(cultura, validos, contexto, deps, false),
    SOURCE_CODE: cultura.sourceCode,
    PREFIXO_SERIE: cultura.prefixoSerie
  };
}

// O módulo continua sendo o coletor do milho (o de antes), com a fábrica ao lado.
// (Object.assign sobre o próprio coletor preserva o getter de retentativas.)
module.exports = Object.assign(criarColetorGrainStocks("milho"), { criarColetorGrainStocks, CULTURAS, DATA_INICIAL });
