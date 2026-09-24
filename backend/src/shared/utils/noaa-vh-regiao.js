"use strict";

// Rótulos de exibição das regiões da NOAA VH por cultura (código = `regioes[].codigo` de
// collectors/noaa/noaa-vh.collector.js). País sozinho ("BRASIL"); estado com o prefixo do país ("BR_MT"), para os
// estados ficarem logo depois do país na ordem alfabética. Nenhum é agregado: o índice é 0-100 em qualquer escala.
// Uma região que passe a existir sem constar aqui aparece com o código dela, sem quebrar.
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
  return { rotulo: REGIOES[codigo] ?? codigo, agregado: false };
}

module.exports = { descreverRegiaoNoaaVh };
