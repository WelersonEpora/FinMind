"use strict";

// Rótulos dos locais do custo de produção do café da Conab (ADR 0043). O código é montado pelo coletor a partir do
// nome da aba ("S.S. Paraíso-MG-S.Mec" -> "S_S_PARAISO_MG_S_MEC"); os 25 presentes em 2026-10-01. Um local novo
// aparece com o próprio código, sem quebrar.
const LOCAIS = {
  BARRA_DO_CHOCA_BA: "Barra do Choça (BA)",
  L_EDUARDO_BA: "Luís Eduardo Magalhães (BA)",
  VENDA_N_IMIGRANTE_ES: "Venda Nova do Imigrante (ES)",
  CRISTALINA_GO: "Cristalina (GO)",
  GUAXUPE_MG: "Guaxupé (MG)",
  GUAXUPE_MG_S_MEC: "Guaxupé (MG), sem mecanização",
  GUAXUPE_MG_MEC: "Guaxupé (MG), mecanizado",
  MANHUACU_MG: "Manhuaçu (MG)",
  PATROCINIO_MG: "Patrocínio (MG)",
  S_S_PARAISO_MG_S_MEC: "São Sebastião do Paraíso (MG), sem mecanização",
  S_S_PARAISO_MG_MEC: "São Sebastião do Paraíso (MG), mecanizado",
  TRES_PONTAS_MG: "Três Pontas (MG)",
  LONDRINA_PR: "Londrina (PR)",
  FRANCA_SP: "Franca (SP)",
  ITABELA_BA: "Itabela (BA)",
  PINHEIROS_ES: "Pinheiros (ES)",
  JAGUARE_ES: "Jaguaré (ES)",
  RIO_BANANAL_ES: "Rio Bananal (ES)",
  CASTELO_ES: "Castelo (ES)",
  COLATINA_ES: "Colatina (ES)",
  JI_PARANA_RO: "Ji-Paraná (RO)",
  CACOAL_RO: "Cacoal (RO)",
  MACHADINHO_D_OESTE_RO: "Machadinho d'Oeste (RO)",
  R_MOURA_RO: "Rolim de Moura (RO)",
  NOVA_BRASILANDIA_RO: "Nova Brasilândia d'Oeste (RO)"
};

function descreverLocalCustoCafe(codigo) {
  return { rotulo: LOCAIS[codigo] || codigo, agregado: false };
}

module.exports = { descreverLocalCustoCafe };
