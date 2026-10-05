"use strict";

const marketQuoteRepository = require("../../repositories/market-quote.repository");

// A PTAX de venda de `desde` até o dia de `asOf`, em ordem ({ data, valor }). Sai à tarde do próprio dia, e o
// market_quote não guarda a publicação: vale a data de referência. Usada pelos fatores que convertem dólar (o dólar e
// a paridade do milho, os insumos do milho, o dólar e os custos do café).
async function lerPtax({ desde, asOf }, deps = {}) {
  const repo = deps.marketQuoteRepository || marketQuoteRepository;
  const { registros } = await repo.buscarHistorico({
    instrumentCode: "USD_BRL",
    modality: "venda",
    dataInicio: desde,
    dataFim: asOf.toISOString().slice(0, 10),
    pagina: 1,
    tamanhoPagina: 100_000,
    ordem: "ASC"
  });
  return registros.map((r) => ({ data: String(r.reference_date).slice(0, 10), valor: Number(r.value) }));
}

module.exports = { lerPtax };
