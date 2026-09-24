"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { paraIso, somarDias, diaDaSemanaIso, fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// Focus - Relatório de Mercado (BCB): expectativas de IPCA, Selic e câmbio (R$/US$) para os anos-calendário,
// a mediana do boletim semanal. Escopo ESTRITO do relatório FEL 1 ("Relatório Focus e Reservas (BCB)", ligado ao
// ouro em R$: "Focus impacta Selic, IPCA e BRL"). ADR 0022; reconhecimento em docs/reconhecimento-fontes/bcb-focus.md.
//
// VERIFICADO POR CHAMADA REAL em 2026-09-23:
//   - API OData pública do BCB (Olinda), sem chave. Endpoint `ExpectativasMercadoAnuais`: um registro por
//     (Indicador, Data da pesquisa, DataReferencia = ano-alvo, baseCalculo). IPCA, Câmbio e Selic desde 2000-01-03.
//   - "Câmbio" e "Selic" do endpoint anual são o valor de FIM DE ANO (conferido contra o PDF de 2015-01-02, que
//     separa "fim de período" e "média do período": a API tem só o de fim). `IndicadorDetalhe` é sempre nulo.
//   - baseCalculo 0 = respondentes dos últimos 30 dias (o número de destaque do boletim); 1 = últimos 5 dias úteis
//     (legenda do PDF). Só a base 0 é coletada.
//   - A API bate com o PDF do boletim ao centavo (R20260918 e R20150102): a fonte não revisa.
//
// UMA OBSERVAÇÃO POR BOLETIM (semanal): a estatística é calculada todo dia útil, mas a fonte a PUBLICA "todo primeiro
// dia útil da semana" (metadados do conjunto no Portal de Dados Abertos), a semana inteira de uma vez, junto com o
// boletim - na quarta 23/09/2026 a última pesquisa na API era a de sexta 18/09 (`R20260918.pdf`). Em qualquer
// instante, o valor mais recente que se podia conhecer é o do ÚLTIMO dia com pesquisa da semana (o dia do boletim):
// os dias anteriores da mesma semana nunca foram o valor vigente. Por isso só esse dia é gravado.
//
// observed_at = data da pesquisa do boletim (como o COT: dado de terça, publicado na sexta). O horizonte (ano-alvo)
// vai no código da série: `BCB_FOCUS.ANUAL.<ANO>.<IPCA|SELIC|CAMBIO>`. Cada boletim é uma observação nova de cada
// série; nada é sobrescrito.
//
// published_at (ESTIMADO, a fonte não informa o instante): fim do dia (UTC) do PRIMEIRO dia com pesquisa depois da
// semana do boletim. Dia com pesquisa = dia útil do BCB, então feriado sai da própria fonte (07/09/2026 foi segunda e
// feriado: não há pesquisa, e o boletim de 04/09 saiu na terça 08/09). A semana mais recente ainda não tem o dia
// seguinte na fonte: fica SEM published_at e o serviço usa `collected_at` (ADR 0008, nunca uma data anterior
// inventada) - conservador, nunca antecipa.

const URL_BASE = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata";
const ENDPOINT = "ExpectativasMercadoAnuais";
const SOURCE_CODE = "BCB_FOCUS";
const PREFIXO_SERIE = "BCB_FOCUS.ANUAL";
const BASE_CALCULO = 0;
const PRIMEIRA_DATA = "2000-01-03"; // 1ª pesquisa na API para os três indicadores
// Janela da coleta diária: 5 semanas (a semana nova + as anteriores, para a data de publicação da penúltima).
const DIAS_JANELA_DIARIA = 35;
// Limite de linhas por requisição. A série inteira de um indicador tem ~32 mil (2026); se vier cheio, faltou dado.
const LIMITE_LINHAS = 100000;
const TIMEOUT_BACKFILL_MS = 5 * 60 * 1000;

const INDICADORES = [
  { fonte: "IPCA", campo: "IPCA", unit: "%", descricao: "IPCA - variação % no ano" },
  { fonte: "Selic", campo: "SELIC", unit: "% a.a.", descricao: "Selic - fim de ano" },
  { fonte: "Câmbio", campo: "CAMBIO", unit: "R$/US$", descricao: "Câmbio - fim de ano" }
];

const CAMPOS_SELECIONADOS = ["Indicador", "IndicadorDetalhe", "Data", "DataReferencia", "Mediana", "numeroRespondentes", "baseCalculo"];
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_ANO = /^\d{4}$/;

function montarUrl(indicador, { dataInicial, dataFinal }) {
  const filtros = [`Indicador eq '${indicador.fonte}'`, `baseCalculo eq ${BASE_CALCULO}`, `Data ge '${dataInicial}'`];
  if (dataFinal) filtros.push(`Data le '${dataFinal}'`);
  const params = [
    `$filter=${encodeURIComponent(filtros.join(" and "))}`,
    `$select=${CAMPOS_SELECIONADOS.join(",")}`,
    `$orderby=${encodeURIComponent("Data asc")}`,
    `$top=${LIMITE_LINHAS}`,
    "$format=json"
  ];
  return `${URL_BASE}/${ENDPOINT}?${params.join("&")}`;
}

// Uma requisição por indicador (a série inteira de um indicador cabe numa resposta de ~3 s).
async function downloadIntervalo({ dataInicial = PRIMEIRA_DATA, dataFinal, signal, baixarFn = baixar } = {}) {
  const respostas = [];
  for (const indicador of INDICADORES) {
    const url = montarUrl(indicador, { dataInicial, dataFinal });
    respostas.push({ indicador: indicador.fonte, url, corpo: await baixarFn(url, { signal, as: "json" }) });
  }
  return respostas;
}

function download({ signal, baixarFn, hoje = paraIso(new Date()) } = {}) {
  return downloadIntervalo({ dataInicial: somarDias(hoje, -DIAS_JANELA_DIARIA), signal, baixarFn });
}

// Segunda-feira da semana (ISO) de uma data.
function inicioDaSemana(dataIso) {
  return somarDias(dataIso, 1 - diaDaSemanaIso(dataIso));
}

// Datas de pesquisa -> Map(dia do boletim -> 1º dia com pesquisa depois da semana, ou null se a fonte ainda não
// tem o dia seguinte). Dia do boletim = o último dia com pesquisa de cada semana.
function mapearBoletins(datas) {
  const ordenadas = [...new Set(datas)].sort();
  const boletins = new Map();
  for (let i = 0; i < ordenadas.length; i += 1) {
    const data = ordenadas[i];
    const seguinte = ordenadas[i + 1];
    if (seguinte && inicioDaSemana(seguinte) === inicioDaSemana(data)) continue;
    boletins.set(data, seguinte ?? null);
  }
  return boletins;
}

// Resposta da API -> um item por registro do DIA DO BOLETIM de cada semana, com a data estimada de publicação.
// Registro com data ilegível segue como item com `problema` (vira inválido, não derruba o lote).
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do Focus em formato inesperado (esperava uma resposta por indicador).");
  }
  const itens = [];
  for (const { indicador, url, corpo } of rawData) {
    const registros = corpo?.value;
    if (!Array.isArray(registros)) {
      throw new UpstreamServiceError(`Resposta do Focus (${indicador}) sem a lista "value".`);
    }
    if (registros.length >= LIMITE_LINHAS) {
      throw new UpstreamServiceError(`Resposta do Focus (${indicador}) veio com ${registros.length} linhas, o limite pedido: pode ter faltado dado.`);
    }

    const comData = registros.filter((r) => REGEX_DATA.test(r?.Data));
    for (const r of registros.filter((x) => !REGEX_DATA.test(x?.Data))) {
      itens.push({ indicador, registro: r, problema: `Data da pesquisa em formato inesperado: "${r?.Data}".` });
    }

    const boletins = mapearBoletins(comData.map((r) => r.Data));
    for (const r of comData) {
      if (!boletins.has(r.Data)) continue;
      itens.push({ indicador, url, registro: r, diaPublicacao: boletins.get(r.Data) });
    }
  }
  return itens;
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  const vistos = new Set();

  for (const item of itens) {
    const r = item.registro;
    const config = INDICADORES.find((i) => i.fonte === item.indicador);
    const invalido = (motivo) => invalidos.push({ item: { indicador: item.indicador, ...r }, motivo });

    if (item.problema) {
      invalido(item.problema);
      continue;
    }
    if (!config || r.Indicador !== config.fonte) {
      invalido(`Indicador inesperado na resposta: "${r.Indicador}".`);
      continue;
    }
    if (r.IndicadorDetalhe !== null && r.IndicadorDetalhe !== undefined) {
      invalido(`IndicadorDetalhe inesperado ("${r.IndicadorDetalhe}"): a série anual deste indicador deixou de ser única.`);
      continue;
    }
    if (Number(r.baseCalculo) !== BASE_CALCULO) {
      invalido(`baseCalculo inesperado: ${r.baseCalculo}.`);
      continue;
    }
    if (!REGEX_ANO.test(String(r.DataReferencia))) {
      invalido(`Ano de referência em formato inesperado: "${r.DataReferencia}".`);
      continue;
    }
    const valor = r.Mediana === null || r.Mediana === "" ? NaN : Number(r.Mediana);
    if (!Number.isFinite(valor)) {
      invalido(`Mediana inválida: "${r.Mediana}".`);
      continue;
    }

    const seriesCode = `${PREFIXO_SERIE}.${r.DataReferencia}.${config.campo}`;
    const chave = `${seriesCode}|${r.Data}`;
    if (vistos.has(chave)) {
      invalido(`Registro repetido na fonte para ${seriesCode} em ${r.Data}.`);
      continue;
    }
    vistos.add(chave);

    validos.push({
      series_code: seriesCode,
      observed_at: r.Data,
      value: valor,
      unit: config.unit,
      source_code: SOURCE_CODE,
      // Sem o dia seguinte na fonte (semana mais recente): sem published_at -> collected_at (ADR 0008).
      ...(item.diaPublicacao
        ? { published_at: fimDoDiaUtc(item.diaPublicacao), published_at_is_estimated: true, published_at_basis: "lag_rule" }
        : {}),
      metadata: {
        fonte: "BCB - Focus (Expectativas de Mercado)",
        endpoint: ENDPOINT,
        indicador: r.Indicador,
        anoReferencia: String(r.DataReferencia),
        dataPesquisa: r.Data,
        baseCalculo: BASE_CALCULO,
        estatistica: "mediana",
        numeroRespondentes: r.numeroRespondentes ?? null,
        regraPublicacao: item.diaPublicacao ? "primeiro_dia_com_pesquisa_apos_a_semana" : "sem_dia_seguinte_na_fonte"
      }
    });
  }

  return { validos, invalidos };
}

module.exports = {
  codigo: "bcb-focus",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist: persistirObservacoes,
  montarUrl,
  mapearBoletins,
  inicioDaSemana,
  INDICADORES,
  SOURCE_CODE,
  PREFIXO_SERIE,
  PRIMEIRA_DATA,
  DIAS_JANELA_DIARIA,
  TIMEOUT_BACKFILL_MS
};
