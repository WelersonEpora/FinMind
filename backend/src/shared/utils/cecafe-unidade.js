"use strict";

// Rótulos das unidades do resumo diário do Cecafé (ADR 0038). O código é o do coletor
// (`cecafe-resumo-diario.collector.js::UNIDADES`); "TOTAL" é a linha de totais da própria fonte.
const UNIDADES_CECAFE = {
  SANTOS: "Santos",
  VITORIA: "Vitória",
  RIO_DE_JANEIRO: "Rio de Janeiro",
  SALVADOR: "Salvador",
  REDEX_EADI_MG: "REDEX e EADI (Minas Gerais)",
  OUTROS: "Outros"
};

function descreverUnidadeCecafe(codigo) {
  if (codigo === "TOTAL") return { rotulo: "Total", agregado: true };
  return UNIDADES_CECAFE[codigo] ? { rotulo: UNIDADES_CECAFE[codigo], agregado: false } : null;
}

module.exports = { UNIDADES_CECAFE, descreverUnidadeCecafe };
