"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const observationRepository = require("../../repositories/observation.repository");
const { persistirPorEdicao } = require("../base/persist-observations");
const { lerEdicao } = require("./eia-steo.parser");

// EIA - Short-Term Energy Outlook (STEO), mensal: a produção de petróleo bruto da OPEP e da OPEP+ por país, os totais
// e a capacidade de produção e a capacidade ociosa da OPEP. Pedido do fator do petróleo "Decisões da OPEP+" (F1, Alto):
// a medida do efeito das decisões da OPEP+ ao lado dos eventos, sem as cotas (só no site da OPEP, bloqueado a acesso
// automático). Decisão do usuário, 2026-10-06. ADR 0091.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-06 (ver o ADR):
//   - Uma planilha por edição no arquivo do STEO, sem chave: `https://www.eia.gov/outlooks/steo/archives/<mmm><aa>
//     _base.xlsx` (XLS até 2013: a 2ª tentativa). Edições de jan/2008 a out/2026 lidas pelo parser (a de jan/2005 não
//     tem a tabela por país). A API v2 (`api.eia.gov/v2/steo`) exige chave e só guarda a edição atual.
//   - ~10 s por pedido (o servidor da EIA é lento), ~1 MB por planilha.
//   - Cada edição REVISA os meses anteriores: é o vintage, uma versão por edição que muda o valor.
//
// SÉRIES `EIA_STEO.PETROLEO.<ISO2 | OPEP | OPEP_MAIS | OPEP_MAIS_MEMBROS_OPEP | OPEP_MAIS_OUTROS>.PRODUCAO`,
// `EIA_STEO.PETROLEO.OPEP.CAPACIDADE` e `EIA_STEO.PETROLEO.OPEP.CAPACIDADE_OCIOSA`, em MIL barris/dia (a planilha traz milhões: × 1.000,
// a unidade do JODI), observed_at = 1º dia do mês. Só os meses históricos de cada edição (a previsão não é gravada).
//
// PUBLISHED_AT (ESTIMADO, "edition_lag_rule"): o STEO sai na terça depois da 1ª quinta do mês (conferido em jun/2012,
// jan/2016, jan/2021, jan/2023 e jan/2025). A data é o FIM da quarta seguinte (um dia de folga, conservador). O
// `Last-Modified` do arquivo não serve: é de 1 a 5 dias ANTES da divulgação. A data "Forecast date" das edições desde
// 2024 é a do fechamento da previsão (uma quinta), também antes da divulgação: só fica no metadata. A estimativa é a
// da EDIÇÃO: a revisão que ela traz para um mês anterior fica com a mesma data (point-in-time.service.js).

const URL_BASE = "https://www.eia.gov/outlooks/steo/archives";
const SOURCE_CODE = "EIA_STEO";
const PREFIXO_SERIE = "EIA_STEO";
const SERIE_REFERENCIA = `${PREFIXO_SERIE}.PETROLEO.SA.PRODUCAO`;
const PRIMEIRA_EDICAO = "2008-01";
const PAUSA_MS = 2_000;
const TAMANHO_MINIMO = 20_000;
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
const MESES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Coleta diária: a edição do mês corrente e a do anterior, se ainda não estão no banco.
const EDICOES_NA_COLETA_DIARIA = 2;
const TIMEOUT_MS = 60 * 60 * 1000;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function somarMeses(mes, k) {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1 + k, 1)).toISOString().slice(0, 7);
}

function edicoesEntre(inicio, fim) {
  const edicoes = [];
  for (let e = inicio; e <= fim; e = somarMeses(e, 1)) edicoes.push(e);
  return edicoes;
}

// "2026-09" -> ["…/sep26_base.xlsx", "…/sep26_base.xls"] (até 2013, o XLS primeiro).
function urlsDaEdicao(edicao) {
  const [ano, m] = edicao.split("-").map(Number);
  const base = `${URL_BASE}/${MESES[m - 1]}${String(ano).slice(2)}_base`;
  return ano <= 2013 ? [`${base}.xls`, `${base}.xlsx`] : [`${base}.xlsx`, `${base}.xls`];
}

async function buscar(url, { signal, fetchFn }) {
  let response;
  try {
    response = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status} (${new URL(url).pathname}).`);
  return response;
}

// XLSX é um ZIP ("PK"); XLS, um documento OLE (D0 CF 11 E0).
function ehPlanilha(buffer) {
  return buffer.subarray(0, 2).toString("latin1") === "PK" || buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
}

// Uma edição -> { edicao, url, ...lerEdicao } | { edicao, erro } | null (ainda não publicada). Falha de rede ou HTTP
// propaga; planilha ilegível vira `erro` daquela edição.
async function baixarEdicao(edicao, { signal, fetchFn = fetch, esperar = aguardar } = {}) {
  for (const [i, url] of urlsDaEdicao(edicao).entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    const response = await buscar(url, { signal, fetchFn });
    if (!response) continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    // O arquivo da EIA às vezes responde 200 com uma página de erro em HTML (o oct13_base.xls; a edição está no
    // .xlsx): sem a assinatura de planilha, tenta a outra extensão.
    if (!ehPlanilha(buffer)) continue;
    if (buffer.length < TAMANHO_MINIMO) throw new UpstreamServiceError(`A edição do STEO de ${edicao} veio com ${buffer.length} bytes.`);
    try {
      return { edicao, url, ...lerEdicao(buffer) };
    } catch (err) {
      return { edicao, url, erro: `Falha ao ler a planilha: ${err.message}` };
    }
  }
  return null;
}

async function baixarEdicoes(edicoes, { signal, fetchFn, esperar = aguardar } = {}) {
  const lidas = [];
  const naoPublicadas = [];
  for (const [i, edicao] of edicoes.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    const lida = await baixarEdicao(edicao, { signal, fetchFn, esperar });
    if (lida) lidas.push(lida);
    else naoPublicadas.push(edicao);
  }
  return { edicoes: lidas, naoPublicadas };
}

// Coleta diária: as edições recentes ainda não gravadas (pela data de publicação estimada já no banco).
async function download({ signal, fetchFn, esperar, agora = new Date(), deps = {} } = {}) {
  const repo = deps.observationRepository || observationRepository;
  const fim = agora.toISOString().slice(0, 7);
  const candidatas = edicoesEntre(somarMeses(fim, -(EDICOES_NA_COLETA_DIARIA - 1)), fim);
  const publicacoes = await repo.listarSeriesEInstantes(SOURCE_CODE, { transaction: deps.transaction });
  const jaNoBanco = new Set(publicacoes.map((p) => new Date(p.published_at).getTime()));
  const faltam = candidatas.filter((e) => !jaNoBanco.has(publicacao(e).published_at.getTime()));
  return baixarEdicoes(faltam, { signal, fetchFn, esperar });
}

// Backfill: as edições de `edicaoInicial` a `edicaoFinal`, em ordem.
function downloadIntervalo({ edicaoInicial = PRIMEIRA_EDICAO, edicaoFinal, signal, fetchFn, esperar } = {}) {
  const inicio = edicaoInicial < PRIMEIRA_EDICAO ? PRIMEIRA_EDICAO : edicaoInicial;
  return baixarEdicoes(edicoesEntre(inicio, edicaoFinal), { signal, fetchFn, esperar });
}

function parse(rawData) {
  if (!Array.isArray(rawData?.edicoes)) throw new UpstreamServiceError("Download do STEO em formato inesperado.");
  return rawData.edicoes;
}

// A divulgação estimada da edição: o fim (UTC) da quarta depois da 1ª quinta do mês.
function publicacao(edicao) {
  const [ano, m] = edicao.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1));
  const primeiraQuinta = 1 + ((4 - primeiro.getUTCDay() + 7) % 7);
  const quarta = new Date(Date.UTC(ano, m - 1, primeiraQuinta + 6, 23, 59, 59));
  return { published_at: quarta, published_at_is_estimated: true, published_at_basis: "edition_lag_rule" };
}

// Milhões -> mil barris/dia, sem o ruído do ponto flutuante da planilha (2,3999999999999986).
function emMilBarris(milhoes) {
  return Math.round(milhoes * 1e6) / 1e3;
}

function normalize(edicoes) {
  const validos = [];
  const invalidos = [];
  const avisos = [];
  for (const e of edicoes) {
    if (e.erro) {
      invalidos.push({ item: { edicao: e.edicao }, motivo: e.erro });
      continue;
    }
    if (e.desconhecidos.length > 0) {
      avisos.push(`edição de ${e.edicao}: país sem mapa, não gravado (${e.desconhecidos.join(", ")})`);
    }
    const pub = publicacao(e.edicao);
    for (const v of e.valores) {
      validos.push({
        series_code: `${PREFIXO_SERIE}.${v.serie}`,
        observed_at: `${v.mes}-01`,
        value: emMilBarris(v.valor),
        unit: "mil barris/dia",
        source_code: SOURCE_CODE,
        ...pub,
        metadata: {
          fonte: "EIA - Short-Term Energy Outlook",
          edicao: e.edicao,
          tabela: e.tabela,
          serieEia: v.codigoEia,
          nome: v.nome,
          url: e.url,
          ...(e.dataEdicao ? { dataPrevisao: e.dataEdicao } : {})
        }
      });
    }
  }
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos, avisos };
}

const mensagemSemCarga = ({ series, valores }) =>
  `Carga histórica do STEO ainda não feita para ${series} série(s) (${valores} valores não gravados): rode "npm run backfill:eia-steo" antes da coleta diária.`;

const persist = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: true, mensagemSemCarga });
const persistirBackfill = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: false, mensagemSemCarga });

module.exports = {
  codigo: "eia-steo",
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
  urlsDaEdicao,
  edicoesEntre,
  publicacao,
  SOURCE_CODE,
  SERIE_REFERENCIA,
  PRIMEIRA_EDICAO
};
