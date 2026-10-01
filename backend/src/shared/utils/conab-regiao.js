"use strict";

// Rótulos de exibição das regiões do milho e do café da Conab (código = rótulo da planilha normalizado pelo
// parser, ver collectors/conab/conab-milho.parser.js e conab-cafe.parser.js). As 27 UFs vêm com o nome por extenso; `agregado` = Brasil,
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
  CENTRO_SUL: "Centro-Sul",
  // Café: as UFs pequenas que a planilha soma numa linha só ("OUTROS (*)").
  OUTROS: "Outras UFs"
};

// Sub-regiões de uma UF (só no café, ADR 0029): código = `<UF>_<nome normalizado>`, montado pelo parser.
const SUB_REGIOES = {
  BA_CERRADO: "Bahia - Cerrado",
  BA_PLANALTO: "Bahia - Planalto",
  BA_ATLANTICO: "Bahia - Atlântico",
  MG_SUL_E_CENTRO_OESTE: "Minas Gerais - Sul e Centro-Oeste",
  MG_TRIANGULO_ALTO_PARANAIBA_E_NOROESTE: "Minas Gerais - Triângulo, Alto Paranaíba e Noroeste",
  MG_ZONA_DA_MATA_RIO_DOCE_E_CENTRAL: "Minas Gerais - Zona da Mata, Rio Doce e Central",
  MG_NORTE_JEQUITINHONHA_E_MUCURI: "Minas Gerais - Norte, Jequitinhonha e Mucuri"
};

// { rotulo, agregado } de uma região; código desconhecido devolve o próprio código (como país, não agregado).
function descreverRegiaoConab(codigo) {
  if (AGREGADOS[codigo]) return { rotulo: AGREGADOS[codigo], agregado: true };
  if (UFS[codigo]) return { rotulo: `${UFS[codigo]} (${codigo})`, agregado: false };
  if (SUB_REGIOES[codigo]) return { rotulo: SUB_REGIOES[codigo], agregado: false };
  return { rotulo: codigo, agregado: false };
}

module.exports = { descreverRegiaoConab, UFS };
