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
const bcbFocusCollector = require("./bcb/bcb-focus.collector");
const bcbReservasCollector = require("./bcb/bcb-reservas.collector");
const fmiIrfclOuroCollector = require("./fmi/fmi-irfcl-ouro.collector");
const { criarColetorWgc } = require("./wgc/wgc-ouro.collector");
const eiaEtanolCollector = require("./eia/eia-etanol.collector");
const { criarColetorFred, SERIES_COLETADAS: SERIES_FRED } = require("./fred/fred.collector");
const fredCpiCollector = require("./fred/fred-cpi.collector");
const lbmaGoldPmCollector = require("./lbma/lbma-gold-pm.collector");
const { criarColetorCot } = require("./cftc/cftc-cot.collector");
const usdaCropProgressCollector = require("./usda/usda-crop-progress.collector");
const { criarColetorFuturoB3 } = require("./b3/b3-futuro.collector");
const b3MilhoEsalqCollector = require("./b3/b3-milho-esalq.collector");
const { criarColetorComexExportacao } = require("./comex/comex-exportacao.collector");
const wasdeMilhoCollector = require("./wasde/wasde-milho.collector");
const usdaAreaPlantadaCollector = require("./usda/usda-area-plantada.collector");
const usdaGrainStocksCollector = require("./usda/usda-grain-stocks.collector");
const usdaPsdCafeCollector = require("./usda/usda-psd-cafe.collector");
const iceCafeEstoquesCollector = require("./ice/ice-cafe-estoques.collector");
const conabMilhoCollector = require("./conab/conab-milho.collector");
const conabCafeCollector = require("./conab/conab-cafe.collector");
const cecafeResumoDiarioCollector = require("./cecafe/cecafe-resumo-diario.collector");
const imeaMilhoSafraCollector = require("./imea/imea-milho-safra.collector");
const imeaCustoMilhoCollector = require("./imea/imea-custo-milho.collector");
const imeaOfertaDemandaMilhoCollector = require("./imea/imea-oferta-demanda-milho.collector");
const { criarColetorVh } = require("./noaa/noaa-vh.collector");

function bootstrapCollectors() {
  if (listCollectors().length === 0) {
    // market_quote (upsert) - séries que não sofrem revisão (ADR 0003).
    registerCollector(bcbUsdBrlCollector);
    registerCollector(bcbSelicMetaCollector);
    registerCollector(bcbSelicRealizadaCollector);

    // observation (point-in-time, append-only) - ADR 0008.
    for (const fredId of SERIES_FRED) {
      registerCollector(criarColetorFred(fredId));
    }
    registerCollector(lbmaGoldPmCollector);
    registerCollector(bcbFocusCollector);
    registerCollector(bcbReservasCollector);
    registerCollector(fmiIrfclOuroCollector);
    // World Gold Council: uso interno, licença só pessoal e não comercial, risco aceito pelo usuário (ADR 0037).
    registerCollector(criarColetorWgc("etf"));
    registerCollector(criarColetorWgc("oferta-demanda"));
    registerCollector(criarColetorCot("gold"));
    registerCollector(criarColetorCot("corn"));
    registerCollector(criarColetorCot("coffee"));
    registerCollector(criarColetorFuturoB3("ccm"));
    registerCollector(criarColetorFuturoB3("icf"));
    registerCollector(b3MilhoEsalqCollector);
    registerCollector(criarColetorComexExportacao("milho"));
    registerCollector(criarColetorComexExportacao("cafe"));
    registerCollector(criarColetorComexExportacao("milho-destino"));
    registerCollector(eiaEtanolCollector);
    registerCollector(wasdeMilhoCollector);
    registerCollector(usdaAreaPlantadaCollector);
    registerCollector(usdaGrainStocksCollector);
    registerCollector(usdaPsdCafeCollector);
    registerCollector(iceCafeEstoquesCollector);
    registerCollector(conabMilhoCollector);
    registerCollector(conabCafeCollector);
    registerCollector(cecafeResumoDiarioCollector);
    registerCollector(imeaMilhoSafraCollector);
    registerCollector(imeaCustoMilhoCollector);
    registerCollector(imeaOfertaDemandaMilhoCollector);
    registerCollector(criarColetorVh("milho"));
    registerCollector(criarColetorVh("cafe"));

    // O CPI vem do ALFRED (versões com a data real), que só existe na API do FRED (ADR 0033).
    if (env.collectors.fredApiKey) {
      registerCollector(fredCpiCollector);
    } else {
      logger.warn("FRED_API_KEY não definida - coletor do CPI dos EUA (ALFRED) não registrado.");
    }

    if (env.collectors.nassApiKey) {
      registerCollector(usdaCropProgressCollector);
    } else {
      logger.warn("NASS_API_KEY não definida - coletor do USDA Crop Progress (milho) não registrado.");
    }
  }
}

module.exports = { bootstrapCollectors };
