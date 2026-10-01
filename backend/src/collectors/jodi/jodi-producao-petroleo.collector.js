"use strict";

const { criarColetorJodi } = require("./jodi-base");

// JODI Oil - produção mensal de petróleo por país, do arquivo mundial "primary" (petróleo bruto). Fatores do petróleo
// do FEL 1 "Decisões da OPEP+" (Alto) e "Oferta não-OPEP" (Médio): é o único dado gratuito encontrado de produção da
// OPEP por país. ADR 0042.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01:
//   - ZIP `world_primary_csv.zip` (23 MB, `Last-Modified` 2026-09-22 07:15 UTC, ~5 s), com um CSV de 285 MB. Mensal de
//     2002-01 a 2026-07.
//   - Filtro: CRUDEOIL / INDPROD (produção) / KBD (mil barris por dia): 34.656 linhas, 24.548 com valor, 104 países.
//   - Lacunas da fonte: Brasil até 2022-12, Rússia até 2023-03, Guiana sem dado; sem agregado mundial.
//   - Custo: descompactar ~0,25 s e ~600 MB de memória; filtrar ~0,08 s.
// Download, filtro, published_at e versões: jodi-base.js.

module.exports = criarColetorJodi({
  codigo: "jodi-producao-petroleo",
  url: "https://www.jodidata.org/_resources/files/downloads/oil-data/world_primary_csv.zip",
  arquivo: "primary",
  produto: "CRUDEOIL",
  fluxo: "INDPROD",
  unidade: "KBD",
  prefixoSerie: "JODI.PETROLEO_PRODUCAO",
  campo: "PRODUCAO",
  unit: "mil barris/dia"
});
