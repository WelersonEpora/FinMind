"use strict";

const marketQuoteRepository = require("../repositories/market-quote.repository");
const { ValidationError } = require("../shared/errors");
const { validarPaginacao } = require("../shared/utils/pagination");
const { validarOrdenacao } = require("../shared/utils/ordenacao");

const CAMPOS_ORDENACAO_HISTORICO = ["referenceDate", "value"];

const FONTES = {
  BCB_SGS_1: "Banco Central do Brasil - SGS (série 1, câmbio livre venda)",
  BCB_SGS_432: "Banco Central do Brasil - SGS (série 432, meta Selic definida pelo Copom)",
  BCB_SGS_1178: "Banco Central do Brasil - SGS (série 1178, Selic acumulada no mês anualizada)"
};

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const TAMANHO_PAGINA_PADRAO = 90;
const TAMANHO_PAGINA_MAXIMO = 366;

function paraCotacaoResposta(registro) {
  return {
    instrumento: registro.instrument_code,
    valor: Number(registro.value),
    unidade: registro.unit,
    modalidade: registro.modality,
    dataReferencia: registro.reference_date,
    fonte: FONTES[registro.source_code] || registro.source_code,
    // Explícito de propósito: a fonte atual é um fechamento diário, nunca
    // uma cotação em tempo real - ver docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md.
    periodicidade: "diaria",
    tempoReal: false,
    atualizadoEm: registro.updated_at
  };
}

function validarDataOpcional(valor, campo) {
  if (valor === undefined || valor === null || valor === "") return undefined;
  if (!REGEX_DATA_ISO.test(valor)) {
    throw new ValidationError(`"${campo}" deve estar no formato AAAA-MM-DD.`);
  }
  return valor;
}

// `modality` é opcional - só necessário quando o instrumento agrupa mais de
// uma série e é preciso escolher qual delas é "a cotação atual" (ex.: SELIC
// mostra a meta, ver ADR 0006).
async function obterCotacaoAtual(instrumentCode, modality, deps = {}) {
  const repo = deps.marketQuoteRepository || marketQuoteRepository;
  const registro = await repo.buscarMaisRecente(instrumentCode, modality);

  if (!registro) {
    return { cotacao: null, mensagem: "Nenhuma cotação coletada ainda para este instrumento." };
  }

  return { cotacao: paraCotacaoResposta(registro) };
}

async function obterHistorico(instrumentCode, filtros, deps = {}) {
  const repo = deps.marketQuoteRepository || marketQuoteRepository;

  const dataInicio = validarDataOpcional(filtros.dataInicio, "dataInicio");
  const dataFim = validarDataOpcional(filtros.dataFim, "dataFim");
  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('"dataInicio" não pode ser posterior a "dataFim".');
  }

  const { pagina, tamanhoPagina } = validarPaginacao(filtros, {
    tamanhoPadrao: TAMANHO_PAGINA_PADRAO,
    tamanhoMaximo: TAMANHO_PAGINA_MAXIMO
  });

  const { ordenarPor, ordem } = validarOrdenacao(filtros, {
    camposPermitidos: CAMPOS_ORDENACAO_HISTORICO,
    padrao: "referenceDate"
  });

  const { registros, total } = await repo.buscarHistorico({
    instrumentCode,
    modality: filtros.modality || undefined,
    dataInicio,
    dataFim,
    pagina,
    tamanhoPagina,
    ordenarPor,
    ordem
  });

  return {
    historico: registros.map(paraCotacaoResposta),
    paginacao: { pagina, tamanhoPagina, total, totalPaginas: Math.max(1, Math.ceil(total / tamanhoPagina)) }
  };
}

module.exports = { obterCotacaoAtual, obterHistorico, validarDataOpcional, TAMANHO_PAGINA_PADRAO, TAMANHO_PAGINA_MAXIMO };
