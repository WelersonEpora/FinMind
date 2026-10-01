"use strict";

const { criarColetorJodi } = require("./jodi-base");

// JODI Oil - demanda mensal de derivados de petróleo por país, do arquivo mundial "secondary" (derivados). Fator do
// petróleo do FEL 1 "Demanda global e atividade econômica" (Alto): a IEA é paga e o PMI é licenciado; a demanda dos
// EUA já vem, semanal, da EIA (derivados fornecidos, ADR 0040). ADR 0046.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01:
//   - ZIP `world_secondary_csv.zip` (58 MB, `Last-Modified` 2026-09-22 07:16 UTC), com um CSV de 650 MB e as mesmas
//     colunas do primary. Mensal de 2002-01 a 2026-07.
//   - Filtro: TOTPRODS (total de derivados) / TOTDEMO (demanda) / KBD (mil barris por dia): 34.656 linhas, 24.474 com
//     valor, 105 países. EUA, China (desde 2004), Japão, Coreia, Alemanha, Canadá e Arábia Saudita até 2026-07.
//   - Lacunas da fonte: Rússia sem dado, Brasil até 2022-02, Irã até 2018-07, Índia até 2026-03; sem agregado mundial.
//   - Os derivados um a um (gasolina, diesel, querosene de aviação...) estão no mesmo arquivo e não são coletados.
// Download, filtro, published_at e versões: jodi-base.js.

module.exports = criarColetorJodi({
  codigo: "jodi-demanda-petroleo",
  url: "https://www.jodidata.org/_resources/files/downloads/oil-data/world_secondary_csv.zip",
  arquivo: "secondary",
  produto: "TOTPRODS",
  fluxo: "TOTDEMO",
  unidade: "KBD",
  prefixoSerie: "JODI.PETROLEO_DEMANDA",
  campo: "DEMANDA",
  unit: "mil barris/dia"
});
