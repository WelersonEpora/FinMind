"use strict";

// Rótulos de exibição dos países do IRFCL do FMI (reservas de ouro, ADR 0036). O código é o da própria fonte
// (ISO 3166 alfa-3, mais os agregados G163 e EZB). Os 88 presentes no volume de ouro em 2026-10-01; a lista de
// códigos do FMI (`CL_IRFCL_COUNTRY_PUB`) não traz nomes em português. Um código que passe a existir sem constar
// aqui aparece com o próprio código, sem quebrar.
const PAISES_FMI = {
  AGO: "Angola",
  ALB: "Albânia",
  ARG: "Argentina",
  ARM: "Armênia",
  AUS: "Austrália",
  AUT: "Áustria",
  BEL: "Bélgica",
  BGR: "Bulgária",
  BLR: "Belarus",
  BOL: "Bolívia",
  BRA: "Brasil",
  CAN: "Canadá",
  CHE: "Suíça",
  CHL: "Chile",
  CHN: "China",
  COL: "Colômbia",
  CRI: "Costa Rica",
  CYP: "Chipre",
  CZE: "República Tcheca",
  DEU: "Alemanha",
  DNK: "Dinamarca",
  DOM: "República Dominicana",
  ECU: "Equador",
  EGY: "Egito",
  ESP: "Espanha",
  EST: "Estônia",
  FIN: "Finlândia",
  FRA: "França",
  GBR: "Reino Unido",
  GEO: "Geórgia",
  GRC: "Grécia",
  GTM: "Guatemala",
  HKG: "Hong Kong",
  HND: "Honduras",
  HRV: "Croácia",
  HUN: "Hungria",
  IDN: "Indonésia",
  IND: "Índia",
  IRL: "Irlanda",
  ISL: "Islândia",
  ITA: "Itália",
  JAM: "Jamaica",
  JOR: "Jordânia",
  JPN: "Japão",
  KAZ: "Cazaquistão",
  KGZ: "Quirguistão",
  KHM: "Camboja",
  KOR: "Coreia do Sul",
  LKA: "Sri Lanka",
  LTU: "Lituânia",
  LUX: "Luxemburgo",
  LVA: "Letônia",
  MAR: "Marrocos",
  MDA: "Moldávia",
  MEX: "México",
  MKD: "Macedônia do Norte",
  MLT: "Malta",
  MNG: "Mongólia",
  MUS: "Maurício",
  MYS: "Malásia",
  NIC: "Nicarágua",
  NLD: "Países Baixos",
  NOR: "Noruega",
  NZL: "Nova Zelândia",
  PER: "Peru",
  PHL: "Filipinas",
  POL: "Polônia",
  PRT: "Portugal",
  PRY: "Paraguai",
  ROU: "Romênia",
  RUS: "Rússia",
  SAU: "Arábia Saudita",
  SGP: "Singapura",
  SLV: "El Salvador",
  SRB: "Sérvia",
  SVK: "Eslováquia",
  SVN: "Eslovênia",
  SWE: "Suécia",
  THA: "Tailândia",
  TUN: "Tunísia",
  TUR: "Turquia",
  UKR: "Ucrânia",
  URY: "Uruguai",
  USA: "Estados Unidos",
  WBG: "Cisjordânia e Gaza",
  ZAF: "África do Sul"
};

// Agregados da fonte: não são países e não se somam a eles.
const AGREGADOS_FMI = {
  G163: "Área do euro",
  EZB: "Banco Central Europeu"
};

function descreverPaisFmi(codigo) {
  if (AGREGADOS_FMI[codigo]) return { rotulo: AGREGADOS_FMI[codigo], agregado: true };
  return { rotulo: PAISES_FMI[codigo] ?? codigo, agregado: false };
}

module.exports = { PAISES_FMI, AGREGADOS_FMI, descreverPaisFmi };
