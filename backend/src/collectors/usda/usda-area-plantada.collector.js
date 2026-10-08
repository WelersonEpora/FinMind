"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { lerZip } = require("../../shared/utils/zip");
const { persistirPorEdicao } = require("../base/persist-observations");
const { extrairAreaPlantada, CULTURAS: TABELAS } = require("./usda-area-plantada.parser");

// USDA NASS - área plantada de milho (e, desde 2026-10-08, de soja: fase 1 da soja, só aquisição, ADR 0112) dos EUA,
// pelo Prospective Plantings (fim de março: a INTENÇÃO de plantio)
// e pelo Acreage (fim de junho: a área já plantada), lida do CSV de cada edição publicada no ESMIS. ADR 0027.
//
// POR QUE O ESMIS E NÃO A API DO QUICKSTATS (a do Crop Progress): o QuickStats guarda uma linha por
// estimativa, mas o `load_time` não é a data de publicação no histórico (as de março de 2012 a 2017 foram
// carregadas juntas em 23/01/2018), a de junho só existe desde 2018 e o valor de cada ano é sobrescrito a cada
// revisão. O ESMIS guarda cada edição como saiu, com a data do release: é o vintage real.
//
// POR QUE ESTE DADO (o WASDE já tem a área plantada): o WASDE só abre a safra nova em maio. Em 2026 o USDA
// publicou a intenção de plantio em 31/03 e o nosso WASDE só a trouxe em 12/05; o Acreage de 30/06 só entra no
// WASDE de ~10/07. Nas duas janelas o mercado já precificou um número que o FinMind não via.
//
// VERIFICADO POR CHAMADA REAL em 2026-09-28 (ver o ADR):
//   - `/publication/prospective-plantings` e `/publication/acreage` listam 10 edições por página, cada uma com a
//     DATA do release (`<time datetime>`) e os links de PDF/TXT/ZIP. É HTML: não há API confirmada. As
//     linhas do topo se repetem em toda página.
//   - O ZIP (com um CSV por tabela e um `*_all*.csv`) existe desde 2001-06-29 (Acreage) e 2002-03-28
//     (Prospective Plantings): 26 + 25 edições. Antes disso só TXT/PDF, fora do escopo (como no WASDE).
//   - As 51 lidas sem erro; a data de dentro do CSV ("Released March 31, 2026") igual à da listagem nas 51; os
//     valores do ano da edição iguais aos do QuickStats nas 15 de março (2012-2026) e nas 9 de junho (2018-2026).
//
// SÉRIE: uma só, `USDA.CORN.AREA_PLANTED` (mil acres, como publicado). observed_at = 1º/set do ano do plantio
// (a mesma convenção do WASDE: safra 2026/27 -> 2026-09-01), para ficar lado a lado com `WASDE.MILHO.EUA.AREA_PLANTED`.
// Cada edição traz o ano da edição e 1 ou 2 anos anteriores, com o valor que o USDA tinha naquele dia: cada um é
// uma versão. As estimativas de agosto a janeiro (Crop Production) NÃO estão aqui: chegam no mesmo dia pelo WASDE.
//
// published_at: a data do release é REAL (vem da listagem e confere com o CSV). O horário não: o relatório sai
// ao meio-dia de Washington, e aqui vale o FIM DO DIA em UTC (conservador, como no WASDE).

const BASE_URL = "https://esmis.nal.usda.gov";
// Um coletor por cultura, com as mesmas edições: a soja tem fonte própria (o descarte das edições já ingeridas olha a
// fonte; ver o WASDE, ADR 0111) e a série no prefixo do Crop Progress dela.
const CULTURAS = {
  milho: { codigo: "usda-area-plantada-milho", sourceCode: "USDA_NASS_AREA", serie: "USDA.CORN.AREA_PLANTED", tabela: TABELAS.milho, scriptBackfill: "backfill:usda-area-plantada" },
  soja: { codigo: "usda-area-plantada-soja", sourceCode: "USDA_NASS_AREA_SOJA", serie: "USDA.SOYBEANS.AREA_PLANTED", tabela: TABELAS.soja, scriptBackfill: "backfill:usda-area-plantada-soja" }
};
// O CSV começa no Acreage de 2001-06-29; o Prospective Plantings de 2001-03-30 ainda é só TXT/PDF.
const DATA_INICIAL = "2001-06-01";
const PUBLICACOES = {
  "prospective-plantings": { nome: "Prospective Plantings", mes: 3 },
  acreage: { nome: "Acreage", mes: 6 }
};
const PAUSA_MS = 1_000;
const MAX_PAGINAS = 20;
const TIMEOUT_MS = 5 * 60 * 1000;
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------- listagem (HTML)

// Uma página da listagem -> edições { publicacao, data, slug, caminhoZip }. As linhas do topo que se repetem
// em todas as páginas também têm o link da edição, então a deduplicação é por slug (em `listarEdicoes`).
function extrairEdicoesDaPagina(html, publicacao) {
  const edicoes = [];
  const reSlug = new RegExp(`/publication/${publicacao}/([0-9a-z-]+)`);
  for (const m of html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)) {
    const linha = m[0];
    const data = /datetime="(\d{4}-\d{2}-\d{2})/.exec(linha)?.[1];
    const slug = reSlug.exec(linha)?.[1];
    if (!data || !slug) continue;
    const caminhoZip = /href="(\/sites\/default\/release-files\/[A-Za-z0-9/]+\/[^"/]+\.zip)"/i.exec(linha)?.[1] || null;
    edicoes.push({ publicacao, data, slug, caminhoZip });
  }
  return edicoes;
}

// Duas ou mais edições na MESMA data (republicação: slug `-0`, `-1`): vale a ÚLTIMA, como no WASDE. O
// Grain Stocks de 2025-09-30 aparece três vezes na listagem, com arquivos idênticos.
function ordemNaData(slug) {
  const m = /^\d{4}-\d{2}-\d{2}(?:-(\d+))?$/.exec(slug);
  return m?.[1] === undefined ? -1 : Number(m[1]);
}

function escolherUmaPorData(edicoes) {
  const porData = new Map();
  for (const e of edicoes) {
    const chave = `${e.publicacao}|${e.data}`;
    const atual = porData.get(chave);
    if (!atual || ordemNaData(e.slug) > ordemNaData(atual.slug)) porData.set(chave, e);
  }
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}

async function buscar(url, { signal, fetchFn = fetch }) {
  let response;
  try {
    response = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
  }
  if (!response.ok) {
    throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status} (${new URL(url).pathname}).`);
  }
  return response;
}

// Percorre as páginas de UMA publicação (da mais nova para a mais antiga) até passar de `desde`, até não
// aparecer edição nova ou até `maxEdicoes` (a coleta diária usa 1).
async function listarEdicoes(publicacao, { desde = DATA_INICIAL, maxEdicoes = Infinity, signal, fetchFn = fetch, esperar = aguardar } = {}) {
  const porSlug = new Map();
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    if (pagina > 0) await esperar(PAUSA_MS);
    const response = await buscar(`${BASE_URL}/publication/${publicacao}?page=${pagina}`, { signal, fetchFn });
    const doHtml = extrairEdicoesDaPagina(await response.text(), publicacao);
    const novas = doHtml.filter((e) => !porSlug.has(e.slug));
    if (novas.length === 0) break;
    for (const e of novas) porSlug.set(e.slug, e);

    const maisAntiga = doHtml.reduce((min, e) => (e.data < min ? e.data : min), "9999-12-31");
    if (maisAntiga < desde) break;
    if (escolherUmaPorData([...porSlug.values()]).length >= maxEdicoes) break;
  }
  const edicoes = escolherUmaPorData([...porSlug.values()].filter((e) => e.data >= desde));
  return Number.isFinite(maxEdicoes) ? edicoes.slice(-maxEdicoes) : edicoes;
}

// ---------------------------------------------------------------- download (ZIP)

// Edições em sequência, com pausa entre os downloads. Uma edição sem ZIP entra como item com `semArquivo`
// (vira inválido no normalize, não derruba o lote).
async function baixarEdicoes(edicoes, { signal, fetchFn = fetch, esperar = aguardar } = {}) {
  const baixadas = [];
  for (const [i, edicao] of edicoes.entries()) {
    if (!edicao.caminhoZip) {
      baixadas.push({ ...edicao, semArquivo: true });
      continue;
    }
    if (i > 0) await esperar(PAUSA_MS);
    const response = await buscar(`${BASE_URL}${edicao.caminhoZip}`, { signal, fetchFn });
    baixadas.push({ ...edicao, arquivo: edicao.caminhoZip.split("/").pop(), buffer: Buffer.from(await response.arrayBuffer()) });
  }
  return baixadas;
}

// As edições das duas publicações, juntas e em ordem de data.
async function listarTodas(opcoes) {
  const edicoes = [];
  for (const [i, publicacao] of Object.keys(PUBLICACOES).entries()) {
    if (i > 0) await (opcoes.esperar || aguardar)(PAUSA_MS);
    edicoes.push(...(await listarEdicoes(publicacao, opcoes)));
  }
  return edicoes.sort((a, b) => a.data.localeCompare(b.data));
}

// Coleta diária: a edição mais recente de cada publicação (sai uma por ano de cada; as já gravadas são
// descartadas no persist).
async function download({ signal, fetchFn, esperar } = {}) {
  const edicoes = await listarTodas({ maxEdicoes: 1, signal, fetchFn, esperar });
  return baixarEdicoes(edicoes, { signal, fetchFn, esperar });
}

// Backfill: todas as edições com ZIP, de `dataInicial` em diante.
async function downloadIntervalo({ dataInicial = DATA_INICIAL, signal, fetchFn, esperar } = {}) {
  const edicoes = await listarTodas({ desde: dataInicial, signal, fetchFn, esperar });
  return baixarEdicoes(edicoes, { signal, fetchFn, esperar });
}

// ---------------------------------------------------------------- persist

function persistir(cultura, validos, contexto, deps, exigirCargaInicial) {
  const mensagemSemCarga = ({ valores }) =>
    `Carga histórica da área plantada (USDA, ${cultura.tabela.nome}) ainda não feita (${valores} valores não gravados): rode "npm run ${cultura.scriptBackfill}" antes da coleta diária.`;
  return persistirPorEdicao(validos, contexto, deps, { sourceCode: cultura.sourceCode, exigirCargaInicial, mensagemSemCarga });
}

// ---------------------------------------------------------------- parse / normalize

// O CSV com todas as tabelas (`pspl_all_tables.csv`, `acrg_all.csv`, `ACRG_ALL.CSV`...).
function csvDaEdicao(buffer) {
  const csv = lerZip(buffer).find((e) => /_all[^/]*\.csv$/i.test(e.nome));
  if (!csv) throw new Error("o ZIP não tem o CSV com todas as tabelas (*_all*.csv).");
  return csv.conteudo.toString("latin1");
}

// Cada edição vira { publicacao, data, slug, arquivo, dataLiberacao, titulo, valores, erro }. Falha ao ler UMA
// edição não aborta as demais.
function parse(cultura, rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do ESMIS em formato inesperado (esperava uma lista de edições).");
  }
  return rawData.map((item) => {
    const base = { publicacao: item.publicacao, data: item.data, slug: item.slug, arquivo: item.arquivo || null };
    if (item.semArquivo) return { ...base, erro: "A edição não tem o arquivo ZIP (CSV) no ESMIS." };
    try {
      return { ...base, ...extrairAreaPlantada(csvDaEdicao(item.buffer), cultura.tabela) };
    } catch (err) {
      return { ...base, erro: `Falha ao ler o CSV: ${err.message}` };
    }
  });
}

// Barra um arquivo trocado: a data de dentro do CSV é a do release, o mês é o da publicação e os anos são o
// da edição e, no máximo, os dois anteriores.
function conferirEdicao(edicao) {
  const publicacao = PUBLICACOES[edicao.publicacao];
  if (!publicacao) return `publicação desconhecida: ${edicao.publicacao}.`;
  if (edicao.dataLiberacao !== edicao.data) return `data do CSV (${edicao.dataLiberacao || "ausente"}) não confere com a do release (${edicao.data}).`;
  const [ano, mes] = edicao.data.split("-").map(Number);
  if (mes !== publicacao.mes) return `${publicacao.nome} fora do mês esperado (${edicao.data}).`;
  const anos = edicao.valores.map((v) => v.ano);
  if (!anos.includes(ano) || anos.some((a) => a > ano || a < ano - 2)) return `anos inesperados na tabela (${anos.join(", ")}) para a edição de ${ano}.`;
  return null;
}

function normalize(cultura, edicoes) {
  const validos = [];
  const invalidos = [];

  for (const edicao of edicoes) {
    const nome = PUBLICACOES[edicao.publicacao]?.nome || edicao.publicacao;
    const ident = `${nome} ${edicao.data} (${edicao.arquivo || edicao.slug})`;
    if (edicao.erro) {
      invalidos.push({ item: { edicao: ident }, motivo: edicao.erro });
      continue;
    }
    const problema = conferirEdicao(edicao);
    if (problema) {
      invalidos.push({ item: { edicao: ident }, motivo: problema });
      continue;
    }

    const anoDaEdicao = Number(edicao.data.slice(0, 4));
    for (const { ano, valor } of edicao.valores) {
      validos.push({
        series_code: cultura.serie,
        observed_at: `${ano}-09-01`,
        value: valor,
        unit: "mil acres",
        source_code: cultura.sourceCode,
        published_at: fimDoDiaUtc(edicao.data),
        published_at_is_estimated: false,
        published_at_basis: "source",
        metadata: {
          fonte: "USDA NASS (ESMIS)",
          produto: cultura.tabela.nome,
          relatorio: nome,
          anoPlantio: ano,
          // Intenção de plantio só no ano da edição do Prospective Plantings; o resto é área plantada estimada.
          tipoEstimativa: edicao.publicacao === "prospective-plantings" && ano === anoDaEdicao ? "intencao" : "plantada",
          dataRelease: edicao.data,
          arquivo: edicao.arquivo,
          tabela: edicao.titulo
        }
      });
    }
  }

  // Ordem cronológica: o serviço point-in-time compara com a última versão de cada série, então uma edição
  // nunca pode entrar antes da anterior.
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos };
}

// Coletor de uma cultura de CULTURAS ("milho", "soja").
function criarColetorAreaPlantada(chave) {
  const cultura = CULTURAS[chave];
  if (!cultura) throw new Error(`Cultura da área plantada desconhecida: ${chave} (conhecidas: ${Object.keys(CULTURAS).join(", ")}).`);
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
    SERIE: cultura.serie
  };
}

// O módulo continua sendo o coletor do milho (o de antes), com a fábrica ao lado.
// (Object.assign sobre o próprio coletor preserva o getter de retentativas.)
module.exports = Object.assign(criarColetorAreaPlantada("milho"), {
  criarColetorAreaPlantada,
  CULTURAS,
  extrairEdicoesDaPagina,
  escolherUmaPorData,
  listarEdicoes,
  baixarEdicoes,
  conferirEdicao,
  csvDaEdicao,
  DATA_INICIAL,
  PAUSA_MS
});
