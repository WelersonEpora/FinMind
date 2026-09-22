"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirPorEdicao } = require("../base/persist-observations");
const { API_BASE, CADEIA_MILHO, buscar, semAcento, publicadoEm } = require("./imea-comum");
const { lerPlanilha, extrairCusto } = require("./imea-custo-milho.parser");

// IMEA - custo de produção do milho de Mato Grosso, das planilhas XLSX que o IMEA publica no catálogo de arquivos do
// site. ADR 0018.
//
// São 4 planilhas, cada uma com uma aba por local (Mato Grosso e ~14 municípios) e uma linha por item de custo (R$/ha):
//   - Mensal   x Alta/Média Tecnologia: os meses da safra corrente;
//   - Ponderado x Alta/Média Tecnologia: as safras consolidadas (2021/22 em diante) e os meses da safra corrente.
// O IMEA não explica no arquivo a diferença entre "Mensal" e "Ponderado" (os valores diferem no mesmo mês): são séries
// distintas, com o nome que a fonte dá, sem interpretação.
//
// COMO ACHAR: `GET /api/arquivo?cadeia=3&nome=Custo` (os filtros são os que o próprio site usa: cadeia, tipo, nome,
// page, pageSize, sort) lista os arquivos com uma URL S3 assinada que vale 5 dias (por isso listar e baixar na mesma
// execução) e a `Data` de publicação. A busca por "Custo de Produção" (com acento) não acha nada: usa-se "Custo" e o
// nome completo é conferido aqui.
//
// VERIFICADO POR CHAMADA REAL em 2026-09-21/22 (ver o ADR): 4 arquivos, todos de 15/09/2026, públicos, sem login.
//
// LIMITES conhecidos:
//   - O catálogo só tem a versão ATUAL de cada planilha. Os valores de meses anteriores dentro do arquivo entram com o
//     `published_at` do arquivo (limite superior conservador, como na Conab): o vintage começa agora.
//   - Só o arquivo MAIS NOVO de cada tipo é lido (o histórico de versões de arquivos antigos, se o IMEA passar a
//     mantê-los, não é baixado).
//   - Republicação com correção NO MESMO DIA da mesma planilha mantém a 1ª versão gravada (append-only), como no WASDE.

const URL_LISTA = `${API_BASE}/arquivo`;
const PAUSA_MS = 1_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const TAMANHO_MINIMO_XLSX = 50_000;
const ASSINATURA_ZIP = "PK";
const TAMANHO_PAGINA = 100;
const MAX_PAGINAS = 10;
const TIPO_XLSX = "spreadsheetml.sheet";
const RE_NOME = /^Custo de Producao - Milho - (Mensal|Ponderado) (Alta|Media) Tecnologia$/;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const sourceCodeDe = ({ tipo, tecnologia }) => `IMEA_CUSTO_MILHO_${tipo}_${tecnologia}`;

// ---------------------------------------------------------------- listagem

// "Custo de Produção - Milho - Mensal Média Tecnologia" -> { tipo: "MENSAL", tecnologia: "MEDIA" } (ou null).
function identificarArquivo(nome) {
  const m = RE_NOME.exec(semAcento(String(nome ?? "")));
  return m ? { tipo: m[1].toUpperCase(), tecnologia: m[2].toUpperCase() } : null;
}

// Ids são números inteiros grandes em texto (não cabem em Number): maior = mais dígitos, ou o texto maior.
function idMaior(a, b) {
  const [x, y] = [String(a), String(b)];
  return x.length !== y.length ? x.length > y.length : x > y;
}

// Do catálogo, o arquivo MAIS NOVO (por Data, depois pelo Id) de cada (tipo, tecnologia).
function escolherArquivos(catalogo) {
  const porTipo = new Map();
  for (const arquivo of catalogo) {
    const tipo = identificarArquivo(arquivo?.Nome);
    if (!tipo || !String(arquivo.MimeType ?? "").includes(TIPO_XLSX) || !arquivo.Path || arquivo.IsPublico === false || arquivo.Liberado === false) continue;
    const chave = sourceCodeDe(tipo);
    const atual = porTipo.get(chave);
    const maisNovo = !atual || arquivo.Data > atual.Data || (arquivo.Data === atual.Data && idMaior(arquivo.Id, atual.Id));
    if (maisNovo) porTipo.set(chave, arquivo);
  }
  return [...porTipo.entries()]
    .map(([sourceCode, a]) => ({
      sourceCode,
      ...identificarArquivo(a.Nome),
      id: String(a.Id),
      nome: a.Nome,
      data: String(a.Data ?? "").slice(0, 10),
      horario: a.HorarioPublicacao ?? null,
      urlPublica: a.UrlCompleto ?? null,
      path: a.Path
    }))
    .sort((a, b) => a.sourceCode.localeCompare(b.sourceCode));
}

async function listarCatalogo({ signal, fetchFn }) {
  const arquivos = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
    const url = `${URL_LISTA}?${new URLSearchParams({ cadeia: String(CADEIA_MILHO), nome: "Custo", page: String(pagina), pageSize: String(TAMANHO_PAGINA), sort: "1" })}`;
    const corpo = await (await buscar(url, { signal, fetchFn })).json();
    if (!Array.isArray(corpo?.Result)) throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (a listagem de arquivos não trouxe `Result`).");
    arquivos.push(...corpo.Result);
    if (arquivos.length >= Number(corpo.TotalCount ?? 0) || corpo.Result.length === 0) break;
  }
  return arquivos;
}

// ---------------------------------------------------------------- download

async function baixarArquivo(arquivo, { signal, fetchFn }) {
  const resposta = await buscar(arquivo.path, { signal, fetchFn });
  const buffer = Buffer.from(await resposta.arrayBuffer());
  // Guarda contra uma página de erro salva como .xlsx: o XLSX é um ZIP (assinatura "PK").
  if (buffer.length < TAMANHO_MINIMO_XLSX || buffer.subarray(0, 2).toString("latin1") !== ASSINATURA_ZIP) {
    throw new UpstreamServiceError(`O arquivo "${arquivo.nome}" não parece uma planilha XLSX (${buffer.length} bytes).`);
  }
  // A URL assinada não vai adiante (expira e não deve ser gravada).
  const semUrl = { ...arquivo };
  delete semUrl.path;
  return { ...semUrl, buffer };
}

async function download({ signal, fetchFn = fetch, esperar = aguardar } = {}) {
  const arquivos = escolherArquivos(await listarCatalogo({ signal, fetchFn }));
  if (arquivos.length === 0) {
    throw new UpstreamServiceError("O catálogo do IMEA não trouxe nenhuma planilha de custo de produção do milho (os nomes mudaram?).");
  }
  const baixados = [];
  for (const [i, arquivo] of arquivos.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    baixados.push(await baixarArquivo(arquivo, { signal, fetchFn }));
  }
  return baixados;
}

// ---------------------------------------------------------------- parse / normalize

// Cada arquivo vira { ...arquivo, observacoes, invalidos, locaisSemAba } ou { ...arquivo, erro }. Falha ao ler UM
// arquivo não aborta os demais.
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (esperava uma lista de planilhas).");
  }
  return rawData.map((item) => {
    const { buffer, ...base } = item;
    try {
      return { ...base, ...extrairCusto(lerPlanilha(buffer), { tipo: base.tipo, tecnologia: base.tecnologia }) };
    } catch (err) {
      return { ...base, erro: `Falha ao ler a planilha: ${err.message}` };
    }
  });
}

function normalize(arquivos, agora = new Date()) {
  const validos = [];
  const invalidos = [];

  for (const arquivo of arquivos) {
    const ident = { arquivo: arquivo.nome, id: arquivo.id };
    if (arquivo.erro) {
      invalidos.push({ item: ident, motivo: arquivo.erro });
      continue;
    }
    // A listagem usa "0001-01-01" quando o arquivo não tem data: sem data real não há como gravar o vintage.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arquivo.data) || arquivo.data.startsWith("0001")) {
      invalidos.push({ item: ident, motivo: `O arquivo não informa uma data de publicação válida ("${arquivo.data}"): sem data real, não há como gravar o vintage.` });
      continue;
    }
    for (const motivo of arquivo.invalidos) invalidos.push({ item: { ...ident, ...motivo.item }, motivo: motivo.motivo });

    const publishedAt = publicadoEm(arquivo.data, agora);
    for (const o of arquivo.observacoes) {
      validos.push({
        series_code: o.seriesCode,
        observed_at: o.observedAt,
        value: o.valor,
        unit: o.unidade,
        source_code: arquivo.sourceCode,
        published_at: publishedAt,
        published_at_is_estimated: false,
        published_at_basis: "source",
        metadata: {
          fonte: "IMEA - custo de produção do milho",
          produto: "milho",
          tipo: o.tipo,
          tecnologia: o.tecnologia,
          periodo: o.periodo,
          local: o.local,
          localNome: o.localNome,
          item: o.item,
          rotulo: o.rotulo,
          safra: o.safra,
          mes: o.mes,
          estimativa: o.estimativa,
          arquivo: arquivo.nome,
          arquivoId: arquivo.id,
          dataPublicacao: arquivo.data,
          horarioPublicacao: arquivo.horario,
          urlPublica: arquivo.urlPublica
        }
      });
    }
  }

  // Ordem cronológica de publicação (o serviço compara cada valor com a última versão da série).
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos };
}

// Uma `source_code` por planilha: a reingestão descarta as edições já lidas POR FONTE, e duas planilhas publicadas no
// mesmo dia não podem se descartar uma à outra.
async function persist(validos, contexto, deps = {}) {
  const porFonte = new Map();
  for (const v of validos) {
    if (!porFonte.has(v.source_code)) porFonte.set(v.source_code, []);
    porFonte.get(v.source_code).push(v);
  }

  const total = { criados: 0, atualizados: 0, ignorados: 0, falhas: [] };
  for (const [sourceCode, grupo] of porFonte) {
    const resultado = await persistirPorEdicao(grupo, contexto, deps, { sourceCode, exigirCargaInicial: false, mensagemSemCarga: () => "" });
    total.criados += resultado.criados;
    total.atualizados += resultado.atualizados;
    total.ignorados += resultado.ignorados;
    total.falhas.push(...resultado.falhas);
  }
  return total;
}

module.exports = {
  codigo: "imea-custo-milho",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist,
  identificarArquivo,
  escolherArquivos,
  listarCatalogo,
  URL_LISTA,
  PAUSA_MS
};
