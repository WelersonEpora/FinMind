"use strict";

const { criarColetorAlfred } = require("./fred-alfred");

// Preço mensal do milho do FMI (Primary Commodity Prices), pelo ALFRED. Milho, fator "Clima e safra nos EUA" (ADR
// 0069): o preço do milho americano em dólar, para validar a regra contra Chicago, onde o efeito do clima dos EUA é
// direto (o ZC da CME é pago). Mensal: serve para a validação histórica, não para regras diárias (o preço diário é o
// futuro CCM da B3).
//
// VERIFICADO POR CHAMADA REAL em 2026-10-05 (ver o ADR):
//   - PMAIZMTUSDM ("Global price of Corn"), US$/tonelada métrica, média do mês, release 365 do FRED ("Primary Commodity
//     Prices", o mesmo do café, ADR 0045): o preço do maior exportador (os EUA). A versão atual vai de 1992-01 a 2026-07.
//   - Revisa: 91 versões, desde 2015-11-06 (as mesmas datas irregulares do release; ver fred-cafe-fmi.collector.js).

module.exports = criarColetorAlfred({
  codigo: "fred-milho-fmi",
  // Fonte própria, separada da do café: o descarte das versões já gravadas é por fonte (ver fred-alfred.js).
  sourceCode: "FRED_ALFRED_FMI_MILHO",
  // O FMI divulga o mês na 1ª quinzena do mês seguinte; uma 1ª versão mais de 60 dias depois do mês é atraso do FRED.
  diasLimiteSuperior: 60,
  series: {
    PMAIZMTUSDM: { seriesCode: "FRED.PMAIZMTUSDM", nome: "Milho (EUA), preço mensal do FMI", unit: "USD/t" }
  }
});
