"use strict";

// Rótulos de exibição das regiões do milho da Conab (código = rótulo da planilha normalizado pelo parser,
// ver collectors/conab/conab-milho.parser.js). As 27 UFs vêm com o nome por extenso; `agregado` = Brasil,
// macrorregião ou combinação de regiões (soma de UFs, escala bem maior que a de uma UF): fica em outra
// ordem e marcado na tela. Uma região que passe a existir na planilha sem constar aqui aparece com o
// código dela, sem quebrar.
const UFS = {
  AC: "Acre",
  AL: "Alagoas",
  AM: "Amazonas",
  AP: "Amapá",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MG: "Minas Gerais",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  SE: "Sergipe",
  SP: "São Paulo",
  TO: "Tocantins"
};

const AGREGADOS = {
  BRASIL: "Brasil",
  NORTE: "Região Norte",
  NORDESTE: "Região Nordeste",
  CENTRO_OESTE: "Região Centro-Oeste",
  SUDESTE: "Região Sudeste",
  SUL: "Região Sul",
  NORTE_NORDESTE: "Norte/Nordeste",
  CENTRO_SUL: "Centro-Sul"
};

// { rotulo, agregado } de uma região; código desconhecido devolve o próprio código (como país, não agregado).
function descreverRegiaoConab(codigo) {
  if (AGREGADOS[codigo]) return { rotulo: AGREGADOS[codigo], agregado: true };
  if (UFS[codigo]) return { rotulo: `${UFS[codigo]} (${codigo})`, agregado: false };
  return { rotulo: codigo, agregado: false };
}

module.exports = { descreverRegiaoConab };
