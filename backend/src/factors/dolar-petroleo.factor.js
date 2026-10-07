"use strict";

const { criarFatorDolar, SERIE_DOLAR } = require("./modelos/dolar-economias-avancadas");

// FATOR (PROPOSTA, ADR 0050): dólar, fator "Dólar (índice DXY)" do FEL 1 para o petróleo. O cálculo é o molde comum
// do dólar (modelos/dolar-economias-avancadas.js); aqui ficam o id, os parâmetros padrão e os textos do petróleo.
//
// No histórico do Brent futuro (2011 a 2026, ADR 0100), o dólar é o fator do petróleo que mais antecipa o preço, na
// direção do FEL 1: o desvio contra a média de 52 semanas tem -0,19 e -0,35 com o Brent 91 e 182 dias depois (-0,38
// com os 6 meses anteriores). O índice e o papel de fator próprio são decisões do usuário (ADR 0100).

const FACTOR_ID = "dolar_petroleo_afe";
const FACTOR_VERSION = 1;

// Padrões do FinMind (2026-10-03), do histórico do banco de dev desde 2010: |desvio| tem percentis 40/60/80 de
// 1,8 / 2,9 / 4,3%; a mudança do desvio em 4 semanas tem mediana de ~1,2 p.p. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 2,
  limiarFortePct: 5,
  semanasTendencia: 4,
  limiarTendenciaPp: 1.5
});

const fator = criarFatorDolar({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  nomeAtivo: "o petróleo",
  episodios: [
    { data: "2008-10-31", rotulo: "Disparada do dólar na crise de 2008" },
    { data: "2014-12-26", rotulo: "Dólar forte na queda do petróleo de 2014" },
    { data: "2020-03-20", rotulo: "Corrida para o dólar na pandemia" },
    { data: "2022-09-30", rotulo: "Pico do dólar com a alta de juros do Fed" },
    { data: "2025-04-25", rotulo: "Dólar fraco depois do anúncio das tarifas" }
  ]
});

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIE_DOLAR,
  PARAMETROS_PADRAO,
  METODOLOGIA: fator.METODOLOGIA,
  derivarDolarPetroleo: fator.derivar,
  calcularDolarPetroleo: fator.calcular,
  explicarDolar: fator.explicar,
  exemplosDolar: fator.exemplos
};
