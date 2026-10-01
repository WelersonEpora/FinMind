"use strict";

// Rótulos das regiões dos ETFs de ouro do World Gold Council (ADR 0037). O código é o do coletor
// (`wgc-ouro.collector.js::REGIOES_ETF`); a fonte não traz o total mundial por semana.
const REGIOES_WGC = {
  AMERICA_DO_NORTE: "América do Norte",
  EUROPA: "Europa",
  ASIA: "Ásia",
  OUTROS: "Outras regiões"
};

function descreverRegiaoWgc(codigo) {
  return REGIOES_WGC[codigo] ? { rotulo: REGIOES_WGC[codigo], agregado: false } : null;
}

module.exports = { REGIOES_WGC, descreverRegiaoWgc };
