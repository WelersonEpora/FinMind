"use strict";

const { criarFatorDolar, SERIE_DOLAR } = require("./modelos/dolar-economias-avancadas");

// FATOR (PROPOSTA, ADR 0050): dólar, fator "Dólar (índice DXY)" do FEL 1 para o ouro. O cálculo é o molde comum do
// dólar (modelos/dolar-economias-avancadas.js), o mesmo do petróleo; aqui ficam o id, os parâmetros padrão e os textos
// do ouro.
//
// No histórico (2006 a 2026, contra a LBMA), o dólar anda com o ouro em sentido contrário (-0,50 com a variação do ouro
// nas 26 semanas anteriores, nos três períodos), como o FEL 1 diz, mas não antecipa o preço (-0,04 com o ouro 26
// semanas depois).

const FACTOR_ID = "dolar_ouro_afe";
const FACTOR_VERSION = 1;

// Os mesmos padrões do petróleo: a medida é a mesma (o desvio do dólar contra a média de 52 semanas), então a
// distribuição dela também. O Comitê ajusta.
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
  nomeAtivo: "o ouro",
  episodios: [
    { data: "2008-10-31", rotulo: "Disparada do dólar na crise de 2008" },
    { data: "2011-08-26", rotulo: "Dólar fraco no pico do ouro de 2011" },
    { data: "2022-09-30", rotulo: "Pico do dólar com a alta de juros do Fed" },
    { data: "2025-04-25", rotulo: "Dólar fraco depois do anúncio das tarifas" }
  ]
});

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIE_DOLAR, PARAMETROS_PADRAO, METODOLOGIA: fator.METODOLOGIA, derivarDolarOuro: fator.derivar };
