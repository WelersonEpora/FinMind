"use strict";

// Ponto único de registro dos coletores - importado uma vez na subida do
// processo (app.js) e pelo script de coleta manual/cron (scripts/run-coleta.js).
// Adicionar um novo coletor = importar + registerCollector aqui (ver
// collectors/base/README.md).
const env = require("../config/env");
const logger = require("../shared/logger");
const { registerCollector, listCollectors } = require("./base/collector.interface");
const bcbUsdBrlCollector = require("./bcb/bcb-usd-brl.collector");
const bcbSelicMetaCollector = require("./bcb/bcb-selic-meta.collector");
const bcbSelicRealizadaCollector = require("./bcb/bcb-selic-realizada.collector");
const { criarColetorFred } = require("./fred/fred.collector");
const lbmaGoldPmCollector = require("./lbma/lbma-gold-pm.collector");
const { criarColetorCot } = require("./cftc/cftc-cot.collector");
const usdaCropProgressCollector = require("./usda/usda-crop-progress.collector");
const b3CcmCollector = require("./b3/b3-ccm.collector");
const b3MilhoEsalqCollector = require("./b3/b3-milho-esalq.collector");
const comexMilhoExportacaoCollector = require("./comex/comex-milho-exportacao.collector");
const wasdeMilhoCollector = require("./wasde/wasde-milho.collector");
const conabMilhoCollector = require("./conab/conab-milho.collector");
const imeaMilhoSafraCollector = require("./imea/imea-milho-safra.collector");
const imeaCustoMilhoCollector = require("./imea/imea-custo-milho.collector");
const imeaOfertaDemandaMilhoCollector = require("./imea/imea-oferta-demanda-milho.collector");

function bootstrapCollectors() {
  if (listCollectors().length === 0) {
    // market_quote (upsert) - séries que não sofrem revisão (ADR 0003).
    registerCollector(bcbUsdBrlCollector);
    registerCollector(bcbSelicMetaCollector);
    registerCollector(bcbSelicRealizadaCollector);

    // observation (point-in-time, append-only) - ADR 0008.
    for (const fredId of ["DGS10", "T10YIE", "DFII10", "DTWEXBGS"]) {
      registerCollector(criarColetorFred(fredId));
    }
    registerCollector(lbmaGoldPmCollector);
    registerCollector(criarColetorCot("gold"));
    registerCollector(criarColetorCot("corn"));
    registerCollector(b3CcmCollector);
    registerCollector(b3MilhoEsalqCollector);
    registerCollector(comexMilhoExportacaoCollector);
    registerCollector(wasdeMilhoCollector);
    registerCollector(conabMilhoCollector);
    registerCollector(imeaMilhoSafraCollector);
    registerCollector(imeaCustoMilhoCollector);
    registerCollector(imeaOfertaDemandaMilhoCollector);

    if (env.collectors.nassApiKey) {
      registerCollector(usdaCropProgressCollector);
    } else {
      logger.warn("NASS_API_KEY não definida - coletor do USDA Crop Progress (milho) não registrado.");
    }
  }
}

module.exports = { bootstrapCollectors };
