"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirPorEdicao } = require("../base/persist-observations");
const { API_BASE, CADEIA_MILHO, buscar, semAcento, publicadoEm } = require("./imea-comum");
const { extrairParidade } = require("./imea-paridade-milho.parser");
const { lerPdf } = require("../../shared/utils/pdf-texto");

// IMEA - paridade de exportação do milho de Mato Grosso, calculada pelo próprio IMEA: a linha
// "Paridade Exportação" da tabela diária do Boletim Semanal - Milho (PDF), do catálogo de arquivos do
// site (mesma rota do balanço, ADR 0019). ADR 0057.
//
// POR QUE: o David escolheu a paridade pronta do IMEA para o fator "Dólar e paridade de exportação" do milho
// (pergunta 16, ADR 0055), e o usuário autorizou a coleta em 2026-10-04 (ADR 0057, "Contexto").
//
// Catálogo `GET /api/arquivo?cadeia=3&nome=Boletim Semanal`: 573 edições em 2026-10-04, de 2015-02-02 a
// 2026-09-28, uma por semana (em geral, segunda-feira). A tabela diária só existe desde 2021-06-07: antes, a
// paridade não tem número legível (ver o parser). Cada edição traz os dias úteis da semana ANTERIOR.
//
// published_at: a data da edição é REAL (vem do catálogo); o horário não (o boletim sai às 17h): vale o fim do
// dia em UTC, ou o instante da coleta se ela roda no próprio dia (`publicadoEm`, como no resto do IMEA).
// observed_at: o dia da coluna da tabela.
//
// Defeito conhecido da fonte (achado real, 3 vezes: 2021-07-19, 2022-10-31 e 2023-06-26): a edição republica
// os valores da semana anterior com as datas da semana nova. Os 5 dias seriam falsos: a edição é pulada, com aviso.

const URL_LISTA = `${API_BASE}/arquivo`;
const NOME_ARQUIVO = "Boletim Semanal - Milho";
const SOURCE_CODE = "IMEA_MILHO_PARIDADE";
const SERIE = "IMEA.MILHO.PARIDADE_EXPORTACAO";
const DATA_INICIAL = "2021-06-07";
const PAUSA_MS = 1_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const TAMANHO_MINIMO_PDF = 20_000;
const ASSINATURA_PDF = "%PDF";
const TAMANHO_PAGINA = 100;
const MAX_PAGINAS = 10;
// A coleta diária relê as 2 últimas edições: pega a nova e compara com a anterior (o defeito da semana repetida).
const EDICOES_NA_COLETA_DIARIA = 2;
const MINIMO_PARA_REPETICAO = 3;

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

// Ids são inteiros grandes em texto: maior = mais dígitos, ou o texto maior (mesmo critério do balanço).
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

async function listarEdicoes({ desde = DATA_INICIAL, ate, signal, fetchFn } = {}) {
  const arquivos = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
    const url = `${URL_LISTA}?${new URLSearchParams({ cadeia: String(CADEIA_MILHO), nome: "Boletim Semanal", page: String(pagina), pageSize: String(TAMANHO_PAGINA), sort: "1" })}`;
    const corpo = await (await buscar(url, { signal, fetchFn })).json();
    if (!Array.isArray(corpo?.Result)) throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (a listagem de arquivos não trouxe `Result`).");
    arquivos.push(...corpo.Result);
    if (arquivos.length >= Number(corpo.TotalCount ?? 0) || corpo.Result.length === 0) break;
  }
  const validas = arquivos
    .filter(ehEdicaoValida)
    .map((a) => ({ id: String(a.Id), nome: a.Nome, data: String(a.Data ?? "").slice(0, 10), path: a.Path, urlPublica: a.UrlCompleto ?? null }))
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.data) && e.data >= desde && (!ate || e.data <= ate));
  return escolherUmaPorData(validas);
}

// ---------------------------------------------------------------- download (PDF)

// A leitura do PDF é assíncrona e `parse` precisa ser síncrono (o runner não o espera): acontece aqui, como no
// balanço. Falha de rede/HTTP e de assinatura do arquivo abortam a execução; falha ao LER um PDF vira `erro` no item.
async function baixarEdicao(edicao, { signal, fetchFn } = {}) {
  const resposta = await buscar(edicao.path, { signal, fetchFn });
  const buffer = Buffer.from(await resposta.arrayBuffer());
  if (buffer.length < TAMANHO_MINIMO_PDF || buffer.subarray(0, 4).toString("latin1") !== ASSINATURA_PDF) {
    throw new UpstreamServiceError(`O arquivo "${edicao.nome}" (${edicao.data}) não parece um PDF (${buffer.length} bytes).`);
  }
  const semUrlAssinada = { ...edicao };
  delete semUrlAssinada.path;
  try {
    return { ...semUrlAssinada, paginas: await lerPdf(buffer) };
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

async function download({ signal, fetchFn, esperar } = {}) {
  const todas = await listarEdicoes({ signal, fetchFn });
  return baixarEdicoes(todas.slice(-EDICOES_NA_COLETA_DIARIA), { signal, fetchFn, esperar });
}

async function downloadIntervalo({ dataInicial = DATA_INICIAL, dataFinal, signal, fetchFn, esperar } = {}) {
  const edicoes = await listarEdicoes({ desde: dataInicial < DATA_INICIAL ? DATA_INICIAL : dataInicial, ate: dataFinal, signal, fetchFn });
  return baixarEdicoes(edicoes, { signal, fetchFn, esperar });
}

// ---------------------------------------------------------------- parse / normalize

function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (esperava uma lista de edições).");
  }
  return rawData.map((item) => {
    const { paginas, ...base } = item;
    if (item.erro) return base;
    try {
      return { ...base, ...extrairParidade(paginas, item.data) };
    } catch (err) {
      return { ...base, erro: `Falha ao ler a paridade: ${err.message}` };
    }
  });
}

// A edição repete os valores da anterior com datas novas (o defeito conhecido)?
function repeteAnterior(edicao, anterior) {
  if (!anterior || edicao.dias.length < MINIMO_PARA_REPETICAO) return false;
  const valores = (e) => e.dias.map((d) => d.valor).join("|");
  const datas = (e) => e.dias.map((d) => d.data).join("|");
  return valores(edicao) === valores(anterior) && datas(edicao) !== datas(anterior);
}

function normalize(edicoes, agora = new Date()) {
  const validos = [];
  const invalidos = [];
  const avisos = [];
  let anterior = null;

  for (const edicao of [...edicoes].sort((a, b) => a.data.localeCompare(b.data))) {
    const ident = { edicao: edicao.data, arquivo: edicao.nome, id: edicao.id };
    if (edicao.erro) {
      invalidos.push({ item: ident, motivo: edicao.erro });
      anterior = null;
      continue;
    }
    // Erros de digitação nas datas do cabeçalho: defeito conhecido, tratado de propósito (o dia não é gravado).
    for (const inv of edicao.invalidos) avisos.push({ item: { ...ident, dia: inv.data }, motivo: inv.motivo });

    if (repeteAnterior(edicao, anterior)) {
      avisos.push({
        item: ident,
        motivo: `A tabela repete os valores da edição de ${anterior.data} com as datas de outra semana (defeito da fonte): edição não gravada.`
      });
      anterior = edicao;
      continue;
    }
    anterior = edicao;

    const publishedAt = publicadoEm(edicao.data, agora);
    for (const dia of edicao.dias) {
      validos.push({
        series_code: SERIE,
        observed_at: dia.data,
        value: dia.valor,
        unit: "R$/sc",
        source_code: SOURCE_CODE,
        published_at: publishedAt,
        published_at_is_estimated: false,
        published_at_basis: "source",
        metadata: {
          fonte: "IMEA - Boletim Semanal - Milho (tabela diária)",
          produto: "milho",
          praca: "Mato Grosso",
          contratoReferencia: edicao.contrato,
          arquivo: edicao.nome,
          arquivoId: edicao.id,
          dataPublicacao: edicao.data,
          urlPublica: edicao.urlPublica
        }
      });
    }
  }

  // Ordem cronológica de publicação (o serviço point-in-time compara cada valor com a última versão da série).
  validos.sort((a, b) => a.published_at - b.published_at || a.observed_at.localeCompare(b.observed_at));
  return { validos, invalidos, avisos };
}

// ---------------------------------------------------------------- persist

const mensagemSemCarga = ({ valores }) =>
  `Carga histórica da paridade de exportação do IMEA ainda não feita (${valores} valores não gravados): rode "npm run backfill:imea-paridade" antes da coleta diária.`;

const persist = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: true, mensagemSemCarga });

const persistirBackfill = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: false, mensagemSemCarga });

module.exports = {
  codigo: "imea-paridade-milho",
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
  listarEdicoes,
  repeteAnterior,
  SOURCE_CODE,
  SERIE,
  DATA_INICIAL,
  EDICOES_NA_COLETA_DIARIA
};
