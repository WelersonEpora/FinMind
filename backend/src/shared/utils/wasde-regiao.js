"use strict";

// Rótulos de exibição das regiões do WASDE (código = rótulo da fonte
// normalizado pelo parser, ver collectors/wasde/wasde-milho.parser.js).
// `agregado` = soma/grupo de países (não um país): fica em outra ordem e
// marcado na tela, porque a escala é bem maior que a de um país.
//
// Rótulos que MUDARAM ao longo dos anos (EU_27, EU_27_UK, EUROPEAN_UNION,
// FSU_12) são séries distintas - o FinMind não inventa a ponte entre elas
// (ADR 0015). Uma região que passe a existir na fonte sem constar aqui
// aparece com o código dela, sem quebrar.
const REGIOES_WASDE = {
  ARGENTINA: { rotulo: "Argentina" },
  BRAZIL: { rotulo: "Brasil" },
  CANADA: { rotulo: "Canadá" },
  CHINA: { rotulo: "China" },
  EGYPT: { rotulo: "Egito" },
  EUROPEAN_UNION: { rotulo: "União Europeia" },
  EU_27: { rotulo: "União Europeia (UE-27, até 2013)" },
  EU_27_UK: { rotulo: "União Europeia (UE-27 + Reino Unido, 2018-2020)" },
  JAPAN: { rotulo: "Japão" },
  MEXICO: { rotulo: "México" },
  RUSSIA: { rotulo: "Rússia" },
  SOUTH_AFRICA: { rotulo: "África do Sul" },
  SOUTH_KOREA: { rotulo: "Coreia do Sul" },
  SOUTHEAST_ASIA: { rotulo: "Sudeste Asiático" },
  UKRAINE: { rotulo: "Ucrânia" },
  UNITED_STATES: { rotulo: "Estados Unidos" },
  FSU_12: { rotulo: "Ex-URSS (FSU-12, até 2018)", agregado: true },
  MAJOR_EXPORTERS: { rotulo: "Grandes exportadores", agregado: true },
  MAJOR_IMPORTERS: { rotulo: "Grandes importadores", agregado: true },
  TOTAL_FOREIGN: { rotulo: "Total estrangeiro (mundo sem EUA)", agregado: true },
  WORLD: { rotulo: "Mundo", agregado: true },
  WORLD_LESS_CHINA: { rotulo: "Mundo sem China", agregado: true }
};

// { rotulo, agregado } de uma região; código desconhecido devolve o próprio código.
function descreverRegiaoWasde(codigo) {
  const conhecida = REGIOES_WASDE[codigo];
  return { rotulo: conhecida?.rotulo ?? codigo, agregado: Boolean(conhecida?.agregado) };
}

module.exports = { descreverRegiaoWasde };
