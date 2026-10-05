"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const logger = require("../../shared/logger");
const { UpstreamServiceError } = require("../../shared/errors");
const { paraIso, somarDias, diaDaSemanaIso } = require("../../shared/utils/date-utils");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const observationRepository = require("../../repositories/observation.repository");
const { persistirObservacoes } = require("../base/persist-observations");
const { lerRelatorio } = require("./ice-cafe-estoques.parser");

// ICE Futures U.S. - estoques certificados do café "C" (arábica), um XLS por pregão desde 2016-01-04: sacas
// certificadas por país de origem e o total. Fator do café "Estoque global e certificado (ICE)", peso Alto. ADR 0032.
//
// TERMOS DE USO (lidos em 2026-09-28): a licença do site é "personal, non-commercial use" e "does not include use of
// any data mining, robots or similar data gathering or extraction methods". A coleta automatizada fere essa cláusula;
// o usuário decidiu coletar mesmo assim, com o risco registrado no ADR. Por isso o coletor é o mais contido possível:
//   - um pedido por vez, com PAUSA_MS entre eles, e só dos dias que ainda não estão no banco;
//   - 429 (o Cloudflare da ICE limita a ~2-3 downloads seguidos): espera o `Retry-After` ou um recuo crescente e
//     tenta de novo; se continuar, PARA e grava o que já baixou (aviso na execução), sem nenhuma técnica de evasão
//     (nada de trocar IP ou fingir navegador: o user-agent é o do FinMind).
//
// VERIFICADO POR CHAMADA REAL em 2026-09-28 (ver o ADR): arquivos de 2016-01-04, 2021-07-21 e 2026-09-25 lidos, com a
// soma das origens igual ao total (1.730.059, 2.190.238 e 254.304 sacas); dia sem pregão responde 404; o
// `Last-Modified` guarda o horário original de cada arquivo (2016-01-04 18:41:28 GMT, ~5 min depois do "As of").
//
// SÉRIES `ICE.CAFE_C.ESTOQUE.<ORIGEM>.CERTIFICADO` (sacas), com `TOTAL` para o total certificado. observed_at = o
// pregão do arquivo (conferido com o "As of").
// `ICE.CAFE_C.ESTOQUE.TOTAL.PENDENTE` (sacas): o total do bloco "Pending Grading Report", as sacas entregues para
// classificação e ainda não classificadas (ADR 0061; só o total: o bloco muda de formato com os anos). Mesmas datas. published_at = o `Last-Modified` (REAL: quando o arquivo ficou
// disponível); sem ele, o "As of" em Nova York, ESTIMADO. A série não revisa (é a foto do dia).

const URL_BASE = "https://www.ice.com/publicdocs/futures_us_reports/coffee";
const SOURCE_CODE = "ICE_COFFEE_CERT";
const PREFIXO_SERIE = "ICE.CAFE_C.ESTOQUE";
const SERIE_TOTAL = `${PREFIXO_SERIE}.TOTAL.CERTIFICADO`;
const SERIE_PENDENTE = `${PREFIXO_SERIE}.TOTAL.PENDENTE`;
const PRIMEIRA_DATA = "2016-01-04";
const FUSO = "America/New_York";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
const PAUSA_MS = 20_000;
// Recuo depois de um 429 sem `Retry-After` (1, 2, 5 e 10 min no backfill; 1 e 2 min na coleta diária, para caber no
// timeout); esgotado, a execução para e grava o que tem.
const RECUOS_429_MS = [60_000, 120_000, 300_000, 600_000];
const RECUOS_429_DIARIA_MS = [60_000, 120_000];
// O arquivo do dia sai por volta das 13h20 de Nova York: antes das 18h UTC, o dia mais recente a pedir é o anterior.
const HORA_UTC_DISPONIVEL = 18;
// Coleta diária: os dias úteis dos últimos JANELA_DIAS que faltam no banco, no máximo MAX_ARQUIVOS_DIARIA por execução
// (o cron roda 3 vezes por dia; um dia que falhe volta na execução seguinte).
const JANELA_DIAS = 7;
const MAX_ARQUIVOS_DIARIA = 3;
const TIMEOUT_MS = 20 * 60 * 1000;

function aguardarPadrao(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function urlDoDia(dataIso) {
  return `${URL_BASE}/coffee_cert_stock_${dataIso.replace(/-/g, "")}.xls`;
}

// Dias úteis (segunda a sexta) de `inicio` a `fim`, em ordem.
function diasUteis(inicio, fim) {
  const dias = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    if (diaDaSemanaIso(d) <= 5) dias.push(d);
  }
  return dias;
}

function esperaDo429(response, tentativa, recuos) {
  const segundos = Number(response.headers?.get?.("retry-after"));
  if (Number.isFinite(segundos) && segundos > 0) return Math.min(segundos * 1000, RECUOS_429_MS.at(-1));
  return recuos[tentativa];
}

// Um dia -> { data, buffer, ultimaModificacao } | { data, semArquivo: true } (404: sem pregão) | { data, limitado: true }
// (429 que não passou). Outro erro HTTP ou de rede = UpstreamServiceError.
async function baixarDia(data, { signal, fetchFn, esperar, recuos }) {
  const url = urlDoDia(data);
  for (let tentativa = 0; ; tentativa += 1) {
    let response;
    try {
      response = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
    } catch (err) {
      throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
    }
    if (response.status === 404) return { data, semArquivo: true };
    if (response.status === 429) {
      if (tentativa >= recuos.length) return { data, limitado: true };
      const espera = esperaDo429(response, tentativa, recuos);
      logger.warn({ data, tentativa: tentativa + 1, esperaMs: espera }, "ICE respondeu 429: aguardando antes de tentar de novo");
      await esperar(espera);
      continue;
    }
    if (!response.ok) {
      throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status} (${new URL(url).pathname}).`);
    }
    return { data, buffer: Buffer.from(await response.arrayBuffer()), ultimaModificacao: response.headers?.get?.("last-modified") || null };
  }
}

/**
 * Baixa, em ordem, os `dias` que ainda não estão no banco (na `serie` de referência: o total certificado, ou o
 * pendente no backfill que completa essa série), um por vez, até `maxArquivos`. Um 429 persistente
 * encerra o lote: os dias já baixados seguem para gravação e o resto vira aviso (a próxima execução retoma).
 */
async function baixarDias(dias, { signal, fetchFn = fetch, esperar = aguardarPadrao, maxArquivos = Infinity, recuos = RECUOS_429_MS, serie = SERIE_TOTAL, deps = {} } = {}) {
  const repo = deps.observationRepository || observationRepository;
  const jaNoBanco = await repo.buscarUltimasVersoes(serie, { transaction: deps.transaction });
  const pendentes = dias.filter((d) => !jaNoBanco.has(d)).slice(0, maxArquivos);

  const arquivos = [];
  const semArquivo = [];
  let naoBaixados = [];
  for (const [i, data] of pendentes.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    const resultado = await baixarDia(data, { signal, fetchFn, esperar, recuos });
    if (resultado.limitado) {
      naoBaixados = pendentes.slice(i);
      break;
    }
    if (resultado.semArquivo) semArquivo.push(data);
    else arquivos.push(resultado);
  }
  return { arquivos, semArquivo, naoBaixados };
}

// Último dia cujo arquivo já deve existir no instante `agora`.
function ultimoDiaDisponivel(agora = new Date()) {
  const hoje = paraIso(agora);
  return agora.getUTCHours() >= HORA_UTC_DISPONIVEL ? hoje : somarDias(hoje, -1);
}

// Coleta diária: os dias úteis da última semana que faltam no banco.
async function download({ signal, fetchFn, esperar, agora = new Date(), deps } = {}) {
  const fim = ultimoDiaDisponivel(agora);
  return baixarDias(diasUteis(somarDias(fim, -JANELA_DIAS), fim), {
    signal,
    fetchFn,
    esperar,
    maxArquivos: MAX_ARQUIVOS_DIARIA,
    recuos: RECUOS_429_DIARIA_MS,
    deps
  });
}

// Backfill: um intervalo inteiro (o script divide em blocos, e cada bloco grava ao terminar). Com `serie` =
// SERIE_PENDENTE, pede de novo os dias que já têm o certificado e ainda não têm o pendente (o certificado relido é o
// mesmo valor e a gravação o ignora).
async function downloadIntervalo({ dataInicial, dataFinal, signal, fetchFn, esperar, serie, deps } = {}) {
  const inicio = dataInicial < PRIMEIRA_DATA ? PRIMEIRA_DATA : dataInicial;
  return baixarDias(diasUteis(inicio, dataFinal), { signal, fetchFn, esperar, serie, deps });
}

function parse(rawData) {
  const entradas = [];
  for (const arquivo of rawData?.arquivos ?? []) {
    try {
      entradas.push({ data: arquivo.data, ultimaModificacao: arquivo.ultimaModificacao, relatorio: lerRelatorio(arquivo.buffer) });
    } catch (err) {
      entradas.push({ invalido: { item: { data: arquivo.data }, motivo: err.message } });
    }
  }
  for (const data of rawData?.naoBaixados ?? []) {
    entradas.push({ aviso: { item: { data }, motivo: "não baixado: a ICE continuou respondendo 429 (limite de requisições); fica para a próxima execução." } });
  }
  return entradas;
}

// published_at: o `Last-Modified`, se for um instante válido entre o "As of" e 3 dias depois (uma correção
// republicada fica com a data da correção: o de 2018-06-06 saiu corrigido em 2018-06-08); senão, o "As of", estimado.
// Sem horário no "As of", a janela começa às 00:00 de Nova York e a estimativa é o fim do dia de lá (conservador).
function publicacao(asOf, ultimaModificacao) {
  const inicio = zonedParaUtc(asOf.data, asOf.horario ?? "00:00:00", FUSO);
  const estimado = asOf.horario ? inicio : zonedParaUtc(asOf.data, "23:59:59", FUSO);
  const lm = ultimaModificacao ? new Date(ultimaModificacao) : null;
  const valido = lm && !Number.isNaN(lm.getTime()) && lm >= inicio && lm - inicio <= 3 * 24 * 3600 * 1000;
  return valido
    ? { published_at: lm, published_at_is_estimated: false, published_at_basis: "source" }
    : { published_at: estimado, published_at_is_estimated: true, published_at_basis: "lag_rule" };
}

function normalize(entradas) {
  const validos = [];
  const invalidos = [];
  const avisos = [];

  for (const { data, ultimaModificacao, relatorio, invalido, aviso } of entradas) {
    if (invalido) {
      invalidos.push(invalido);
      continue;
    }
    if (aviso) {
      avisos.push(aviso);
      continue;
    }
    if (relatorio.asOf.data !== data) {
      invalidos.push({ item: { data }, motivo: `o arquivo do dia ${data} diz "As of" ${relatorio.asOf.data}.` });
      continue;
    }
    const pub = publicacao(relatorio.asOf, ultimaModificacao);
    const linhas = [...relatorio.origens, { codigo: "TOTAL", nome: "Total in Bags", sacas: relatorio.total }];
    if (relatorio.pendente !== null) {
      linhas.push({ codigo: "TOTAL", nome: "Pending Grading Report", sacas: relatorio.pendente, campo: "PENDENTE" });
    } else {
      avisos.push({ item: { data }, motivo: `sacas pendentes de classificação não gravadas: ${relatorio.motivoPendente}` });
    }
    for (const o of linhas) {
      validos.push({
        series_code: `${PREFIXO_SERIE}.${o.codigo}.${o.campo ?? "CERTIFICADO"}`,
        observed_at: data,
        value: o.sacas,
        unit: "sacas",
        source_code: SOURCE_CODE,
        ...pub,
        metadata: {
          fonte: 'ICE Futures U.S. - Coffee "C" Certified Warehouse Stock Report',
          produto: "cafe",
          origem: o.nome,
          asOf: `${relatorio.asOf.data} ${relatorio.asOf.horario ?? "(sem horário)"} ${FUSO}`,
          ...(relatorio.asOf.observacao ? { observacaoDaFonte: relatorio.asOf.observacao } : {})
        }
      });
    }
  }
  return { validos, invalidos, avisos };
}

const persist = (validos, contexto, deps = {}) => persistirObservacoes(validos, contexto, deps);

module.exports = {
  codigo: "ice-cafe-estoques",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist,
  diasUteis,
  urlDoDia,
  ultimoDiaDisponivel,
  SOURCE_CODE,
  SERIE_TOTAL,
  SERIE_PENDENTE,
  PRIMEIRA_DATA,
  PAUSA_MS
};
