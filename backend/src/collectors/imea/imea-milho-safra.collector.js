"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirObservacoes } = require("../base/persist-observations");
const { API_BASE, CADEIA_MILHO, buscar, publicadoEm } = require("./imea-comum");
const { INDICADORES, extrairSafras } = require("./imea-milho-safra.parser");

// IMEA - milho de Mato Grosso por safra: ÁREA, PRODUÇÃO e PRODUTIVIDADE do estado e das 7 regiões do IMEA.
// ADR 0018.
//
// Uma chamada só, `GET /api/v2/mobile/cadeias/3/cotacoes` (~1,4 MB, pública, sem chave). A resposta traz o valor
// MAIS RECENTE de cada safra e região, com a `DataPublicacao` da última atualização daquele valor: é um `published_at`
// real (só a data), e cada revisão da estimativa aparece na API com uma data nova, virando uma versão nova (ADR 0008).
//
// VERIFICADO POR CHAMADA REAL em 2026-09-21/22 (ver o ADR):
//   - Área, produção e produtividade de MT da safra 2025/26 (7.434.288 ha, 58.036.958 t, 130,11 sc/ha) batem com o
//     relatório de Oferta e Demanda de 31/08/2026, e as 7 regiões também.
//   - Vêm as safras 2022/23 a 2025/26. A projeção da safra seguinte (o PDF de O&D traz 2026/27) ainda não aparece na
//     API: quando aparecer, entra sozinha.
//
// LIMITES conhecidos:
//   - A API guarda só a ÚLTIMA versão de cada safra. Não há histórico de revisões a carregar (sem backfill): o vintage
//     começa a ser construído agora. As versões antigas só existem nos PDFs mensais de Oferta e Demanda (fora deste ADR).
//   - `DataPublicacao` de uma safra antiga é a da ÚLTIMA atualização, não a da primeira publicação.
//   - Os IDs dos indicadores não têm nome na API; estes 3 foram identificados por casamento de valor (ver o parser).

const URL_API = `${API_BASE}/v2/mobile/cadeias/${CADEIA_MILHO}/cotacoes`;
const SOURCE_CODE = "IMEA_MILHO_SAFRA";
const TIMEOUT_MS = 60_000;

async function download({ signal, fetchFn } = {}) {
  const resposta = await buscar(URL_API, { signal, fetchFn });
  const corpo = await resposta.json();
  if (!Array.isArray(corpo)) {
    throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (esperava uma lista de indicadores).");
  }
  // Guarda contra a API trocar os IDs: sem NENHUM dos 3 indicadores, a coleta falha em vez de "ter sucesso" vazia.
  if (!corpo.some((item) => INDICADORES[item?.IndicadorFinalId])) {
    throw new UpstreamServiceError("A resposta do IMEA não traz nenhum dos indicadores de área, produção e produtividade do milho (os IDs mudaram?).");
  }
  return corpo;
}

// Só o que interessa: cada entrada é uma observação extraída ou um item inválido. Os ~5.900 itens de outros
// indicadores da mesma resposta não contam como "lidos".
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do IMEA em formato inesperado (esperava uma lista de indicadores).");
  }
  const { observacoes, invalidos } = extrairSafras(rawData);
  return [...observacoes.map((observacao) => ({ observacao })), ...invalidos.map((invalido) => ({ invalido }))];
}

function normalize(entradas, agora = new Date()) {
  const validos = [];
  const invalidos = [];

  for (const { observacao: o, invalido } of entradas) {
    if (invalido) {
      invalidos.push({ item: invalido.item, motivo: invalido.motivo });
      continue;
    }
    validos.push({
      series_code: o.seriesCode,
      observed_at: o.observedAt,
      value: o.valor,
      unit: o.unidade,
      source_code: SOURCE_CODE,
      published_at: publicadoEm(o.dataPublicacao, agora),
      published_at_is_estimated: false,
      published_at_basis: "source",
      metadata: {
        fonte: "IMEA - indicadores do milho",
        produto: "milho",
        regiao: o.regiao,
        localidade: o.localidade,
        tipoLocalidade: o.tipoLocalidade,
        metrica: o.metrica,
        safra: o.safra,
        indicadorId: o.indicadorId,
        dataPublicacao: o.dataPublicacao
      }
    });
  }

  // Ordem cronológica de publicação (o serviço compara cada valor com a última versão da série).
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos };
}

const persist = (validos, contexto, deps = {}) => persistirObservacoes(validos, contexto, deps);

module.exports = {
  codigo: "imea-milho-safra",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist,
  SOURCE_CODE,
  URL_API
};
