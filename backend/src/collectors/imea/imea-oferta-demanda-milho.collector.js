"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirPorEdicao } = require("../base/persist-observations");
const { API_BASE, CADEIA_MILHO, buscar, semAcento } = require("./imea-comum");
const { extrairBalanco } = require("./imea-oferta-demanda-milho.parser");
const { lerPdf } = require("../../shared/utils/pdf-texto");

// IMEA - balanço de oferta e demanda do milho de Mato Grosso: PDF mensal "Oferta e Demanda - Milho",
// do catálogo de arquivos do site (mesma rota do `imea-custo-milho`). ADR 0019.
//
// POR QUE AGORA: o ADR 0018 descartou esta fonte porque `pdftotext -layout` desalinhava a tabela
// (mesmo problema que já tinha descartado PDF no WASDE, ADR 0015). A extração aqui é por
// COORDENADA (x/y de cada texto, ver `imea-oferta-demanda-milho.parser.js`), que resolve o
// alinhamento: testada em 7 edições reais de 2014 a 2026, sem nenhum inválido.
//
// Catálogo `GET /api/arquivo?cadeia=3&nome=Oferta e Demanda`: 79 edições em 2026-09-22, de
// 2014-04-14 a 2026-08-31, uma por mês. Diferente do `imea-custo-milho` (só a versão atual de cada
// planilha), aqui o catálogo lista TODAS as edições publicadas: há vintage real a carregar.
//
// published_at: a data do release é REAL (vem do catálogo). O horário não: vale o FIM DO DIA em UTC
// (conservador, mesmo critério do resto do IMEA e do WASDE).
// observed_at: safra 2024/25 -> 1º/set/2024 (convenção já usada em WASDE/Conab/IMEA safra).

const URL_LISTA = `${API_BASE}/arquivo`;
const NOME_ARQUIVO = "Oferta e Demanda - Milho";
const SOURCE_CODE = "IMEA_MILHO_BALANCO";
const DATA_INICIAL = "2014-04-14";
const PAUSA_MS = 1_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const TAMANHO_MINIMO_PDF = 20_000;
const ASSINATURA_PDF = "%PDF";
const TAMANHO_PAGINA = 100;
const MAX_PAGINAS = 10;
// A coleta diária relê as 2 últimas edições: pega a nova e uma correção republicada da anterior.
const EDICOES_NA_COLETA_DIARIA = 2;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------- listagem

function ehEdicaoValida(arquivo) {
  return (
    semAcento(String(arquivo?.Nome ?? "")).trim() === semAcento(NOME_ARQUIVO) &&
    String(arquivo?.MimeType ?? "").includes("pdf") &&
    Boolean(arquivo?.Path) &&
    arquivo?.IsPublico !== false &&
    arquivo?.Liberado !== false
  );
}

// Ids são números inteiros grandes em texto (não cabem em Number): maior = mais dígitos, ou o texto maior
// (mesmo critério do `imea-custo-milho`, para o caso raro de duas edições na mesma data).
function idMaior(a, b) {
  const [x, y] = [String(a), String(b)];
  return x.length !== y.length ? x.length > y.length : x > y;
}

// Uma edição por DATA (a mais nova, por Id, se houver republicação no mesmo dia).
function escolherUmaPorData(edicoes) {
  const porData = new Map();
  for (const e of edicoes) {
    const atual = porData.get(e.data);
    if (!atual || idMaior(e.id, atual.id)) porData.set(e.data, e);
  }
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}

async function listarCatalogo({ signal, fetchFn }) {
  const arquivos = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
    const url = `${URL_LISTA}?${new URLSearchParams({ cadeia: String(CADEIA_MILHO), nome: "Oferta e Demanda", page: String(pagina), pageSize: String(TAMANHO_PAGINA), sort: "1" })}`;
    const corpo = await (await buscar(url, { signal, fetchFn })).json();
    if (!Array.isArray(corpo?.Result)) throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (a listagem de arquivos não trouxe `Result`).");
    arquivos.push(...corpo.Result);
    if (arquivos.length >= Number(corpo.TotalCount ?? 0) || corpo.Result.length === 0) break;
  }
  return arquivos;
}

// `desde`/`ate`: datas ISO (YYYY-MM-DD), inclusive. Sem elas, lista tudo.
async function listarEdicoes({ desde, ate, signal, fetchFn } = {}) {
  const catalogo = await listarCatalogo({ signal, fetchFn });
  const validas = catalogo
    .filter(ehEdicaoValida)
    .map((a) => ({ id: String(a.Id), nome: a.Nome, data: String(a.Data ?? "").slice(0, 10), path: a.Path, urlPublica: a.UrlCompleto ?? null }))
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.data) && (!desde || e.data >= desde) && (!ate || e.data <= ate));
  return escolherUmaPorData(validas);
}

// ---------------------------------------------------------------- download (PDF)

// `collector.parse()` precisa ser SÍNCRONO (o runner não o espera - `collector-runner.js`): a
// leitura do PDF com `pdfjs-dist` é assíncrona, então acontece aqui, no download (que É esperado),
// não no parse. Falha de REDE/HTTP (via `buscar`) e de assinatura do arquivo propagam (abortam a
// execução inteira, como no resto do IMEA/WASDE); falha ao LER um PDF específico (corrompido,
// layout inesperado) vira `erro` no item - vira inválido no normalize, não aborta o lote.
async function baixarEdicao(edicao, { signal, fetchFn } = {}) {
  const resposta = await buscar(edicao.path, { signal, fetchFn });
  const buffer = Buffer.from(await resposta.arrayBuffer());
  // Guarda contra uma página de erro/HTML salva como .pdf: o PDF começa com a assinatura "%PDF".
  if (buffer.length < TAMANHO_MINIMO_PDF || buffer.subarray(0, 4).toString("latin1") !== ASSINATURA_PDF) {
    throw new UpstreamServiceError(`O arquivo "${edicao.nome}" (${edicao.data}) não parece um PDF (${buffer.length} bytes).`);
  }
  const semUrlAssinada = { ...edicao };
  delete semUrlAssinada.path;
  try {
    const paginas = await lerPdf(buffer);
    return { ...semUrlAssinada, paginas };
  } catch (err) {
    return { ...semUrlAssinada, erro: `Falha ao ler o PDF: ${err.message}` };
  }
}

async function baixarEdicoes(edicoes, { signal, fetchFn, esperar = aguardar } = {}) {
  const baixadas = [];
  for (const [i, edicao] of edicoes.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    baixadas.push(await baixarEdicao(edicao, { signal, fetchFn }));
  }
  return baixadas;
}

// Coleta diária: as N edições mais recentes do catálogo.
async function download({ signal, fetchFn, esperar } = {}) {
  const todas = await listarEdicoes({ desde: DATA_INICIAL, signal, fetchFn });
  return baixarEdicoes(todas.slice(-EDICOES_NA_COLETA_DIARIA), { signal, fetchFn, esperar });
}

// Backfill: edições de `dataInicial` a `dataFinal` (datas ISO).
async function downloadIntervalo({ dataInicial = DATA_INICIAL, dataFinal, signal, fetchFn, esperar } = {}) {
  const edicoes = await listarEdicoes({ desde: dataInicial, ate: dataFinal, signal, fetchFn });
  return baixarEdicoes(edicoes, { signal, fetchFn, esperar });
}

// ---------------------------------------------------------------- parse / normalize

// Cada edição vira { id, nome, data, urlPublica, linhas, invalidos } ou { ..., erro }. Falha ao ler
// UM PDF (marcada em `baixarEdicao`, na fase de download) não aborta as demais; falha ao
// INTERPRETAR o balanço de um PDF que abriu normalmente também não (guarda extra, defensiva).
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (esperava uma lista de edições).");
  }
  return rawData.map((item) => {
    const { paginas, ...base } = item;
    if (item.erro) return base;
    try {
      return { ...base, ...extrairBalanco(paginas) };
    } catch (err) {
      return { ...base, erro: `Falha ao interpretar o balanço: ${err.message}` };
    }
  });
}

const CAMPOS_CONHECIDOS = ["OFERTA", "ESTOQUE_INICIAL", "IMPORTACAO", "PRODUCAO", "DEMANDA", "CONSUMO_MT", "CONSUMO_INTERESTADUAL", "EXPORTACAO", "AQUISICOES_PUBLICAS", "ESTOQUE_FINAL"];

function normalize(edicoes) {
  const validos = [];
  const invalidos = [];

  for (const edicao of edicoes) {
    const ident = { edicao: edicao.data, arquivo: edicao.nome, id: edicao.id };
    if (edicao.erro) {
      invalidos.push({ item: ident, motivo: edicao.erro });
      continue;
    }
    for (const inv of edicao.invalidos) invalidos.push({ item: { ...ident, campo: inv.rotulo, safra: inv.safra }, motivo: inv.motivo });

    if (Object.keys(edicao.linhas).length === 0) {
      invalidos.push({ item: ident, motivo: 'Nenhum campo conhecido do balanço (Oferta, Estoque Inicial, Produção...) foi lido nesta edição.' });
      continue;
    }

    const publishedAt = fimDoDiaUtc(edicao.data);
    for (const campo of CAMPOS_CONHECIDOS) {
      for (const [safra, dado] of Object.entries(edicao.linhas[campo] || {})) {
        validos.push({
          series_code: `IMEA.MILHO.BALANCO.${campo}`,
          observed_at: `${dado.anoInicial}-09-01`,
          value: dado.valor,
          unit: "milhões de t",
          source_code: SOURCE_CODE,
          published_at: publishedAt,
          published_at_is_estimated: false,
          published_at_basis: "source",
          metadata: {
            fonte: "IMEA - balanço de oferta e demanda do milho",
            produto: "milho",
            campo,
            safra,
            estimativa: dado.estimativa,
            arquivo: edicao.nome,
            arquivoId: edicao.id,
            dataPublicacao: edicao.data,
            urlPublica: edicao.urlPublica
          }
        });
      }
    }
  }

  // Ordem cronológica de publicação (o serviço point-in-time compara cada valor com a última versão da série).
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos };
}

// ---------------------------------------------------------------- persist

const mensagemSemCarga = ({ series, valores }) =>
  `Carga histórica do balanço de oferta e demanda do IMEA ainda não feita para ${series} série(s) (${valores} valores não gravados): rode "npm run backfill:imea-oferta-demanda" antes da coleta diária.`;

const persist = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: true, mensagemSemCarga });

const persistirBackfill = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: false, mensagemSemCarga });

module.exports = {
  codigo: "imea-oferta-demanda-milho",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist,
  persistirBackfill,
  ehEdicaoValida,
  escolherUmaPorData,
  listarCatalogo,
  listarEdicoes,
  baixarEdicoes,
  SOURCE_CODE,
  DATA_INICIAL,
  EDICOES_NA_COLETA_DIARIA,
  PAUSA_MS,
  URL_LISTA
};
