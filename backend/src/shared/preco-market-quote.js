"use strict";

const marketQuoteRepository = require("../repositories/market-quote.repository");

// Um preço de referência que está em `market_quote`, e não em `observation` (a PTAX de venda, o preço do dólar, ADR
// 0126): a cotação não é revisada (ADR 0001), então não tem versões nem data de publicação gravada. O Centro de Decisão e
// o realizado a leem por aqui, com as linhas no formato da observation (series_code, observed_at, value, published_at),
// para o resto do cálculo não mudar.
//
// A data de publicação é ESTIMADA: a PTAX do dia sai às 13h30 em Brasília (16h30 UTC), depois da última janela de
// apuração (13h10 a 13h20). Um instante antes disso não a vê (point-in-time, ADR 0008).

const SERIES = Object.freeze({
  "BCB.PTAX.VENDA": { instrumentCode: "USD_BRL", modality: "venda" }
});

const HORARIO_DE_PUBLICACAO_UTC = "16:30:00.000Z";

const ehMarketQuote = (seriesCode) => Boolean(SERIES[seriesCode]);

// As linhas de uma série de `market_quote` entre duas datas, conhecidas até `asOf`.
async function buscarLinhas(seriesCode, { asOf, observadoDesde, observadoAte }, deps = {}) {
  const def = SERIES[seriesCode];
  if (!def) throw new Error(`Série de market_quote desconhecida: ${seriesCode}`);
  const repo = deps.marketQuoteRepository || marketQuoteRepository;
  const registros = await repo.buscarSerie({ instrumentCode: def.instrumentCode, modality: def.modality, dataInicio: observadoDesde, dataFim: observadoAte });
  return registros
    .map((r) => {
      const data = String(r.reference_date).slice(0, 10);
      return { series_code: seriesCode, observed_at: data, value: Number(r.value), published_at: new Date(`${data}T${HORARIO_DE_PUBLICACAO_UTC}`), published_at_is_estimated: true };
    })
    .filter((l) => !asOf || l.published_at.getTime() <= asOf.getTime());
}

module.exports = { SERIES, ehMarketQuote, buscarLinhas };
