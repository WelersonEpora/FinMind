"use strict";

const { criarColetorAlfred } = require("./fred-alfred");

// CPI dos EUA (BLS), pelo ALFRED, o arquivo de versões do FRED. Ouro, fator "Inflação e expectativas
// inflacionárias" (ADR 0033): o breakeven (T10YIE) já era coletado; o CPI observado não.
//
// POR QUE O ALFRED E NÃO O COLETOR DO FRED (fred.collector.js): o CPI REVISA. O ajuste sazonal é refeito todo
// fevereiro, para os últimos 5 anos, e houve mudanças de base e de arredondamento no histórico. O coletor do FRED
// só vê o valor atual, com a data de publicação estimada. O ALFRED guarda cada versão com a data em que ela passou
// a valer (`realtime_start`), que é a data do release do BLS: o vintage real, como no WASDE.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01 (ver o ADR):
//   - `series/observations` com `realtime_start=1776-07-04`, `realtime_end=9999-12-31` e `output_type=1` devolve
//     uma linha por (mês, versão): CPIAUCSL 3.103 linhas para 955 meses (657 meses revisados, 1.904 revisões);
//     CPILFESL 2.259 para 835; CPIAUCNS 2.500 para 1.363.
//   - Versões desde 1972-07-21 (cheio com ajuste), 1996-12-12 (núcleo) e 1949-03-24 (sem ajuste).
//   - As datas das versões caem nas datas do release "Consumer Price Index" do FRED (release 10).
//
// published_at: a data da versão é REAL; o horário não (o BLS divulga às 8:30 ET): vale o FIM DO DIA em UTC.
// Os meses anteriores à primeira versão guardada entram com a data dessa versão, que é um LIMITE SUPERIOR (como as
// safras antigas da Conab): ficam marcados em `metadata.limiteSuperior`. Download, versões e reexecução: fred-alfred.js.

module.exports = criarColetorAlfred({
  codigo: "fred-cpi",
  sourceCode: "FRED_ALFRED",
  // O BLS divulga o CPI de um mês na 2ª ou 3ª semana do mês seguinte. Uma 1ª versão mais de 60 dias depois do mês
  // é a primeira guardada pelo ALFRED, não a publicação original.
  diasLimiteSuperior: 60,
  series: {
    CPIAUCSL: { seriesCode: "FRED.CPIAUCSL", nome: "CPI cheio, com ajuste sazonal", unit: "INDEX" },
    CPILFESL: { seriesCode: "FRED.CPILFESL", nome: "CPI núcleo (sem alimentos e energia), com ajuste sazonal", unit: "INDEX" },
    CPIAUCNS: { seriesCode: "FRED.CPIAUCNS", nome: "CPI cheio, sem ajuste sazonal", unit: "INDEX" }
  }
});
