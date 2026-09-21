"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { somarDias, proximaSegunda, diaDaSemanaIso, paraDate } = require("../../shared/utils/date-utils");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { persistirObservacoes } = require("../base/persist-observations");

// USDA NASS Crop Progress (milho, nível nacional, semanal) via a API
// QuickStats. EXIGE chave gratuita (NASS_API_KEY) - sem ela o coletor não é
// registrado (ver collectors/index.js).
//
// STATUS DE VALIDAÇÃO: validado contra a API real em 2026-09-20/21 (ADR 0009):
// 6.758 linhas, 12 séries, 0 falhas. Os nomes de campo (week_ending, Value,
// unit_desc, statisticcat_desc, load_time) são os da documentação do QuickStats.
//
// Observáveis: CONDITION (% da lavoura por classe: VERY POOR..EXCELLENT) e
// PROGRESS (% plantado/emergido/...). Código: USDA.CORN.<CATEGORIA>.<CLASSE>.
//
// published_at: o Crop Progress sai às 16:00 ET no PRIMEIRO DIA ÚTIL da
// semana - normalmente segunda, mas terça quando a segunda é feriado federal
// (Memorial Day, Labor Day, Columbus Day, ...). O QuickStats traz `load_time`,
// mas o histórico foi carregado em lote e o fuso não é documentado - fica
// guardado em metadata para validar depois, e o published_at é a regra acima,
// marcada ESTIMADA.

const URL_BASE = "https://quickstats.nass.usda.gov/api/api_GET/";
const SOURCE_CODE = "USDA_NASS";
// 1980 é o piso real do QuickStats para o milho (confirmado em 2026-09-21: pedir
// desde 1900 devolve as mesmas linhas que desde 1980). Cada série começa no seu ano.
const ANO_INICIAL_PADRAO = 1980;
const CATEGORIAS = ["CONDITION", "PROGRESS"];

// n-ésima segunda-feira de um mês (n=1..5) ou a última (n=-1).
function enesimaSegunda(ano, mes, n) {
  const segundas = [];
  for (let dia = 1; dia <= 31; dia += 1) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1) break;
    if (d.getUTCDay() === 1) segundas.push(d.toISOString().slice(0, 10));
  }
  return n === -1 ? segundas[segundas.length - 1] : segundas[n - 1];
}

// Feriado federal fixo que cai num domingo é observado na segunda seguinte.
function feriadoFixoObservadoNaSegunda(segundaIso, mes, dia) {
  const [ano] = segundaIso.split("-").map(Number);
  const feriado = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return segundaIso === feriado || somarDias(segundaIso, -1) === feriado;
}

function segundaEhFeriadoFederalEUA(segundaIso) {
  const [ano, mes] = segundaIso.split("-").map(Number);
  if (mes === 5 && segundaIso === enesimaSegunda(ano, 5, -1)) return true; // Memorial Day
  if (mes === 9 && segundaIso === enesimaSegunda(ano, 9, 1)) return true; // Labor Day
  if (mes === 10 && segundaIso === enesimaSegunda(ano, 10, 2)) return true; // Columbus / Indigenous Peoples' Day
  return (
    (mes === 6 && ano >= 2021 && feriadoFixoObservadoNaSegunda(segundaIso, 6, 19)) || // Juneteenth
    (mes === 7 && feriadoFixoObservadoNaSegunda(segundaIso, 7, 4)) || // Independence Day
    (mes === 11 && feriadoFixoObservadoNaSegunda(segundaIso, 11, 11)) // Veterans Day
  );
}

// week_ending é o domingo; a divulgação é o primeiro dia útil depois dele.
function dataDeDivulgacao(weekEnding) {
  const segunda = proximaSegunda(weekEnding);
  return segundaEhFeriadoFederalEUA(segunda) ? somarDias(segunda, 1) : segunda;
}

function publicadoEm(weekEnding) {
  return zonedParaUtc(dataDeDivulgacao(weekEnding), "16:00", "America/New_York");
}

async function download({ signal }) {
  if (!env.collectors.nassApiKey) {
    throw new UpstreamServiceError("NASS_API_KEY não configurada - o Crop Progress precisa da chave gratuita do QuickStats (https://quickstats.nass.usda.gov/api).");
  }

  const linhas = [];
  for (const categoria of CATEGORIAS) {
    const params = new URLSearchParams({
      key: env.collectors.nassApiKey,
      source_desc: "SURVEY",
      sector_desc: "CROPS",
      commodity_desc: "CORN",
      statisticcat_desc: categoria,
      agg_level_desc: "NATIONAL",
      freq_desc: "WEEKLY",
      year__GE: String(process.env.NASS_ANO_INICIAL || ANO_INICIAL_PADRAO),
      format: "JSON"
    });

    let response;
    try {
      response = await fetch(`${URL_BASE}?${params}`, { signal });
    } catch (err) {
      throw new UpstreamServiceError(`Falha de rede ao consultar o USDA NASS: ${err.message}`);
    }
    if (!response.ok) {
      throw new UpstreamServiceError(`USDA NASS respondeu com status ${response.status} (${categoria}).`);
    }
    const corpo = await response.json();
    linhas.push(...(corpo.data || []));
  }
  return linhas;
}

function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do USDA NASS em formato inesperado (esperava um array).");
  }
  // O QuickStats usa "(D)" (omitido), "(NA)", "(Z)"... onde não há número:
  // é ausência de dado, não observação.
  return rawData.filter((r) => r?.Value !== undefined && !String(r.Value).startsWith("("));
}

function classeDe(unitDesc) {
  return String(unitDesc || "")
    .replace(/^PCT\s+/, "")
    .trim()
    .replace(/\s+/g, "_");
}

function normalize(rawItems) {
  const validos = [];
  const invalidos = [];

  for (const r of rawItems) {
    const valor = Number(String(r.Value).replace(/,/g, ""));
    const classe = classeDe(r.unit_desc);
    const semanaOk = /^\d{4}-\d{2}-\d{2}$/.test(r.week_ending || "");

    if (!semanaOk || !CATEGORIAS.includes(r.statisticcat_desc) || !classe) {
      invalidos.push({ item: r, motivo: "week_ending, statisticcat_desc ou unit_desc ausente/inesperado." });
      continue;
    }
    if (!Number.isFinite(valor)) {
      invalidos.push({ item: r, motivo: `Value inválido: "${r.Value}".` });
      continue;
    }
    try {
      paraDate(r.week_ending);
    } catch {
      invalidos.push({ item: r, motivo: `week_ending inválido: "${r.week_ending}".` });
      continue;
    }

    validos.push({
      series_code: `USDA.CORN.${r.statisticcat_desc}.${classe}`,
      observed_at: r.week_ending,
      value: valor,
      unit: "pct",
      source_code: SOURCE_CODE,
      published_at: publicadoEm(r.week_ending),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: {
        fonte: "USDA NASS Crop Progress (QuickStats)",
        regraPublicacao: "primeiro_dia_util_da_semana_1600_ET",
        diaDaSemanaDivulgacao: diaDaSemanaIso(dataDeDivulgacao(r.week_ending)),
        shortDesc: r.short_desc,
        loadTime: r.load_time
      }
    });
  }

  return { validos, invalidos };
}

module.exports = {
  codigo: "usda-nass-crop-progress-milho",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist: persistirObservacoes,
  dataDeDivulgacao,
  segundaEhFeriadoFederalEUA
};
