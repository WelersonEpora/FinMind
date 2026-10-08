"use strict";

const { criarColetorAlfred } = require("./fred-alfred");

// Preços mensais do FMI (Primary Commodity Prices) da soja, do óleo e do farelo de soja, pelo ALFRED. Fase 1 da soja,
// só aquisição (ADR 0110): séries de pesquisa para validar os fatores em 30 e 90 dias e para a margem de esmagamento
// candidata (proposta da soja, §2.5 e §3.1). Mensal: o preço oficial da soja é o futuro SJC da B3 (ADR 0109).
//
// VERIFICADO POR CHAMADA REAL em 2026-10-08 (ver o ADR): as três séries são do release 365 do FRED ("Primary Commodity
// Prices", o mesmo do milho e do café, ADRs 0045 e 0069), em US$/tonelada métrica, média do mês, desde 1992-01.
//   - PSOYBUSDM ("Global price of Soybeans")
//   - PSOILUSDM ("Global price of Soybean Oil")
//   - PSMEAUSDM ("Global price of Soybean Meal")

module.exports = criarColetorAlfred({
  codigo: "fred-soja-fmi",
  // Fonte própria: o descarte das versões já gravadas é por fonte (ver fred-alfred.js).
  sourceCode: "FRED_ALFRED_FMI_SOJA",
  // O mesmo limite do milho: o FMI divulga o mês na 1ª quinzena do mês seguinte.
  diasLimiteSuperior: 60,
  series: {
    PSOYBUSDM: { seriesCode: "FRED.PSOYBUSDM", nome: "Soja, preço mensal do FMI", unit: "USD/t" },
    PSOILUSDM: { seriesCode: "FRED.PSOILUSDM", nome: "Óleo de soja, preço mensal do FMI", unit: "USD/t" },
    PSMEAUSDM: { seriesCode: "FRED.PSMEAUSDM", nome: "Farelo de soja, preço mensal do FMI", unit: "USD/t" }
  }
});
