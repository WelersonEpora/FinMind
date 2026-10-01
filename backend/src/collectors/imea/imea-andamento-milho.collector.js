"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes } = require("../base/persist-observations");
const { API_BASE, CADEIA_MILHO, buscar, semAcento } = require("./imea-comum");
const { extrairAndamento } = require("./imea-andamento-milho.parser");
const { lerPdf } = require("../../shared/utils/pdf-texto");

// IMEA - andamento da semeadura e da colheita do milho de Mato Grosso: o percentual ACUMULADO da área semeada e
// colhida, semana a semana, em cada uma das 7 regiões do IMEA e no estado. Dos "Informe de Semeadura - Milho - <safra>"
// e "Informe de Colheita - Milho - <safra>" do catálogo de arquivos do IMEA (a mesma rota do balanço, ADR 0019). ADR 0039.
//
// O catálogo tem UM ARQUIVO POR SAFRA, que o IMEA substitui a cada semana (a data do arquivo é a da última semana):
// semeadura de 2012/13 a 2025/26 (14) e colheita de 2014/15 a 2025/26 (12), verificado em 2026-10-01. A coleta diária
// lê só o informe mais recente de cada tipo (o da safra em andamento); o backfill lê todos.
//
// SÉRIES: `IMEA.MILHO.ANDAMENTO.<REGIAO>.SEMEADURA` e `.COLHEITA`, em % da área (0 a 100), com observed_at = a data da
// semana do informe. published_at ESTIMADO: o próprio dia da semana, fim do dia em UTC (a data do arquivo no catálogo é
// a da última semana: o informe sai no dia). Uma correção vista depois vira versão nova com a data da coleta.
//
// Ressalvas: a colheita 2014/15 é recusada (o cabeçalho da fonte não tem o Médio-Norte, ver o parser); algumas safras
// terminam abaixo de 100% (o informe parou antes do fim: colheita 2015/16 em 95,8% e semeadura 2018/19 em 98,9% em MT).

const URL_LISTA = `${API_BASE}/arquivo`;
const SOURCE_CODE = "IMEA_MILHO_ANDAMENTO";
const PREFIXO_SERIE = "IMEA.MILHO.ANDAMENTO";
const TIPOS = {
  SEMEADURA: { nomeBusca: "Informe de Semeadura", prefixoNome: "informe de semeadura - milho" },
  COLHEITA: { nomeBusca: "Informe de Colheita", prefixoNome: "informe de colheita - milho" }
};
const PAUSA_MS = 1_000;
const TIMEOUT_MS = 5 * 60 * 1000;
const TAMANHO_PAGINA = 100;
const ASSINATURA_PDF = "%PDF";

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Informes de um tipo no catálogo: [{ tipo, id, nome, safra, data, path }], o mais antigo primeiro.
async function listarInformes(tipo, { signal, fetchFn } = {}) {
  const { nomeBusca, prefixoNome } = TIPOS[tipo];
  const url = `${URL_LISTA}?${new URLSearchParams({ cadeia: String(CADEIA_MILHO), nome: nomeBusca, page: "1", pageSize: String(TAMANHO_PAGINA), sort: "1" })}`;
  const corpo = await (await buscar(url, { signal, fetchFn })).json();
  if (!Array.isArray(corpo?.Result)) throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (a listagem de arquivos não trouxe `Result`).");
  return corpo.Result.filter(
    (a) => semAcento(String(a?.Nome ?? "")).toLowerCase().startsWith(prefixoNome) && String(a?.MimeType ?? "").includes("pdf") && a?.Path && a?.IsPublico !== false && a?.Liberado !== false
  )
    .map((a) => ({
      tipo,
      id: String(a.Id),
      nome: a.Nome,
      safra: (/(\d{2}\/\d{2})\s*$/.exec(a.Nome) || [])[1] || null,
      data: String(a.Data ?? "").slice(0, 10),
      path: a.Path
    }))
    .sort((x, y) => x.data.localeCompare(y.data));
}

// `parse()` do runner é síncrono: a leitura do PDF (assíncrona) acontece aqui. Falha de rede propaga; falha ao ler um
// PDF vira `erro` no item (inválido no normalize), sem abortar o lote.
async function baixarInforme(informe, { signal, fetchFn } = {}) {
  const buffer = Buffer.from(await (await buscar(informe.path, { signal, fetchFn })).arrayBuffer());
  const semUrlAssinada = { ...informe };
  delete semUrlAssinada.path;
  if (buffer.subarray(0, 4).toString("latin1") !== ASSINATURA_PDF) return { ...semUrlAssinada, erro: `o arquivo não é um PDF (${buffer.length} bytes).` };
  try {
    return { ...semUrlAssinada, paginas: await lerPdf(buffer) };
  } catch (err) {
    return { ...semUrlAssinada, erro: `Falha ao ler o PDF: ${err.message}` };
  }
}

async function baixarInformes({ todos, signal, fetchFn, esperar = aguardar }) {
  const baixados = [];
  for (const tipo of Object.keys(TIPOS)) {
    const informes = await listarInformes(tipo, { signal, fetchFn });
    for (const informe of todos ? informes : informes.slice(-1)) {
      if (baixados.length > 0) await esperar(PAUSA_MS);
      baixados.push(await baixarInforme(informe, { signal, fetchFn }));
    }
  }
  return baixados;
}

// Cada informe vira { tipo, nome, safra, data, semanas | erro }.
function parse(rawData) {
  if (!Array.isArray(rawData)) throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (esperava a lista de informes).");
  return rawData.map((item) => {
    const base = { tipo: item.tipo, nome: item.nome, safra: item.safra, data: item.data };
    if (item.erro) return { ...base, erro: item.erro };
    try {
      return { ...base, ...extrairAndamento(item.paginas) };
    } catch (err) {
      return { ...base, erro: `Falha ao ler a tabela: ${err.message}` };
    }
  });
}

function normalize(informes) {
  const validos = [];
  const invalidos = [];
  for (const informe of informes) {
    const ident = `${informe.nome} (${informe.data})`;
    if (informe.erro) {
      invalidos.push({ item: { informe: ident }, motivo: informe.erro });
      continue;
    }
    for (const { data, valores } of informe.semanas) {
      for (const [regiao, percentual] of Object.entries(valores)) {
        validos.push({
          series_code: `${PREFIXO_SERIE}.${regiao}.${informe.tipo}`,
          observed_at: data,
          value: percentual,
          unit: "%",
          source_code: SOURCE_CODE,
          published_at: fimDoDiaUtc(data),
          published_at_is_estimated: true,
          published_at_basis: "lag_rule",
          metadata: { fonte: "IMEA", informe: informe.nome, safra: informe.safra, tipo: informe.tipo, regraPublicacao: "dia_da_semana_do_informe" }
        });
      }
    }
  }
  return { validos, invalidos };
}

module.exports = {
  codigo: "imea-andamento-milho",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download: ({ signal, fetchFn, esperar } = {}) => baixarInformes({ todos: false, signal, fetchFn, esperar }),
  downloadTodos: ({ signal, fetchFn, esperar } = {}) => baixarInformes({ todos: true, signal, fetchFn, esperar }),
  parse,
  normalize,
  persist: persistirObservacoes,
  listarInformes,
  SOURCE_CODE,
  PREFIXO_SERIE
};
