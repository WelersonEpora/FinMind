"use strict";

// Rótulos dos países do JODI (ADR 0042). O código é o da fonte, ISO 3166 alfa-2; o nome em português vem do próprio
// Node (`Intl.DisplayNames`), sem lista mantida à mão. Um código que o Intl não conheça aparece como o próprio código.
let nomes = null;
try {
  nomes = new Intl.DisplayNames(["pt-BR"], { type: "region" });
} catch {
  nomes = null;
}

function descreverPaisJodi(codigo) {
  let nome = null;
  try {
    nome = nomes ? nomes.of(codigo) : null;
  } catch {
    nome = null;
  }
  return { rotulo: nome && nome !== codigo ? `${nome} (${codigo})` : codigo, agregado: false };
}

module.exports = { descreverPaisJodi };
