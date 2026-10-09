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
const bcbAtuacoesCambioCollector = require("./bcb/bcb-atuacoes-cambio.collector");
const bcbBalancoPagamentosCollector = require("./bcb/bcb-balanco-pagamentos.collector");
const fmiIrfclOuroCollector = require("./fmi/fmi-irfcl-ouro.collector");
const { criarColetorWgc } = require("./wgc/wgc-ouro.collector");
const eiaEtanolCollector = require("./eia/eia-etanol.collector");
const eiaPetroleoCollector = require("./eia/eia-petroleo.collector");
const eiaSteoCollector = require("./eia/eia-steo.collector");
const yahooBrentFuturoCollector = require("./yahoo/yahoo-brent-futuro.collector");
const anpProducaoPetroleoCollector = require("./anp/anp-producao-petroleo.collector");
const jodiProducaoPetroleoCollector = require("./jodi/jodi-producao-petroleo.collector");
const jodiDemandaPetroleoCollector = require("./jodi/jodi-demanda-petroleo.collector");
const { criarColetorFred, SERIES_COLETADAS: SERIES_FRED } = require("./fred/fred.collector");
const fredCpiCollector = require("./fred/fred-cpi.collector");
const fredCafeFmiCollector = require("./fred/fred-cafe-fmi.collector");
const fredMilhoFmiCollector = require("./fred/fred-milho-fmi.collector");
const fredSojaFmiCollector = require("./fred/fred-soja-fmi.collector");
const { criarColetorCot } = require("./cftc/cftc-cot.collector");
const usdaCropProgressCollector = require("./usda/usda-crop-progress.collector");
const { criarColetorFuturoB3 } = require("./b3/b3-futuro.collector");
const b3MilhoEsalqCollector = require("./b3/b3-milho-esalq.collector");
const { criarColetorComexExportacao } = require("./comex/comex-exportacao.collector");
const wasdeCollector = require("./wasde/wasde.collector");
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
    // Atuações do BCB no câmbio (swaps, linhas, vendas à vista): fase 1 do dólar, só aquisição (ADR 0122).
    registerCollector(bcbAtuacoesCambioCollector);
    // Balança comercial e transações correntes do balanço de pagamentos: fase 1 do dólar, só aquisição (ADR 0123).
    registerCollector(bcbBalancoPagamentosCollector);
    registerCollector(fmiIrfclOuroCollector);
    // World Gold Council: uso interno, licença só pessoal e não comercial, risco aceito pelo usuário (ADR 0037).
    registerCollector(criarColetorWgc("etf"));
    registerCollector(criarColetorWgc("oferta-demanda"));
    registerCollector(criarColetorCot("gold"));
    registerCollector(criarColetorCot("corn"));
    registerCollector(criarColetorCot("coffee"));
    registerCollector(criarColetorCot("crude"));
    registerCollector(criarColetorCot("soybeans"));
    // Real brasileiro (CME), no relatório TFF: fase 1 do dólar, só aquisição (ADR 0120).
    registerCollector(criarColetorCot("brl"));
    registerCollector(criarColetorFuturoB3("ccm"));
    registerCollector(criarColetorFuturoB3("icf"));
    // Ouro: o futuro em dólar da B3 (GLD, ADR 0044). O LBMA Gold Price saiu da coleta diária: o feed
    // público fechou em 2026-10-01 (licença da IBA). O histórico dele continua no banco e o código de
    // lbma/ fica, sem registro. Se o GLD faz o papel do preço do ouro nos fatores, decide o David.
    registerCollector(criarColetorFuturoB3("gld"));
    // Soja: o futuro SJC da B3, liquidado pelo preço da CME (ADR 0109). Fase 1 da soja: só aquisição de dados.
    registerCollector(criarColetorFuturoB3("sjc"));
    // Dólar: os futuros DOL e WDO e o DI1 da B3 (ADR 0118). Fase 1 do dólar: só aquisição de dados (ADR 0117).
    registerCollector(criarColetorFuturoB3("dol"));
    registerCollector(criarColetorFuturoB3("wdo"));
    registerCollector(criarColetorFuturoB3("di1"));
    registerCollector(b3MilhoEsalqCollector);
    registerCollector(criarColetorComexExportacao("milho"));
    registerCollector(criarColetorComexExportacao("cafe"));
    registerCollector(criarColetorComexExportacao("milho-destino"));
    registerCollector(criarColetorComexExportacao("adubo"));
    registerCollector(eiaEtanolCollector);
    registerCollector(eiaPetroleoCollector);
    registerCollector(eiaSteoCollector);
    // Brent futuro (NYMEX BZ) pelo Yahoo: fonte NÃO oficial e provisória, autorizada pelo usuário até a decisão do
    // Comitê sobre a ICE (ADR 0096).
    registerCollector(yahooBrentFuturoCollector);
    registerCollector(anpProducaoPetroleoCollector);
    registerCollector(jodiProducaoPetroleoCollector);
    registerCollector(jodiDemandaPetroleoCollector);
    registerCollector(wasdeCollector);
    // Soja, fase 1 (só aquisição, ADR 0111): o mesmo WASDE, outra tabela.
    registerCollector(wasdeCollector.criarColetorWasde("soja"));
    registerCollector(usdaAreaPlantadaCollector);
    // Soja, fase 1 (só aquisição, ADR 0112): as mesmas edições, outra tabela.
    registerCollector(usdaAreaPlantadaCollector.criarColetorAreaPlantada("soja"));
    registerCollector(usdaGrainStocksCollector);
    // Soja, fase 1 (só aquisição, ADR 0113): as mesmas edições, o bloco da soja.
    registerCollector(usdaGrainStocksCollector.criarColetorGrainStocks("soja"));
    registerCollector(usdaPsdCafeCollector);
    registerCollector(iceCafeEstoquesCollector);
    registerCollector(icoCafeCollector);
    registerCollector(ecfCafeEstoquesCollector);
    registerCollector(conabMilhoCollector);
    // Soja, fase 1 (só aquisição, ADR 0114): os mesmos levantamentos, outras abas.
    registerCollector(conabMilhoCollector.criarColetorConab("soja"));
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
    registerCollector(criarColetorVh("soja"));
    registerCollector(coletorCpc);

    // O CPI e os preços do café, do milho e da soja do FMI vêm do ALFRED (versões com a data real), que só existe na API do
    // FRED (ADRs 0033, 0045, 0069 e 0110).
    if (env.collectors.fredApiKey) {
      registerCollector(fredCpiCollector);
      registerCollector(fredCafeFmiCollector);
      registerCollector(fredMilhoFmiCollector);
      registerCollector(fredSojaFmiCollector);
    } else {
      logger.warn("FRED_API_KEY não definida - coletores do ALFRED (CPI dos EUA e preços do café, do milho e da soja do FMI) não registrados.");
    }

    if (env.collectors.nassApiKey) {
      registerCollector(usdaCropProgressCollector);
      registerCollector(usdaCropProgressCollector.criarColetorCropProgress("soja"));
    } else {
      logger.warn("NASS_API_KEY não definida - coletor do USDA Crop Progress (milho) não registrado.");
    }

    // Geopolítica do ouro e do petróleo: uma chamada diária ao Gemini com busca na web (ADR 0047).
    if (env.gemini.apiKeyFree || env.gemini.apiKey) {
      registerCollector(geopoliticaIaCollector);
      // Eventos da soja (fase 1 da soja, só aquisição, ADR 0115): leitura PRÓPRIA, outra chamada e outra linha por dia;
      // uma falha dela não toca na leitura principal e ela não vai ao Motor nem à leitura de tendência.
      registerCollector(geopoliticaIaCollector.coletorSoja);
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
