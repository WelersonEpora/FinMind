"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirPorEdicao } = require("../base/persist-observations");
const { lerPlanilha, extrairLevantamento } = require("./conab-milho.parser");

// Conab - Boletim da Safra de Grãos: milho por safra (1ª, 2ª, 3ª e total), por Região/UF, e balanço de
// oferta e demanda (estoque, consumo, importação, exportação). Um levantamento por mês, lido da planilha
// XLSX de cada levantamento. ADR 0017.
//
// Cada levantamento é uma nova estimativa da mesma safra: é o vintage. O `published_at` é REAL e vem da
// própria página do levantamento ("Publicado em 15/09/2026 09h00", horário de Brasília).
//
// VERIFICADO POR CHAMADA REAL em 2026-09-21 (ver o ADR):
//   - O índice `.../safra-de-graos/boletim-da-safra-de-graos` linka as planilhas
//     `<n>o-levantamento-safra-<AAAA-AA>/site_previsao_de_safra-por_produto-<mês>-<ano>.xlsx` (15 no
//     total, de fev/2025 a set/2026; as demais páginas de levantamento não têm planilha).
//   - A página de cada levantamento (`<n>o-levantamento-safra-.../<n>o-levantamento-safra-...`) traz
//     "Publicado em" e "Atualizado em". As 15 têm a data de publicação.
//   - As 15 planilhas têm o mesmo layout (parser lido sem erro em todas).
//
// LIMITES conhecidos:
//   - A planilha baixada é a versão ATUAL do levantamento: várias páginas foram "atualizadas" meses depois
//     da publicação. O `published_at` é o da publicação original; a data de atualização vai no metadata
//     (`paginaAtualizadaEm`) para quem precisar avaliar se houve correção.
//   - Republicação com correção do MESMO levantamento mantém a 1ª versão gravada (o modelo append-only não
//     guarda duas versões no mesmo `published_at`), como no WASDE.

const URL_INDICE = "https://www.gov.br/conab/pt-br/atuacao/informacoes-agropecuarias/safras/safra-de-graos/boletim-da-safra-de-graos";
const SOURCE_CODE = "CONAB_LEVANTAMENTO_SAFRAS";
const PAUSA_MS = 1_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const TAMANHO_MINIMO_XLSX = 200_000;
const ASSINATURA_ZIP = "PK";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019).
const HORAS_BRASILIA_ATE_UTC = 3;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ---------------------------------------------------------------- índice e página (HTML)

// Índice -> levantamentos com planilha, do mais antigo ao mais novo:
// { numero, safraInicio, safra, urlXlsx, urlPagina, arquivo }.
function extrairLevantamentosDoIndice(html, base = URL_INDICE) {
  const porUrl = new Map();
  for (const m of html.matchAll(/href="([^"]+\/(\d+)o-levantamento-safra-(\d{4})-(\d{2})\/([^"/]*por_produto[^"/]*\.xlsx))"/gi)) {
    const urlXlsx = new URL(m[1], base).href;
    if (porUrl.has(urlXlsx)) continue;
    const pasta = urlXlsx.slice(0, urlXlsx.lastIndexOf("/"));
    porUrl.set(urlXlsx, {
      numero: Number(m[2]),
      safraInicio: Number(m[3]),
      safra: `${m[3]}/${m[4]}`,
      urlXlsx,
      urlPagina: `${pasta}/${pasta.split("/").pop()}`,
      arquivo: m[5]
    });
  }
  return [...porUrl.values()].sort((a, b) => a.safraInicio - b.safraInicio || a.numero - b.numero);
}

// "Publicado em 15/09/2026 09h00" (horário de Brasília) -> Date em UTC. null se o texto não aparece.
function lerDataDaPagina(textoDaPagina, rotulo) {
  const m = new RegExp(`${rotulo} em (\\d{2})/(\\d{2})/(\\d{4}) (\\d{2})h(\\d{2})`).exec(textoDaPagina);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]) + HORAS_BRASILIA_ATE_UTC, Number(m[5])));
}

function extrairDatasDaPagina(html) {
  const textoDaPagina = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  return { publicadoEm: lerDataDaPagina(textoDaPagina, "Publicado"), atualizadoEm: lerDataDaPagina(textoDaPagina, "Atualizado") };
}

// ---------------------------------------------------------------- download

async function baixarLevantamento(levantamento, { signal, fetchFn = fetch } = {}) {
  const pagina = await buscar(levantamento.urlPagina, { signal, fetchFn });
  const datas = extrairDatasDaPagina(await pagina.text());

  const resposta = await buscar(levantamento.urlXlsx, { signal, fetchFn });
  const buffer = Buffer.from(await resposta.arrayBuffer());
  // Guarda contra uma página de erro HTML salva como .xlsx: o XLSX é um ZIP (assinatura "PK").
  if (buffer.length < TAMANHO_MINIMO_XLSX || buffer.subarray(0, 2).toString("latin1") !== ASSINATURA_ZIP) {
    throw new UpstreamServiceError(`O arquivo ${levantamento.arquivo} não parece uma planilha XLSX (${buffer.length} bytes).`);
  }
  return { ...levantamento, ...datas, buffer };
}

async function baixarLevantamentos(levantamentos, { signal, fetchFn = fetch, esperar = aguardar } = {}) {
  const baixados = [];
  for (const [i, levantamento] of levantamentos.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    baixados.push(await baixarLevantamento(levantamento, { signal, fetchFn }));
  }
  return baixados;
}

async function listarLevantamentos({ signal, fetchFn = fetch } = {}) {
  const resposta = await buscar(URL_INDICE, { signal, fetchFn });
  const levantamentos = extrairLevantamentosDoIndice(await resposta.text());
  if (levantamentos.length === 0) {
    throw new UpstreamServiceError("O índice da Conab não trouxe nenhuma planilha de levantamento (a página mudou?).");
  }
  return levantamentos;
}

// Coleta diária: só o levantamento mais recente (1 página + 1 planilha de ~1 MB). O levantamento é mensal, então
// na maioria dos dias ele já está gravado e a persistência o descarta.
async function download({ signal, fetchFn, esperar } = {}) {
  const levantamentos = await listarLevantamentos({ signal, fetchFn });
  return baixarLevantamentos(levantamentos.slice(-1), { signal, fetchFn, esperar });
}

// Backfill: todos os levantamentos que o índice ainda mantém, do mais antigo ao mais novo.
async function downloadTodos({ signal, fetchFn, esperar } = {}) {
  const levantamentos = await listarLevantamentos({ signal, fetchFn });
  return baixarLevantamentos(levantamentos, { signal, fetchFn, esperar });
}

// ---------------------------------------------------------------- persist

const mensagemSemCarga = ({ series, valores }) =>
  `Carga histórica da Conab ainda não feita para ${series} série(s) (${valores} valores não gravados): rode "npm run backfill:conab-milho" antes da coleta diária.`;

const persist = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: true, mensagemSemCarga });
const persistirBackfill = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: false, mensagemSemCarga });

// ---------------------------------------------------------------- parse / normalize

function identificar(levantamento) {
  return `${levantamento.numero}º levantamento safra ${levantamento.safra}`;
}

// Cada levantamento vira { ...levantamento, observacoes, invalidos, estimativa, mesBalanco, erro }. Falha ao
// ler UMA planilha não aborta as demais.
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

// Mês e ano em Brasília de um instante em UTC.
function mesEmBrasilia(instante) {
  const local = new Date(instante.getTime() - HORAS_BRASILIA_ATE_UTC * 3_600_000);
  return { mes: local.getUTCMonth() + 1, ano: local.getUTCFullYear() };
}

// O mês do balanço e a nota "Estimativa em <mês>/<ano>" da planilha têm de ser o mês da publicação: barra
// um arquivo trocado ou uma página com a data errada. Devolve o motivo do erro ou null.
function conferirMes(levantamento) {
  const publicacao = mesEmBrasilia(levantamento.publicadoEm);
  for (const [nome, mes] of [["do balanço", levantamento.mesBalanco], ["da nota de estimativa", levantamento.estimativa]]) {
    if (mes && (mes.mes !== publicacao.mes || mes.ano !== publicacao.ano)) {
      return `O mês ${nome} (${mes.mes}/${mes.ano}) não confere com a publicação (${publicacao.mes}/${publicacao.ano}).`;
    }
  }
  return null;
}

function normalize(levantamentos) {
  const validos = [];
  const invalidos = [];

  for (const levantamento of levantamentos) {
    const ident = { levantamento: identificar(levantamento), arquivo: levantamento.arquivo };
    if (levantamento.erro) {
      invalidos.push({ item: ident, motivo: levantamento.erro });
      continue;
    }
    if (!levantamento.publicadoEm) {
      invalidos.push({ item: ident, motivo: 'A página do levantamento não informa "Publicado em" (sem data real de publicação, não há como gravar o vintage).' });
      continue;
    }
    const divergencia = conferirMes(levantamento);
    if (divergencia) {
      invalidos.push({ item: ident, motivo: divergencia });
      continue;
    }
    for (const motivo of levantamento.invalidos) invalidos.push({ item: ident, motivo: motivo.motivo });

    for (const o of levantamento.observacoes) {
      validos.push({
        series_code: o.seriesCode,
        observed_at: o.observedAt,
        value: o.valor,
        unit: o.unidade,
        source_code: SOURCE_CODE,
        published_at: levantamento.publicadoEm,
        published_at_is_estimated: false,
        published_at_basis: "source",
        metadata: {
          fonte: "Conab - Boletim da Safra de Grãos",
          produto: "milho",
          tipo: o.tipo,
          regiao: o.regiao,
          metrica: o.metrica,
          safra: o.safra,
          levantamento: ident.levantamento,
          arquivo: levantamento.arquivo,
          dataPublicacao: levantamento.publicadoEm.toISOString(),
          paginaAtualizadaEm: levantamento.atualizadoEm ? levantamento.atualizadoEm.toISOString() : null
        }
      });
    }
  }

  // Ordem cronológica: o serviço point-in-time decide "novo / mesmo valor / revisão" comparando com a última
  // versão de cada série, então um levantamento nunca pode entrar antes do anterior.
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos };
}

module.exports = {
  codigo: "conab-milho",
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
  extrairLevantamentosDoIndice,
  extrairDatasDaPagina,
  baixarLevantamentos,
  conferirMes,
  SOURCE_CODE,
  PAUSA_MS
};
