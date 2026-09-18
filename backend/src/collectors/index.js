"use strict";

// Ponto único de registro dos coletores - importado uma vez na subida do
// processo (app.js) e pelo script de coleta manual/cron (scripts/run-coleta.js).
// Adicionar um novo coletor = importar + registerCollector aqui (ver
// collectors/base/README.md).
const { registerCollector, listCollectors } = require("./base/collector.interface");
const bcbUsdBrlCollector = require("./bcb/bcb-usd-brl.collector");
const bcbSelicMetaCollector = require("./bcb/bcb-selic-meta.collector");
const bcbSelicRealizadaCollector = require("./bcb/bcb-selic-realizada.collector");

function bootstrapCollectors() {
  if (listCollectors().length === 0) {
    registerCollector(bcbUsdBrlCollector);
    registerCollector(bcbSelicMetaCollector);
    registerCollector(bcbSelicRealizadaCollector);
  }
}

module.exports = { bootstrapCollectors };
