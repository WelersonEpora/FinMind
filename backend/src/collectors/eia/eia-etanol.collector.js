"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { somarDias, diaDaSemanaIso, fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes } = require("../base/persist-observations");
const XLSX = require("xlsx");

// EIA (U.S. Energy Information Administration) - produção e estoques SEMANAIS de etanol combustível dos EUA, do
// Weekly Petroleum Status Report (WPSR). Fator do milho "Demanda de etanol e biocombustível" do FEL 1
// (`controle_fatores.xlsx`: fontes "EIA, USDA"; dados "Produção de etanol, estoques"). ADR 0024.
//
// VERIFICADO POR CHAMADA REAL em 2026-09-23:
//   - A API v2 (api.eia.gov) exige chave (403 API_KEY_MISSING). O MESMO dado sai, sem chave, na planilha histórica de
//     cada série (`/dnav/pet/hist_xls/<SOURCEKEY>w.xls`, ~65 KB, aba "Data 1": data da semana + valor); `robots.txt` não
//     restringe `/dnav/`. Semanas desde 2010-06-04, encerradas na sexta.
//   - W_EPOOXE_YOP_NUS_MBBLD = "Weekly U.S. Oxygenate Plant Production of Fuel Ethanol (Thousand Barrels per Day)";
//     W_EPOOXE_SAE_NUS_MBBL = "Weekly U.S. Ending Stocks of Fuel Ethanol (Thousand Barrels)".
//   - Na quarta 23/09/2026 a última semana era a de sexta 18/09 (`Last-Modified` 15:49 UTC).
//
// published_at (ESTIMADO): as tabelas XLS saem "após 10:30 ET de quarta" (página oficial de calendário do WPSR), e
// em semanas com feriado a divulgação atrasa. Vale, nesta ordem: (1) a data alternativa da própria página de
// calendário (exceções de feriado, ~2 anos), lida a cada coleta; (2) a regra: quarta seguinte à sexta da semana,
// quinta se houver feriado federal de segunda a quarta. Sempre o FIM DO DIA (UTC) - conservador em relação às
// 10:30-17:00 ET. Limite conhecido: fechamentos extraordinários (ex.: Natal de 2025, divulgado 10 dias depois) só são
// conhecidos pela página, então no histórico antigo a regra pode antecipar semanas de Natal/Ano-Novo.
//
// A planilha traz só o valor ATUAL de cada semana (sem versões): uma revisão que apareça depois vira versão nova com
// `collected_at` (ADR 0008). A coleta baixa a série inteira (2 x ~65 KB): a primeira execução já é a carga histórica.

const URL_XLS = "https://www.eia.gov/dnav/pet/hist_xls";
const URL_CALENDARIO = "https://www.eia.gov/petroleum/supply/weekly/schedule.php";
const SOURCE_CODE = "EIA";
const PREFIXO_SERIE = "EIA.ETANOL";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";

const SERIES = [
  { sourcekey: "W_EPOOXE_YOP_NUS_MBBLD", campo: "PRODUCAO", unit: "mil barris/dia", nome: "Weekly U.S. Oxygenate Plant Production of Fuel Ethanol" },
  { sourcekey: "W_EPOOXE_SAE_NUS_MBBL", campo: "ESTOQUES", unit: "mil barris", nome: "Weekly U.S. Ending Stocks of Fuel Ethanol" }
];

const MESES_EN = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const MESES_EN_LONGO = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12
};

function iso(ano, mes, dia) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// "Jun 04, 2010" -> "2010-06-04"
function paraIsoDeDataEia(texto) {
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(String(texto).trim());
  if (!m || !MESES_EN[m[1]]) return null;
  return iso(Number(m[3]), MESES_EN[m[1]], Number(m[2]));
}

// ---------------------------------------------------------------- feriados federais dos EUA

function enesimoDiaDaSemana(ano, mes, diaSemanaIso, n) {
  const dias = [];
  for (let dia = 1; dia <= 31; dia += 1) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1) break;
    const data = d.toISOString().slice(0, 10);
    if (diaDaSemanaIso(data) === diaSemanaIso) dias.push(data);
  }
  return n === -1 ? dias[dias.length - 1] : dias[n - 1];
}

// Feriado fixo no sábado é observado na sexta; no domingo, na segunda.
function observado(data) {
  const dow = diaDaSemanaIso(data);
  if (dow === 6) return somarDias(data, -1);
  if (dow === 7) return somarDias(data, 1);
  return data;
}

function feriadosFederaisEUA(ano) {
  return new Set([
    observado(iso(ano, 1, 1)), // New Year's Day
    enesimoDiaDaSemana(ano, 1, 1, 3), // Martin Luther King Jr. Day
    enesimoDiaDaSemana(ano, 2, 1, 3), // Presidents' Day
    enesimoDiaDaSemana(ano, 5, 1, -1), // Memorial Day
    ...(ano >= 2021 ? [observado(iso(ano, 6, 19))] : []), // Juneteenth
    observado(iso(ano, 7, 4)), // Independence Day
    enesimoDiaDaSemana(ano, 9, 1, 1), // Labor Day
    enesimoDiaDaSemana(ano, 10, 1, 2), // Columbus Day
    observado(iso(ano, 11, 11)), // Veterans Day
    enesimoDiaDaSemana(ano, 11, 4, 4), // Thanksgiving
    observado(iso(ano, 12, 25)), // Christmas
    observado(iso(ano + 1, 1, 1)) // Ano-Novo do ano seguinte observado em 31/12
  ]);
}

function ehFeriado(data) {
  const ano = Number(data.slice(0, 4));
  return feriadosFederaisEUA(ano).has(data) || feriadosFederaisEUA(ano - 1).has(data);
}

// Regra: quarta seguinte à sexta da semana; quinta se houver feriado federal de segunda a quarta da semana da divulgação.
function divulgacaoPelaRegra(semana) {
  const quarta = somarDias(semana, 5);
  const segunda = somarDias(quarta, -2);
  const temFeriado = [segunda, somarDias(segunda, 1), quarta].some(ehFeriado);
  return temFeriado ? somarDias(quarta, 1) : quarta;
}

// ---------------------------------------------------------------- calendário oficial (exceções de feriado)

// Página HTML -> Map(semana ISO -> data alternativa ISO). Tabela "Data for the week ending | Alternate release date |
// Release day | Release time | Holiday". Página fora do formato devolve Map vazio (vale a regra).
function extrairExcecoes(html) {
  const texto = String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const data = "(January|February|March|April|May|June|July|August|September|October|November|December) (\\d{1,2}), (\\d{4})";
  const excecoes = new Map();
  for (const m of texto.matchAll(new RegExp(`${data} ${data} (Monday|Tuesday|Wednesday|Thursday|Friday)`, "g"))) {
    const semana = iso(Number(m[3]), MESES_EN_LONGO[m[1]], Number(m[2]));
    const alternativa = iso(Number(m[6]), MESES_EN_LONGO[m[4]], Number(m[5]));
    if (alternativa > semana) excecoes.set(semana, alternativa);
  }
  return excecoes;
}

// ---------------------------------------------------------------- download

async function buscar(url, { signal, fetchFn = fetch }) {
  let resposta;
  try {
    resposta = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar a EIA: ${err.message}`);
  }
  if (!resposta.ok) throw new UpstreamServiceError(`EIA respondeu com status ${resposta.status} (${new URL(url).pathname}).`);
  return resposta;
}

// As duas planilhas + a página de calendário. A página é complementar: se falhar, segue só com a regra.
async function download({ signal, fetchFn } = {}) {
  const planilhas = [];
  for (const serie of SERIES) {
    const resposta = await buscar(`${URL_XLS}/${serie.sourcekey}w.xls`, { signal, fetchFn });
    planilhas.push({ sourcekey: serie.sourcekey, buffer: Buffer.from(await resposta.arrayBuffer()) });
  }
  let calendario = null;
  try {
    calendario = await (await buscar(URL_CALENDARIO, { signal, fetchFn })).text();
  } catch {
    calendario = null;
  }
  return { planilhas, calendario };
}

// ---------------------------------------------------------------- parse / normalize

// Aba "Data 1": linha "Sourcekey" confirma a série; depois, uma linha por semana ("Jun 04, 2010", "839").
function lerPlanilha(buffer, sourcekey) {
  const wb = XLSX.read(buffer);
  const aba = wb.Sheets["Data 1"];
  if (!aba) throw new UpstreamServiceError(`Planilha ${sourcekey} da EIA sem a aba "Data 1".`);
  const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: "", raw: false });
  const chave = linhas.find((l) => l[0] === "Sourcekey")?.[1];
  if (chave !== sourcekey) throw new UpstreamServiceError(`Planilha da EIA traz a série "${chave}", esperava "${sourcekey}".`);
  const inicio = linhas.findIndex((l) => l[0] === "Date") + 1;
  return linhas.slice(inicio).filter((l) => String(l[0]).trim() !== "" || String(l[1]).trim() !== "");
}

function parse(rawData) {
  if (!rawData || !Array.isArray(rawData.planilhas)) {
    throw new UpstreamServiceError("Resposta da EIA em formato inesperado (esperava as planilhas).");
  }
  const excecoes = rawData.calendario ? extrairExcecoes(rawData.calendario) : new Map();
  const itens = [];
  for (const { sourcekey, buffer } of rawData.planilhas) {
    const serie = SERIES.find((s) => s.sourcekey === sourcekey);
    for (const [data, valor] of lerPlanilha(buffer, sourcekey)) itens.push({ serie, data, valor, excecoes });
  }
  return itens;
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  for (const { serie, data, valor, excecoes } of itens) {
    const semana = paraIsoDeDataEia(data);
    if (!semana) {
      invalidos.push({ item: { sourcekey: serie.sourcekey, data, valor }, motivo: `Data em formato inesperado: "${data}".` });
      continue;
    }
    if (diaDaSemanaIso(semana) !== 5) {
      invalidos.push({ item: { sourcekey: serie.sourcekey, data, valor }, motivo: `Semana ${semana} não termina numa sexta (a série é de semanas encerradas na sexta).` });
      continue;
    }
    const numero = String(valor).replace(/,/g, "").trim();
    const value = numero === "" ? NaN : Number(numero);
    if (!Number.isFinite(value) || value < 0) {
      invalidos.push({ item: { sourcekey: serie.sourcekey, data, valor }, motivo: `Valor inválido: "${valor}".` });
      continue;
    }

    const excecao = excecoes.get(semana);
    const divulgacao = excecao ?? divulgacaoPelaRegra(semana);
    validos.push({
      series_code: `${PREFIXO_SERIE}.${serie.campo}`,
      observed_at: semana,
      value,
      unit: serie.unit,
      source_code: SOURCE_CODE,
      published_at: fimDoDiaUtc(divulgacao),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: {
        fonte: "EIA - Weekly Petroleum Status Report",
        sourcekey: serie.sourcekey,
        serie: serie.nome,
        semanaEncerradaEm: semana,
        regraPublicacao: excecao ? "calendario_oficial_de_feriados" : "quarta_ou_quinta_com_feriado"
      }
    });
  }
  return { validos, invalidos };
}

module.exports = {
  codigo: "eia-etanol",
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
  paraIsoDeDataEia,
  divulgacaoPelaRegra,
  extrairExcecoes,
  feriadosFederaisEUA,
  lerPlanilha,
  SERIES,
  SOURCE_CODE,
  PREFIXO_SERIE
};
