"use strict";

const observationRepository = require("../repositories/observation.repository");
const { ValidationError } = require("../shared/errors");
const { validarPaginacao } = require("../shared/utils/pagination");
const { validarOrdenacao } = require("../shared/utils/ordenacao");
const { decodificarFuturoCcm } = require("../shared/utils/b3-contrato");
const { validarDataOpcional, TAMANHO_PAGINA_PADRAO, TAMANHO_PAGINA_MAXIMO } = require("./market-data.service");

// Leitura, para a tela de Observáveis, dos observáveis que vivem em
// `observation` (point-in-time, ADR 0008). Sempre a visão "vigente hoje"
// (asOf = agora): a tela mostra o que o FinMind sabe agora; a leitura
// histórica ("o que se sabia em D") é o `obterAsOf`, usado pelos fatores e
// pelo futuro experimento - não por esta tela.
//
// `item` é uma entrada do CATALOGO_OBSERVAVEIS com `origem: "observation"`.
// Há dois formatos:
//   - `series: [{ modalidade, seriesCode }]` - conjunto fixo de séries (a
//     modalidade é a série no gráfico);
//   - `porVencimento` + `campos` - futuros com VÁRIOS vencimentos, séries
//     `<prefixoSerie>.<TICKER>.<CAMPO>`. Aqui a modalidade é o vencimento, o
//     campo escolhido é UM por vez (unidades diferentes) e cada vencimento é
//     uma linha própria - nunca uma série contínua.

const CAMPOS_ORDENACAO_HISTORICO = ["referenceDate", "value"];

function ehPorVencimento(item) {
  return Boolean(item.porVencimento);
}

function campoDe(item, codigo) {
  return item.campos.find((c) => c.codigo === codigo);
}

// Vencimentos presentes no banco, do mais próximo ao mais distante. `ativo` =
// teve pregão no ÚLTIMO pregão coletado (todo vencimento listado aparece todo
// dia, mesmo sem negócio, pelo preço de ajuste) - ou seja, ainda não venceu.
async function listarVencimentos(item, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const linhas = (await repo.listarVencimentos(item.porVencimento)).filter((l) => decodificarFuturoCcm(l.ticker));
  const ultimoPregao = linhas.map((l) => l.ultima_data).sort().pop() ?? null;

  return linhas
    .map((l) => {
      const contrato = decodificarFuturoCcm(l.ticker);
      return {
        ticker: l.ticker,
        vencimento: contrato.vencimento,
        rotulo: contrato.rotulo,
        ativo: l.ultima_data === ultimoPregao,
        primeiraData: l.primeira_data,
        ultimaData: l.ultima_data,
        pregoes: Number(l.pregoes)
      };
    })
    .sort((a, b) => (a.vencimento === b.vencimento ? a.ticker.localeCompare(b.ticker) : a.vencimento.localeCompare(b.vencimento)));
}

function seriesDoVencimento(item, ticker, campo) {
  return `${item.porVencimento.prefixoSerie}.${ticker}.${campo}`;
}

// Séries de um item de formato fixo.
function seriesFixasDoItem(item) {
  return item.series.map((s) => s.seriesCode);
}

function modalidadeDe(series, seriesCode) {
  return series.find((s) => s.seriesCode === seriesCode)?.modalidade ?? null;
}

function paraRegistroResposta(item, linha, { series, unidade }) {
  return {
    instrumento: item.instrumentCode,
    valor: Number(linha.value),
    unidade,
    modalidade: modalidadeDe(series, linha.series_code),
    dataReferencia: linha.observed_at,
    fonte: item.fonte,
    periodicidade: item.frequencia.toLowerCase(),
    tempoReal: false,
    atualizadoEm: linha.collected_at,
    // Quando o valor passou a estar disponível e se essa data é estimada
    // por regra (ver ADR 0008) - a tela precisa ser honesta sobre isso.
    publicadoEm: linha.published_at,
    publicadoEmEstimado: Boolean(Number(linha.published_at_is_estimated))
  };
}

// "Valor atual" do card. Para futuros: o campo principal do vencimento MAIS
// PRÓXIMO ainda em negociação, sempre identificado (`modalidade` = ticker) -
// é só o destaque do card, não uma série contínua.
async function obterCotacaoAtual(item, deps = {}) {
  const repo = deps.observationRepository || observationRepository;

  if (ehPorVencimento(item)) {
    const principal = (await listarVencimentos(item, deps)).find((v) => v.ativo);
    if (!principal) return { cotacao: null, mensagem: "Nenhuma observação coletada ainda para este observável." };

    const campo = campoDe(item, item.campoPrincipal);
    const linha = await repo.buscarMaisRecente(seriesDoVencimento(item, principal.ticker, campo.codigo));
    if (!linha) return { cotacao: null, mensagem: "Nenhuma observação coletada ainda para este observável." };

    return {
      cotacao: paraRegistroResposta(item, linha, { series: [{ seriesCode: linha.series_code, modalidade: principal.ticker }], unidade: campo.unidade }),
      vencimentoPrincipal: principal
    };
  }

  const principal = item.series.find((s) => s.modalidade === item.modalidadePrincipal) || item.series[0];
  const linha = await repo.buscarMaisRecente(principal.seriesCode);
  if (!linha) return { cotacao: null, mensagem: "Nenhuma observação coletada ainda para este observável." };
  return { cotacao: paraRegistroResposta(item, linha, { series: item.series, unidade: item.unidade }) };
}

// Cobertura agregada das séries do grupo + quanto da data de publicação é
// estimada (transparência do point-in-time).
async function obterEstatisticas(item, deps = {}) {
  const repo = deps.observationRepository || observationRepository;

  const seriesCodes = ehPorVencimento(item)
    ? (await listarVencimentos(item, deps)).flatMap((v) => item.campos.map((c) => seriesDoVencimento(item, v.ticker, c.codigo)))
    : seriesFixasDoItem(item);
  const resumos = seriesCodes.length ? await repo.resumirSeries(seriesCodes) : [];

  const datas = (campo) => resumos.map((r) => r[campo]).filter(Boolean).sort();
  const primeiras = datas("primeira_data");
  const ultimas = datas("ultima_data");
  const somar = (campo) => resumos.reduce((acc, r) => acc + Number(r[campo] || 0), 0);

  const totalVersoes = somar("total_versoes");
  const versoesEstimadas = somar("versoes_estimadas");

  return {
    primeiraData: primeiras[0] ?? null,
    ultimaData: ultimas[ultimas.length - 1] ?? null,
    totalObservacoes: somar("total_observacoes"),
    publicacao: { totalVersoes, versoesEstimadas, percentualEstimado: totalVersoes ? Math.round((versoesEstimadas / totalVersoes) * 1000) / 10 : null }
  };
}

// O que a tela precisa para montar os seletores de um card por vencimento:
// campos (com unidade), campo padrão e a lista de vencimentos (ativos e vencidos).
async function obterDimensoes(item, deps = {}) {
  if (!ehPorVencimento(item)) return null;
  return {
    campos: item.campos,
    campoPrincipal: item.campoPrincipal,
    rotuloModalidade: "Vencimento",
    vencimentos: await listarVencimentos(item, deps)
  };
}

// Resolve QUAIS séries consultar e a unidade delas, a partir dos filtros.
async function resolverSeries(item, filtros, deps) {
  if (!ehPorVencimento(item)) {
    let series = item.series;
    if (filtros.modality) {
      const serie = item.series.find((s) => s.modalidade === filtros.modality);
      if (!serie) throw new ValidationError(`"modality" deve ser uma entre: ${item.series.map((s) => s.modalidade).join(", ")}.`);
      series = [serie];
    }
    return { series, unidade: item.unidade };
  }

  const codigoCampo = filtros.campo || item.campoPrincipal;
  const campo = campoDe(item, codigoCampo);
  if (!campo) throw new ValidationError(`"campo" deve ser um entre: ${item.campos.map((c) => c.codigo).join(", ")}.`);

  const existentes = await listarVencimentos(item, deps);
  const pedidos = filtros.vencimentos ? String(filtros.vencimentos).split(",").map((v) => v.trim()).filter(Boolean) : null;
  // Sem escolha: os vencimentos ainda em negociação (os vencidos são opt-in).
  const escolhidos = pedidos ?? existentes.filter((v) => v.ativo).map((v) => v.ticker);

  const desconhecidos = escolhidos.filter((t) => !existentes.some((v) => v.ticker === t));
  if (desconhecidos.length) throw new ValidationError(`Vencimento(s) desconhecido(s): ${desconhecidos.join(", ")}.`);

  return {
    series: escolhidos.map((ticker) => ({ modalidade: ticker, seriesCode: seriesDoVencimento(item, ticker, campo.codigo) })),
    unidade: campo.unidade
  };
}

async function obterHistorico(item, filtros, deps = {}) {
  const repo = deps.observationRepository || observationRepository;

  const dataInicio = validarDataOpcional(filtros.dataInicio, "dataInicio");
  const dataFim = validarDataOpcional(filtros.dataFim, "dataFim");
  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('"dataInicio" não pode ser posterior a "dataFim".');
  }

  const { pagina, tamanhoPagina } = validarPaginacao(filtros, { tamanhoPadrao: TAMANHO_PAGINA_PADRAO, tamanhoMaximo: TAMANHO_PAGINA_MAXIMO });
  const { ordenarPor, ordem } = validarOrdenacao(filtros, { camposPermitidos: CAMPOS_ORDENACAO_HISTORICO, padrao: "referenceDate" });

  const { series, unidade } = await resolverSeries(item, filtros, deps);
  if (series.length === 0) {
    return { historico: [], paginacao: { pagina, tamanhoPagina, total: 0, totalPaginas: 1 } };
  }

  const { registros, total } = await repo.buscarHistoricoAtual({
    seriesCodes: series.map((s) => s.seriesCode),
    dataInicio,
    dataFim,
    ordenarPor,
    ordem,
    limite: tamanhoPagina,
    deslocamento: (pagina - 1) * tamanhoPagina
  });

  return {
    historico: registros.map((linha) => paraRegistroResposta(item, linha, { series, unidade })),
    paginacao: { pagina, tamanhoPagina, total, totalPaginas: Math.max(1, Math.ceil(total / tamanhoPagina)) }
  };
}

module.exports = { obterCotacaoAtual, obterEstatisticas, obterDimensoes, obterHistorico, listarVencimentos };
