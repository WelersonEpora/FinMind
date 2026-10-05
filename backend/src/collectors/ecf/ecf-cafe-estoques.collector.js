"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { lerPdf } = require("../../shared/utils/pdf-texto");
const { persistirPorEdicao } = require("../base/persist-observations");
const { lerRelatorio } = require("./ecf-cafe-estoques.parser");

// European Coffee Federation - "Stocks in European Ports": o estoque de café verde nos principais portos da Europa
// (Antuérpia, Hamburgo, Le Havre, Barcelona, Trieste, Gênova, Nápoles, Tallinn, Londres, Felixstowe e parte de
// Bremen), no fim de cada mês, em toneladas, por tipo (Robusta, Natural Arabica, Washed Arabica) e o total, incluindo
// os certificados da ICE. Pedido do Motor do Café v1 (F3, estoques fora do Brasil). ADR 0061.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-04 (ver o ADR):
//   - A página da categoria (PAGINA) linka um PDF por ano (`wp-content/uploads/<AAAA>/<MM>/<ano>-Stocks-European-
//     Ports*.pdf`) e, do ano corrente, TAMBÉM as versões anteriores (2026: a de junho e a de agosto). Cada PDF é uma
//     edição: a fonte revisa (robusta de abr/2026: 150.769 t na de junho, 150.565 t na de agosto).
//   - Bimestral, com ~2 meses de atraso (mar e abr/2026 saíram em junho; mai e jun, em agosto).
//   - A tabela por tipo existe desde o arquivo de 2020 (ANO_INICIAL); antes era por porto, com outra cobertura.
//   - `robots.txt` sem restrição. Licença: não lida (há uma página /disclaimer/); dados cedidos por armazéns e portos.
//
// SÉRIES `ECF.CAFE.ESTOQUE_<TIPO>` (toneladas), observed_at = 1º dia do mês (o estoque é o do último dia).
// PUBLISHED_AT: o `Last-Modified` do PDF (REAL: quando o arquivo foi para o site; os de 2016 a 2019 foram reenviados
// em nov/2020, o que só atrasa a data, nunca adianta); sem ele, o fim do mês da pasta de upload, ESTIMADO.

const PAGINA = "https://www.ecf-coffee.org/category/publications/stocks/";
const RE_LINK = /https:\/\/www\.ecf-coffee\.org\/wp-content\/uploads\/(\d{4})\/(\d{2})\/(\d{4})-Stocks-European-Ports[^"'\s<>]*\.pdf/gi;
const SOURCE_CODE = "ECF_STOCKS";
const PREFIXO_SERIE = "ECF.CAFE";
const ANO_INICIAL = 2020;
const PAUSA_MS = 2_000;
const TAMANHO_MINIMO_PDF = 50_000;
const ASSINATURA_PDF = "%PDF";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
const TIMEOUT_MS = 10 * 60 * 1000;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscar(url, { signal, fetchFn }) {
  let response;
  try {
    response = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
  }
  if (!response.ok) throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status} (${new URL(url).pathname}).`);
  return response;
}

// HTML da página -> [{ url, ano, upload: "AAAA-MM" }] sem repetição, em ordem de upload.
function extrairEdicoes(html) {
  const vistas = new Map();
  for (const m of html.matchAll(RE_LINK)) {
    if (!vistas.has(m[0])) vistas.set(m[0], { url: m[0], ano: Number(m[3]), upload: `${m[1]}-${m[2]}` });
  }
  return [...vistas.values()].sort((a, b) => a.upload.localeCompare(b.upload) || a.url.localeCompare(b.url));
}

// Uma edição -> { ...edicao, ultimaModificacao, meses, avisos, problemas } | { ...edicao, erro }. O PDF é lido aqui
// (o `parse` do runner é síncrono).
async function baixarEdicao(edicao, { signal, fetchFn }) {
  const response = await buscar(edicao.url, { signal, fetchFn });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < TAMANHO_MINIMO_PDF || buffer.subarray(0, 4).toString("latin1") !== ASSINATURA_PDF) {
    throw new UpstreamServiceError(`O arquivo da ECF ${edicao.url.split("/").pop()} não parece um PDF (${buffer.length} bytes).`);
  }
  const ultimaModificacao = response.headers?.get?.("last-modified") || null;
  try {
    return { ...edicao, ultimaModificacao, ...lerRelatorio(await lerPdf(buffer)) };
  } catch (err) {
    return { ...edicao, ultimaModificacao, erro: `Falha ao ler o PDF: ${err.message}` };
  }
}

async function baixarEdicoes({ anoMinimo, signal, fetchFn = fetch, esperar = aguardar }) {
  const html = await (await buscar(PAGINA, { signal, fetchFn })).text();
  const edicoes = extrairEdicoes(html).filter((e) => e.ano >= anoMinimo);
  if (edicoes.length === 0) throw new UpstreamServiceError(`A página da ECF não linka nenhum relatório de ${anoMinimo} em diante (a página mudou?).`);
  const baixadas = [];
  for (const [i, edicao] of edicoes.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    baixadas.push(await baixarEdicao(edicao, { signal, fetchFn }));
  }
  return baixadas;
}

// Coleta diária: as edições do ano corrente e do anterior (o fechamento de dezembro sai em janeiro). As já gravadas
// a persistência descarta.
function download({ signal, fetchFn, esperar, agora = new Date() } = {}) {
  return baixarEdicoes({ anoMinimo: agora.getUTCFullYear() - 1, signal, fetchFn, esperar });
}

// Backfill: todas as edições com a tabela por tipo (2020 em diante).
function downloadTodos({ signal, fetchFn, esperar } = {}) {
  return baixarEdicoes({ anoMinimo: ANO_INICIAL, signal, fetchFn, esperar });
}

function parse(rawData) {
  if (!Array.isArray(rawData)) throw new UpstreamServiceError("Download da ECF em formato inesperado.");
  return rawData;
}

// published_at: o `Last-Modified` (real), se for uma data válida não anterior ao mês da pasta de upload; senão, o fim
// do mês da pasta (estimado).
function publicacao(upload, ultimaModificacao) {
  const inicioUpload = new Date(`${upload}-01T00:00:00Z`);
  const lm = ultimaModificacao ? new Date(ultimaModificacao) : null;
  if (lm && !Number.isNaN(lm.getTime()) && lm >= inicioUpload) {
    return { published_at: lm, published_at_is_estimated: false, published_at_basis: "source" };
  }
  const [ano, mes] = upload.split("-").map(Number);
  return { published_at: new Date(Date.UTC(ano, mes, 1) - 1000), published_at_is_estimated: true, published_at_basis: "edition_lag_rule" };
}

function normalize(edicoes) {
  const validos = [];
  const invalidos = [];
  const avisos = [];
  for (const e of edicoes) {
    const arquivo = e.url.split("/").pop();
    if (e.erro) {
      invalidos.push({ item: { arquivo }, motivo: e.erro });
      continue;
    }
    for (const motivo of e.problemas) invalidos.push({ item: { arquivo }, motivo });
    for (const motivo of e.avisos) avisos.push({ item: { arquivo }, motivo });
    const pub = publicacao(e.upload, e.ultimaModificacao);
    for (const { mes, valores } of e.meses) {
      for (const [tipo, valor] of Object.entries(valores)) {
        validos.push({
          series_code: `${PREFIXO_SERIE}.ESTOQUE_${tipo}`,
          observed_at: `${mes}-01`,
          value: valor,
          unit: "toneladas",
          source_code: SOURCE_CODE,
          ...pub,
          metadata: { fonte: "European Coffee Federation - Stocks in European Ports", produto: "cafe", arquivo, url: e.url, periodo: "último dia do mês" }
        });
      }
    }
  }
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos, avisos };
}

const mensagemSemCarga = ({ series, valores }) =>
  `Carga histórica da ECF ainda não feita para ${series} série(s) (${valores} valores não gravados): rode "npm run backfill:ecf-cafe" antes da coleta diária.`;

const persist = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: true, mensagemSemCarga });
const persistirBackfill = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: false, mensagemSemCarga });

module.exports = {
  codigo: "ecf-cafe-estoques",
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
  extrairEdicoes,
  publicacao,
  SOURCE_CODE,
  ANO_INICIAL
};
