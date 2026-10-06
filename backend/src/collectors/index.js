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
const eiaPetroleoCollector = require("./eia/eia-petroleo.collector");
const eiaSteoCollector = require("./eia/eia-steo.collector");
const anpProducaoPetroleoCollector = require("./anp/anp-producao-petroleo.collector");
const jodiProducaoPetroleoCollector = require("./jodi/jodi-producao-petroleo.collector");
const jodiDemandaPetroleoCollector = require("./jodi/jodi-demanda-petroleo.collector");
const { criarColetorFred, SERIES_COLETADAS: SERIES_FRED } = require("./fred/fred.collector");
const fredCpiCollector = require("./fred/fred-cpi.collector");
const fredCafeFmiCollector = require("./fred/fred-cafe-fmi.collector");
const fredMilhoFmiCollector = require("./fred/fred-milho-fmi.collector");
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
const icoCafeCollector = require("./ico/ico-cafe.collector");
const ecfCafeEstoquesCollector = require("./ecf/ecf-cafe-estoques.collector");
const conabMilhoCollector = require("./conab/conab-milho.collector");
const conabCafeCollector = require("./conab/conab-cafe.collector");
const conabCustoCafeCollector = require("./conab/conab-custo-cafe.collector");
const cecafeResumoDiarioCollector = require("./cecafe/cecafe-resumo-diario.collector");
const imeaMilhoSafraCollector = require("./imea/imea-milho-safra.collector");
const imeaCustoMilhoCollector = require("./imea/imea-custo-milho.collector");
const imeaOfertaDemandaMilhoCollector = require("./imea/imea-oferta-demanda-milho.collector");
const imeaAndamentoMilhoCollector = require("./imea/imea-andamento-milho.collector");
const imeaParidadeMilhoCollector = require("./imea/imea-paridade-milho.collector");
const { criarColetorVh } = require("./noaa/noaa-vh.collector");
const { coletorCpc } = require("./noaa/noaa-cpc.collector");
const geopoliticaIaCollector = require("./geopolitica/geopolitica-ia.collector");
const { COLETORES_ANALISE_DIARIA } = require("./analise/analise-diaria-ia.collector");

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
    registerCollector(bcbFocusCollector);
    registerCollector(bcbReservasCollector);
    registerCollector(fmiIrfclOuroCollector);
    // World Gold Council: uso interno, licença só pessoal e não comercial, risco aceito pelo usuário (ADR 0037).
    registerCollector(criarColetorWgc("etf"));
    registerCollector(criarColetorWgc("oferta-demanda"));
    registerCollector(criarColetorCot("gold"));
    registerCollector(criarColetorCot("corn"));
    registerCollector(criarColetorCot("coffee"));
    registerCollector(criarColetorCot("crude"));
    registerCollector(criarColetorFuturoB3("ccm"));
    registerCollector(criarColetorFuturoB3("icf"));
    // Ouro: o futuro em dólar da B3 (GLD, ADR 0044). O LBMA Gold Price saiu da coleta diária: o feed
    // público fechou em 2026-10-01 (licença da IBA). O histórico dele continua no banco e o código de
    // lbma/ fica, sem registro. Se o GLD faz o papel do preço do ouro nos fatores, decide o David.
    registerCollector(criarColetorFuturoB3("gld"));
    registerCollector(b3MilhoEsalqCollector);
    registerCollector(criarColetorComexExportacao("milho"));
    registerCollector(criarColetorComexExportacao("cafe"));
    registerCollector(criarColetorComexExportacao("milho-destino"));
    registerCollector(criarColetorComexExportacao("adubo"));
    registerCollector(eiaEtanolCollector);
    registerCollector(eiaPetroleoCollector);
    registerCollector(eiaSteoCollector);
    registerCollector(anpProducaoPetroleoCollector);
    registerCollector(jodiProducaoPetroleoCollector);
    registerCollector(jodiDemandaPetroleoCollector);
    registerCollector(wasdeMilhoCollector);
    registerCollector(usdaAreaPlantadaCollector);
    registerCollector(usdaGrainStocksCollector);
    registerCollector(usdaPsdCafeCollector);
    registerCollector(iceCafeEstoquesCollector);
    registerCollector(icoCafeCollector);
    registerCollector(ecfCafeEstoquesCollector);
    registerCollector(conabMilhoCollector);
    registerCollector(conabCafeCollector);
    registerCollector(conabCustoCafeCollector);
    registerCollector(cecafeResumoDiarioCollector);
    registerCollector(imeaMilhoSafraCollector);
    registerCollector(imeaCustoMilhoCollector);
    registerCollector(imeaOfertaDemandaMilhoCollector);
    registerCollector(imeaAndamentoMilhoCollector);
    registerCollector(imeaParidadeMilhoCollector);
    registerCollector(criarColetorVh("milho"));
    registerCollector(criarColetorVh("cafe"));
    registerCollector(coletorCpc);

    // O CPI e os preços do café e do milho do FMI vêm do ALFRED (versões com a data real), que só existe na API do
    // FRED (ADRs 0033, 0045 e 0069).
    if (env.collectors.fredApiKey) {
      registerCollector(fredCpiCollector);
      registerCollector(fredCafeFmiCollector);
      registerCollector(fredMilhoFmiCollector);
    } else {
      logger.warn("FRED_API_KEY não definida - coletores do ALFRED (CPI dos EUA e preços do café e do milho do FMI) não registrados.");
    }

    if (env.collectors.nassApiKey) {
      registerCollector(usdaCropProgressCollector);
    } else {
      logger.warn("NASS_API_KEY não definida - coletor do USDA Crop Progress (milho) não registrado.");
    }

    // Geopolítica do ouro e do petróleo: uma chamada diária ao Gemini com busca na web (ADR 0047).
    if (env.gemini.apiKeyFree || env.gemini.apiKey) {
      registerCollector(geopoliticaIaCollector);
      // Leitura diária de tendência dos quatro ativos (ADRs 0052, 0054, 0058 e 0062): por ÚLTIMO, para usar a base do
      // dia já coletada (os fatores e a leitura de eventos acima). Uma por ativo, independentes.
      for (const coletor of COLETORES_ANALISE_DIARIA) registerCollector(coletor);
    } else {
      logger.warn(
        "GEMINI_API_KEY_FREE e GEMINI_API_KEY não definidas - leituras diárias da IA (eventos de mercado e tendência do petróleo e do ouro) não registradas."
      );
    }
  }
}

module.exports = { bootstrapCollectors };
