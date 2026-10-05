"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { lerPdf } = require("../../shared/utils/pdf-texto");
const observationRepository = require("../../repositories/observation.repository");
const { persistirPorEdicao } = require("../base/persist-observations");
const { lerRelatorio, mesSeguinte, COLUNAS_PRECO } = require("./ico-cafe.parser");

// ICO - Coffee Market Report, mensal (PDF público): a média mensal dos preços indicativos por grupo (I-CIP, Colombian
// Milds, Other Milds, Brazilian Naturals, Robustas) e dos futuros de Nova York e Londres (tabela 1) e os estoques
// certificados das duas bolsas (tabela 5). Pedido do Motor do Café v1 (F3: estoques de Londres; F6: a substituição de
// arábica por robusta, pela diferença entre Nova York e Londres). ADR 0061.
//
// Licença (lida em 2026-09-28): reuso livre "if the ICO is clearly acknowledged as the source". Sem chave.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-04 (ver o ADR):
//   - URL `https://www.ico.org/documents/cy<AAAA-AA>/cmr-<MMAA>-e.pdf`, na pasta do ano-café (outubro a setembro)
//     do mês. Exceção real: o de set/2024 está na pasta do ano-café SEGUINTE (cy2024-25): a pasta seguinte é a 2ª
//     tentativa. 165 relatórios de out/2012 a ago/2026; antes de out/2012, 404.
//   - As tabelas de preços e de estoques mudam de número, de layout e às vezes são imagem (ver o parser). Em 2012 não
//     há tabela de estoques (era um gráfico).
//   - A fonte REVISA e corrige os próprios erros no relatório seguinte: Nova York de set/2020 saiu 2,45 (digitação) e
//     foi a 1,26 no de outubro; preços mudam em centésimos (Brazilian Naturals de jun/2021: 148,12 → 148,18). Cada
//     relatório é uma edição, e a correção fica com a data do relatório que a trouxe.
//
// SÉRIES `ICO.CAFE.PRECO_<GRUPO>` (US¢/lb) e `ICO.CAFE.ESTOQUE_<BOLSA>` (milhões de sacas), observed_at = 1º dia do
// mês. Cada relatório repete de 12 a 14 meses: é o vintage. O 1º relatório que traz um mês é o dele mesmo, então a
// versão de cada mês tem a data do relatório do próprio mês; os seguintes só confirmam (mesmo valor, ignorado).
//
// PUBLISHED_AT: o `Last-Modified` do PDF, REAL quando cai até DIAS_LM_VALIDO dias depois do fim do mês (de out/2023
// em diante: de 3 a 38 dias, mediana ~14). Os relatórios anteriores têm o `Last-Modified` das migrações do site
// (2023-02-20 e 2025-04-09): aí a data é ESTIMADA em DIAS_ESTIMADOS dias depois do fim do mês (acima do maior atraso
// visto: conservador, nunca antes da publicação). A estimativa é a data da EDIÇÃO ("edition_lag_rule"): a correção que
// o relatório traz para um mês anterior fica com ela, e não com a data da coleta (point-in-time.service.js).

const URL_BASE = "https://www.ico.org/documents";
const SOURCE_CODE = "ICO_CMR";
const PREFIXO_SERIE = "ICO.CAFE";
const SERIE_REFERENCIA = `${PREFIXO_SERIE}.PRECO_I_CIP`;
const PRIMEIRO_MES = "2012-10";
const DIAS_LM_VALIDO = 60;
const DIAS_ESTIMADOS = 45;
const PAUSA_MS = 2_000;
const TAMANHO_MINIMO_PDF = 50_000;
const ASSINATURA_PDF = "%PDF";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
const DIA_MS = 24 * 60 * 60 * 1000;
// Coleta diária: os relatórios dos MESES_NA_COLETA_DIARIA meses anteriores ao corrente que ainda não estão no banco
// (o de um mês sai entre 3 e 38 dias depois do fim dele).
const MESES_NA_COLETA_DIARIA = 2;
const TIMEOUT_MS = 30 * 60 * 1000;

const NOMES_PRECO = {
  I_CIP: "ICO Composite Indicator Price (I-CIP)",
  COLOMBIAN_MILDS: "Colombian Milds",
  OTHER_MILDS: "Other Milds",
  BRAZILIAN_NATURALS: "Brazilian Naturals",
  ROBUSTAS: "Robustas",
  NOVA_YORK: "Futuro de Nova York (média da 2ª e 3ª posições)",
  LONDRES: "Futuro de Londres (média da 2ª e 3ª posições)"
};

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mesAnterior(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

// Meses de `inicio` a `fim` ("AAAA-MM"), em ordem.
function mesesEntre(inicio, fim) {
  const meses = [];
  for (let m = inicio; m <= fim; m = mesSeguinte(m)) meses.push(m);
  return meses;
}

// Ano-café (outubro a setembro) que contém o mês: "2026-08" -> 2025 (cy2025-26).
function anoCafe(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return m >= 10 ? ano : ano - 1;
}

function pasta(anoInicial) {
  return `cy${anoInicial}-${String(anoInicial + 1).slice(2)}`;
}

// URLs a tentar, em ordem: a pasta do ano-café do mês e a seguinte (set/2024 está em cy2024-25).
function urlsDoMes(mes) {
  const [ano, m] = mes.split("-");
  const arquivo = `cmr-${m}${ano.slice(2)}-e.pdf`;
  const inicial = anoCafe(mes);
  return [inicial, inicial + 1].map((a) => `${URL_BASE}/${pasta(a)}/${arquivo}`);
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

// Um mês -> { mes, url, ultimaModificacao, precos, estoques, problemas } | { mes, erro } | null (ainda não publicado).
// O PDF é lido aqui (o `parse` do runner é síncrono, e só as tabelas seguem: o PDF tem até 2 MB). Falha de rede ou
// HTTP propaga; PDF ilegível vira `erro` daquele mês.
async function baixarMes(mes, { signal, fetchFn = fetch, esperar = aguardar } = {}) {
  for (const [i, url] of urlsDoMes(mes).entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    const response = await buscar(url, { signal, fetchFn });
    if (!response) continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < TAMANHO_MINIMO_PDF || buffer.subarray(0, 4).toString("latin1") !== ASSINATURA_PDF) {
      throw new UpstreamServiceError(`O relatório da ICO de ${mes} não parece um PDF (${buffer.length} bytes).`);
    }
    const ultimaModificacao = response.headers?.get?.("last-modified") || null;
    try {
      return { mes, url, ultimaModificacao, ...lerRelatorio(await lerPdf(buffer), mes) };
    } catch (err) {
      return { mes, url, erro: `Falha ao ler o PDF: ${err.message}` };
    }
  }
  return null;
}

async function baixarMeses(meses, { signal, fetchFn, esperar = aguardar } = {}) {
  const relatorios = [];
  const naoPublicados = [];
  for (const [i, mes] of meses.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    const relatorio = await baixarMes(mes, { signal, fetchFn, esperar });
    if (relatorio) relatorios.push(relatorio);
    else naoPublicados.push(mes);
  }
  return { relatorios, naoPublicados };
}

function mesDe(data) {
  return data.toISOString().slice(0, 7);
}

// Coleta diária: os meses recentes cujo relatório ainda não está no banco.
async function download({ signal, fetchFn, esperar, agora = new Date(), deps = {} } = {}) {
  const repo = deps.observationRepository || observationRepository;
  const fim = mesAnterior(mesDe(agora));
  const meses = mesesEntre(mesesAntes(fim, MESES_NA_COLETA_DIARIA - 1), fim);
  const jaNoBanco = await repo.buscarUltimasVersoes(SERIE_REFERENCIA, { transaction: deps.transaction });
  return baixarMeses(meses.filter((m) => !jaNoBanco.has(`${m}-01`)), { signal, fetchFn, esperar });
}

function mesesAntes(mes, n) {
  let m = mes;
  for (let i = 0; i < n; i += 1) m = mesAnterior(m);
  return m;
}

// Backfill: os relatórios de `mesInicial` a `mesFinal`, em ordem.
function downloadIntervalo({ mesInicial = PRIMEIRO_MES, mesFinal, signal, fetchFn, esperar } = {}) {
  const inicio = mesInicial < PRIMEIRO_MES ? PRIMEIRO_MES : mesInicial;
  return baixarMeses(mesesEntre(inicio, mesFinal), { signal, fetchFn, esperar });
}

function parse(rawData) {
  if (!Array.isArray(rawData?.relatorios)) throw new UpstreamServiceError("Download da ICO em formato inesperado.");
  return rawData.relatorios;
}

// Último instante do mês, em UTC.
function fimDoMes(mes) {
  return new Date(Date.parse(`${mesSeguinte(mes)}-01T00:00:00Z`) - 1000);
}

// published_at: o `Last-Modified`, se cair entre o fim do mês e DIAS_LM_VALIDO dias depois; senão, estimado.
function publicacao(mes, ultimaModificacao) {
  const fim = fimDoMes(mes);
  const lm = ultimaModificacao ? new Date(ultimaModificacao) : null;
  if (lm && !Number.isNaN(lm.getTime()) && lm > fim && lm - fim <= DIAS_LM_VALIDO * DIA_MS) {
    return { published_at: lm, published_at_is_estimated: false, published_at_basis: "source" };
  }
  return { published_at: new Date(fim.getTime() + DIAS_ESTIMADOS * DIA_MS), published_at_is_estimated: true, published_at_basis: "edition_lag_rule" };
}

function normalize(relatorios) {
  const validos = [];
  const invalidos = [];
  for (const r of relatorios) {
    if (r.erro) {
      invalidos.push({ item: { mes: r.mes }, motivo: r.erro });
      continue;
    }
    for (const motivo of r.problemas) invalidos.push({ item: { mes: r.mes }, motivo: `relatório de ${r.mes}: ${motivo}` });
    const pub = publicacao(r.mes, r.ultimaModificacao);
    const metadata = (extra) => ({ fonte: "ICO - Coffee Market Report", produto: "cafe", relatorio: r.mes, url: r.url, ...extra });
    for (const { mes, valores } of r.precos) {
      for (const { codigo } of COLUNAS_PRECO) {
        validos.push({
          series_code: `${PREFIXO_SERIE}.PRECO_${codigo}`,
          observed_at: `${mes}-01`,
          value: valores[codigo],
          unit: "US¢/lb",
          source_code: SOURCE_CODE,
          ...pub,
          metadata: metadata({ tabela: 1, serie: NOMES_PRECO[codigo], periodo: "média mensal" })
        });
      }
    }
    for (const { mes, valores } of r.estoques) {
      for (const [codigo, valor] of Object.entries(valores)) {
        validos.push({
          series_code: `${PREFIXO_SERIE}.ESTOQUE_${codigo}`,
          observed_at: `${mes}-01`,
          value: valor,
          unit: "milhões de sacas",
          source_code: SOURCE_CODE,
          ...pub,
          metadata: metadata({ tabela: 5, bolsa: codigo === "NOVA_YORK" ? "ICE Futures U.S." : "ICE Futures Europe", periodo: "fim do mês" })
        });
      }
    }
  }
  // Em ordem de publicação: um mês entra com a data do 1º relatório que o traz.
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos };
}

const mensagemSemCarga = ({ series, valores }) =>
  `Carga histórica da ICO ainda não feita para ${series} série(s) (${valores} valores não gravados): rode "npm run backfill:ico-cafe" antes da coleta diária.`;

const persist = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: true, mensagemSemCarga });
const persistirBackfill = (validos, contexto, deps = {}) =>
  persistirPorEdicao(validos, contexto, deps, { sourceCode: SOURCE_CODE, exigirCargaInicial: false, mensagemSemCarga });

module.exports = {
  codigo: "ico-cafe",
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
  urlsDoMes,
  mesesEntre,
  publicacao,
  SOURCE_CODE,
  PRIMEIRO_MES,
  PAUSA_MS
};
