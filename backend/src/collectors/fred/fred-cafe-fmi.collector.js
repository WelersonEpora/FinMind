"use strict";

const { criarColetorAlfred } = require("./fred-alfred");

// Preço mensal do café do FMI (Primary Commodity Prices), pelo ALFRED. Café, fator "Dólar e preço" (ADR 0045): o
// único histórico longo e gratuito de preço do café, desde que o Comitê decidiu, em 2026-10-01, seguir com o
// histórico disponível (sem comprar o KC da ICE). Mensal: serve para ciclos longos, não para regras diárias (o preço
// diário é o futuro ICF da B3, ADR 0028).
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01 (ver o ADR):
//   - PCOFFOTMUSDM (arábica, "Other Mild Arabica") e PCOFFROBUSDM (robusta), US¢/lb, média do mês, release 365 do
//     FRED ("Primary Commodity Prices"). A versão atual vai de 1992-01 a 2026-07.
//   - O preço REVISA: 530 de 559 meses do arábica têm mais de uma versão (91 versões, desde 2015-11-06). Por isso o
//     ALFRED, como o CPI (ADR 0033), e não o coletor do FRED.
//   - As versões do FRED são IRREGULARES (706 dias sem atualizar entre 2017-07 e 2019-06; 192 dias entre 2025-07 e
//     2026-01). A data da versão é quando o dado chegou ao FRED, não quando o FMI publicou: um limite superior, nunca
//     antes do que se sabia. Desde 2015, a 1ª versão sai em mediana 47 dias depois do 1º dia do mês (mínimo 32).
//   - Os meses de 1980 a 1991 estavam nas versões antigas e foram retirados da série (a versão atual traz "."):
//     não são gravados (aviso, ver fred-alfred.js).

module.exports = criarColetorAlfred({
  codigo: "fred-cafe-fmi",
  sourceCode: "FRED_ALFRED_FMI",
  // O FMI divulga o mês na 1ª quinzena do mês seguinte; uma 1ª versão mais de 60 dias depois do mês é atraso do FRED.
  diasLimiteSuperior: 60,
  series: {
    PCOFFOTMUSDM: { seriesCode: "FRED.PCOFFOTMUSDM", nome: "Café arábica (Other Mild Arabica), preço mensal do FMI", unit: "USc/lb" },
    PCOFFROBUSDM: { seriesCode: "FRED.PCOFFROBUSDM", nome: "Café robusta, preço mensal do FMI", unit: "USc/lb" }
  }
});
