"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirPorEdicao } = require("../base/persist-observations");
const { extrairDatasDaPagina } = require("./conab-milho.collector");
const { lerPlanilha, extrairLevantamento } = require("./conab-cafe.parser");

// Conab - Boletim da Safra de Café: produção, área em produção e produtividade por região, UF e sub-região,
// em total, arábica e conilon. ~4 levantamentos por safra (jan, mai, set, dez), lidos da planilha XLS de cada
// um. ADR 0029.
//
// Cada levantamento reestima a safra corrente: é o vintage. O `published_at` é REAL e vem da página do
// levantamento ("Publicado em 24/09/2026 09h00", horário de Brasília), conferido contra a nota da própria
// planilha ("Estimativa em setembro/2026").
//
// VERIFICADO POR CHAMADA REAL em 2026-09-28 (ver o ADR):
//   - As páginas seguem o padrão `.../safra-de-cafe/<n>o-levantamento-de-cafe-safra-<ano>/<o mesmo>`. O índice
//     da Conab só linka as de 2026, mas as de 2023 a 2025 continuam no ar: o coletor monta a URL de cada
//     levantamento (1º a 4º) de cada ano, e 404 é "ainda não publicado". Antes de 2023, tudo 404.
//   - A planilha é linkada no conteúdo da página, com extensão (`site_previsao-de-safra-cafe-set-2026.xls`, 2026)
//     ou sem (`tabela-de-dados-estimativas-da-producao-e-colheita`, 2023-2025); nos dois casos é XLS antigo.
//   - 15 levantamentos, de jan/2023 a set/2026, lidos sem erro. Em 14 a data da página confere com a nota da
//     planilha. No 1º de 2024 a página diz "Publicado em 24/01/2025" e a nota "janeiro/2024": a página foi
//     republicada. Nesse caso a data de publicação é ESTIMADA como o fim do mês da nota (conservador: nunca antes
//     da publicação real) e o motivo fica no metadata.
//   - O 4º levantamento de 2024 saiu em jan/2025 (página e nota concordam), no mesmo mês do 1º de 2025.

const URL_BASE = "https://www.gov.br/conab/pt-br/atuacao/informacoes-agropecuarias/safras/safra-de-cafe";
const SOURCE_CODE = "CONAB_LEVANTAMENTO_CAFE";
const ANO_INICIAL = 2023;
const LEVANTAMENTOS_POR_ANO = 4;
const PAUSA_MS = 1_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const TAMANHO_MINIMO_XLS = 100_000;
// XLS antigo (OLE2/Compound File): D0 CF 11 E0.
const ASSINATURA_XLS = "d0cf11e0";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
const HORAS_BRASILIA_ATE_UTC = 3;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 404 = página ou arquivo inexistente (devolve null); outro erro HTTP ou de rede falha a coleta.
async function buscar(url, { signal, fetchFn = fetch, aceitar404 = false }) {
  let response;
  try {
    response = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
  }
  if (aceitar404 && response.status === 404) return null;
  if (!response.ok) {
    throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status} (${new URL(url).pathname}).`);
  }
  return response;
}

// ---------------------------------------------------------------- páginas (HTML)

function levantamento(ano, numero) {
  const slug = `${numero}o-levantamento-de-cafe-safra-${ano}`;
  return { ano, numero, slug, urlPagina: `${URL_BASE}/${slug}/${slug}` };
}

// Link da planilha no conteúdo da página: dentro da pasta do levantamento, com extensão .xls ou o nome
// "tabela-de-dados..." (sem extensão). null se a página não linka planilha.
function extrairLinkPlanilha(html, slug) {
  const inicio = html.indexOf('id="content-core"');
  const conteudo = inicio >= 0 ? html.slice(inicio) : html;
  for (const m of conteudo.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (!href.includes(`/${slug}/`)) continue;
    if (/\.xlsx?$/i.test(href) || /\/tabela-de-dados[^/]*$/i.test(href)) return href;
  }
  return null;
}

// ---------------------------------------------------------------- download

// Um levantamento -> { ...levantamento, publicadoEm, atualizadoEm, arquivo, buffer } ou null (ainda não publicado).
async function baixarLevantamento(lev, { signal, fetchFn = fetch, tamanhoMinimo = TAMANHO_MINIMO_XLS } = {}) {
  const pagina = await buscar(lev.urlPagina, { signal, fetchFn, aceitar404: true });
  if (!pagina) return null;
  const html = await pagina.text();
  const urlPlanilha = extrairLinkPlanilha(html, lev.slug);
  if (!urlPlanilha) throw new UpstreamServiceError(`A página do ${lev.numero}º levantamento de ${lev.ano} não linka a planilha (a página mudou?).`);

  const resposta = await buscar(urlPlanilha, { signal, fetchFn });
  const buffer = Buffer.from(await resposta.arrayBuffer());
  // Guarda contra uma página de erro HTML servida no lugar da planilha.
  if (buffer.length < tamanhoMinimo || buffer.subarray(0, 4).toString("hex") !== ASSINATURA_XLS) {
    throw new UpstreamServiceError(`O arquivo do ${lev.numero}º levantamento de ${lev.ano} não parece uma planilha XLS (${buffer.length} bytes).`);
  }
  return { ...lev, ...extrairDatasDaPagina(html), urlPlanilha, arquivo: urlPlanilha.split("/").pop(), buffer };
}

// Levantamentos de `anos`, em ordem; os ainda não publicados (404) ficam de fora.
async function baixarAnos(anos, { signal, fetchFn = fetch, esperar = aguardar, tamanhoMinimo } = {}) {
  const baixados = [];
  let primeiro = true;
  for (const ano of anos) {
    for (let numero = 1; numero <= LEVANTAMENTOS_POR_ANO; numero += 1) {
      if (!primeiro) await esperar(PAUSA_MS);
      primeiro = false;
      const item = await baixarLevantamento(levantamento(ano, numero), { signal, fetchFn, tamanhoMinimo });
      if (item) baixados.push(item);
    }
  }
  return baixados;
}

function anosAte(anoInicial, anoFinal) {
  const anos = [];
  for (let ano = anoInicial; ano <= anoFinal; ano += 1) anos.push(ano);
  return anos;
}

// Coleta diária: a safra corrente e a anterior (o 4º levantamento de uma safra pode sair em janeiro do ano
// seguinte). São 8 páginas; o que já foi gravado a persistência descarta.
function download({ signal, fetchFn, esperar } = {}) {
  const anoAtual = new Date().getUTCFullYear();
  return baixarAnos([anoAtual - 1, anoAtual], { signal, fetchFn, esperar });
}

// Backfill: todos os levantamentos desde 2023 (o 1º ano com página).
function downloadTodos({ signal, fetchFn, esperar } = {}) {
  return baixarAnos(anosAte(ANO_INICIAL, new Date().getUTCFullYear()), { signal, fetchFn, esperar });
}

// ---------------------------------------------------------------- persist

const mensagemSemCarga = ({ series, valores }) =>
  `Carga histórica do café da Conab ainda não feita para ${series} série(s) (${valores} valores não gravados): rode "npm run backfill:conab-cafe" antes da coleta diária.`;

const persist = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: true, mensagemSemCarga });
const persistirBackfill = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: false, mensagemSemCarga });

// ---------------------------------------------------------------- parse / normalize

function identificar(lev) {
  return `${lev.numero}º levantamento safra ${lev.ano}`;
}

// Cada levantamento vira { ...levantamento, observacoes, invalidos, estimativa } ou { ..., erro }. Falha ao ler
// UMA planilha não aborta as demais.
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta da Conab em formato inesperado (esperava uma lista de levantamentos).");
  }
  return rawData.map((item) => {
    const { buffer, ...base } = item;
    try {
      return { ...base, ...extrairLevantamento(lerPlanilha(buffer)) };
    } catch (err) {
      return { ...base, erro: `Falha ao ler a planilha: ${err.message}` };
    }
  });
}

function mesEmBrasilia(instante) {
  const local = new Date(instante.getTime() - HORAS_BRASILIA_ATE_UTC * 3_600_000);
  return { mes: local.getUTCMonth() + 1, ano: local.getUTCFullYear() };
}

// Último instante do mês em Brasília (23:59:59 do último dia), em UTC.
function fimDoMesEmBrasilia({ mes, ano }) {
  return new Date(Date.UTC(ano, mes, 1, HORAS_BRASILIA_ATE_UTC) - 1000);
}

// Data de publicação de um levantamento: a da página, se ela cai no mês da nota da planilha; se não (página
// republicada), ESTIMADA no fim do mês da nota. Devolve { publishedAt, estimado, motivo } ou { erro }.
function decidirPublicacao(lev) {
  if (!lev.estimativa) return { erro: 'A planilha não traz a nota "Estimativa em <mês>/<ano>" (sem como conferir a data).' };
  if (lev.publicadoEm) {
    const pagina = mesEmBrasilia(lev.publicadoEm);
    if (pagina.mes === lev.estimativa.mes && pagina.ano === lev.estimativa.ano) {
      return { publishedAt: lev.publicadoEm, estimado: false, motivo: null };
    }
  }
  return {
    publishedAt: fimDoMesEmBrasilia(lev.estimativa),
    estimado: true,
    motivo: lev.publicadoEm
      ? `A página diz "Publicado em" ${lev.publicadoEm.toISOString()}, fora do mês da nota da planilha (${lev.estimativa.mes}/${lev.estimativa.ano}): página republicada.`
      : 'A página não informa "Publicado em".'
  };
}

function normalize(levantamentos) {
  const validos = [];
  const invalidos = [];

  for (const lev of levantamentos) {
    const ident = { levantamento: identificar(lev), arquivo: lev.arquivo };
    if (lev.erro) {
      invalidos.push({ item: ident, motivo: lev.erro });
      continue;
    }
    const publicacao = decidirPublicacao(lev);
    if (publicacao.erro) {
      invalidos.push({ item: ident, motivo: publicacao.erro });
      continue;
    }
    for (const motivo of lev.invalidos) invalidos.push({ item: ident, motivo: motivo.motivo });

    for (const o of lev.observacoes) {
      validos.push({
        series_code: o.seriesCode,
        observed_at: o.observedAt,
        value: o.valor,
        unit: o.unidade,
        source_code: SOURCE_CODE,
        published_at: publicacao.publishedAt,
        published_at_is_estimated: publicacao.estimado,
        published_at_basis: publicacao.estimado ? "lag_rule" : "source",
        metadata: {
          fonte: "Conab - Boletim da Safra de Café",
          produto: "café",
          tipo: o.tipo,
          regiao: o.regiao,
          metrica: o.metrica,
          safra: o.safra,
          levantamento: ident.levantamento,
          arquivo: lev.arquivo,
          mesDaEstimativa: `${lev.estimativa.ano}-${String(lev.estimativa.mes).padStart(2, "0")}`,
          paginaPublicadaEm: lev.publicadoEm ? lev.publicadoEm.toISOString() : null,
          paginaAtualizadaEm: lev.atualizadoEm ? lev.atualizadoEm.toISOString() : null,
          ...(o.unidadeOriginal && { unidadeOriginal: o.unidadeOriginal }),
          ...(publicacao.motivo && { motivoPublicacaoEstimada: publicacao.motivo })
        }
      });
    }
  }

  // Ordem cronológica: o serviço point-in-time compara cada valor com a última versão da série.
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos };
}

module.exports = {
  codigo: "conab-cafe",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadTodos,
  parse,
  normalize,
  persist,
  persistirBackfill,
  extrairLinkPlanilha,
  baixarAnos,
  decidirPublicacao,
  fimDoMesEmBrasilia,
  SOURCE_CODE,
  ANO_INICIAL
};
