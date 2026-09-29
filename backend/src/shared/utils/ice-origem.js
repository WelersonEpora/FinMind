"use strict";

// Rótulos de exibição das origens do relatório de estoques certificados do café "C" da ICE (ADR 0032). Código = nome
// da origem na planilha, normalizado (collectors/ice/ice-cafe-estoques.parser.js::slugOrigem). `TOTAL` é o total
// certificado (agregado). Uma origem que apareça sem constar aqui ganha o nome da própria planilha, sem quebrar.
const ORIGENS_ICE = {
  BRAZIL: "Brasil",
  BURUNDI: "Burundi",
  COLOMBIA: "Colômbia",
  COSTA_RICA: "Costa Rica",
  DOMINICAN_REPUBLIC: "República Dominicana",
  ECUADOR: "Equador",
  EL_SALVADOR: "El Salvador",
  ETHIOPIA: "Etiópia",
  GUATEMALA: "Guatemala",
  HONDURAS: "Honduras",
  INDIA: "Índia",
  KENYA: "Quênia",
  MEXICO: "México",
  NICARAGUA: "Nicarágua",
  PANAMA: "Panamá",
  PAPUA_NEW_GUINEA: "Papua-Nova Guiné",
  PERU: "Peru",
  RWANDA: "Ruanda",
  TANZANIA: "Tanzânia",
  UGANDA: "Uganda",
  VENEZUELA: "Venezuela"
};

// PAPUA_NEW_GUINEA -> "Papua New Guinea" (a grafia da planilha, sem os acentos que o código perdeu).
function nomeDoCodigo(codigo) {
  return codigo
    .toLowerCase()
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function descreverOrigemIce(codigo) {
  if (codigo === "TOTAL") return { rotulo: "Total certificado", agregado: true };
  return { rotulo: ORIGENS_ICE[codigo] ?? nomeDoCodigo(codigo), agregado: false };
}

module.exports = { descreverOrigemIce };
