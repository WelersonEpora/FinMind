"use strict";

// Rótulos de exibição das regiões da NOAA VH por cultura (código = `regioes[].codigo` de
// collectors/noaa/noaa-vh.collector.js). País sozinho ("BRASIL"); estado com o prefixo do país ("BR_MT"), para os
// estados ficarem logo depois do país na ordem alfabética. Mundo e hemisférios são `agregado` (vão para o fim da
// lista e ficam marcados): o índice continua 0-100, mas a média de uma área grande dilui choques regionais.
// Uma região que passe a existir sem constar aqui aparece com o código dela, sem quebrar.
const AGREGADOS = {
  MUNDO: "Mundo",
  HEMISFERIO_NORTE: "Hemisfério Norte",
  HEMISFERIO_SUL: "Hemisfério Sul"
};

const REGIOES = {
  EUA: "EUA",
  BRASIL: "Brasil",
  ARGENTINA: "Argentina",
  CHINA: "China",
  UCRANIA: "Ucrânia",
  BR_MT: "Brasil - Mato Grosso",
  BR_PR: "Brasil - Paraná",
  BR_GO: "Brasil - Goiás",
  BR_MS: "Brasil - Mato Grosso do Sul",
  BR_MG: "Brasil - Minas Gerais",
  EUA_IA: "EUA - Iowa",
  EUA_IL: "EUA - Illinois",
  EUA_NE: "EUA - Nebraska",
  EUA_MN: "EUA - Minnesota",
  EUA_IN: "EUA - Indiana"
};

function descreverRegiaoNoaaVh(codigo) {
  if (AGREGADOS[codigo]) return { rotulo: AGREGADOS[codigo], agregado: true };
  return { rotulo: REGIOES[codigo] ?? codigo, agregado: false };
}

module.exports = { descreverRegiaoNoaaVh };
