"use strict";

const { descreverPaisJodi } = require("./jodi-pais");

// Rótulos dos itens do STEO da EIA (ADR 0091): os países pelo código ISO 3166 alfa-2 (o nome vem do Intl, como no
// JODI) e os agregados que a EIA publica, com a filiação de cada edição.
const AGREGADOS = {
  OPEP: "OPEP, total",
  OPEP_MAIS: "OPEP+, países sujeitos aos acordos",
  OPEP_MAIS_MEMBROS_OPEP: "OPEP+, membros da OPEP sujeitos aos acordos",
  OPEP_MAIS_OUTROS: "OPEP+, outros participantes"
};

function descreverItemSteo(codigo) {
  if (AGREGADOS[codigo]) return { rotulo: AGREGADOS[codigo], agregado: true };
  return /^[A-Z]{2}$/.test(codigo) ? descreverPaisJodi(codigo) : null;
}

module.exports = { descreverItemSteo };
