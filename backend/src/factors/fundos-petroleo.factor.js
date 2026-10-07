"use strict";

const { criarFatorFundosCot, percentil } = require("./modelos/fundos-cot");

// FATOR (PROPOSTA, ADR 0050): posicionamento dos fundos no WTI, fator "Especulação e posicionamento de fundos (COT)"
// do FEL 1 para o petróleo. O cálculo é o molde comum do COT (modelos/fundos-cot.js); aqui ficam o mercado (WTI da
// NYMEX), os parâmetros padrão e os textos do petróleo.
//
// A leitura C (fundos muito comprados = pressão de BAIXA, risco de reversão) é a da proposta ("posição em extremo
// indica risco de reversão"); o FEL 1 só diz que o fator "amplifica". Só na tela, como referência: na análise o fator é
// SÓ DE INFORMAÇÃO, sem pressão própria (decisão do usuário, ADR 0094), e o prompt leva a posição e a tendência.
//
// No histórico do Brent (2010 a 2026), a posição segue o preço (+0,27 com os 6 meses anteriores), mas não o antecipa,
// e o extremo não mostrou reversão nem continuação por episódio: muito vendidos, o Brent subiu em 66% das semanas 26
// semanas depois (15 episódios; sem sobreposição, p = 0,38); muito comprados, em 54% (o contrário da reversão).

const FACTOR_ID = "fundos_petroleo_cot_wti";
const FACTOR_VERSION = 1;

const SERIES = {
  comprados: "CFTC.CRUDE_WTI.MM_LONG",
  vendidos: "CFTC.CRUDE_WTI.MM_SHORT",
  contratosEmAberto: "CFTC.CRUDE_WTI.OPEN_INTEREST"
};

// Padrões do FinMind (2026-10-03), do histórico do banco de dev (2010 a 2026): a faixa neutra de 30 pontos é o
// percentil 20 a 80 dos 3 anos; o forte, de 40, abaixo do 10 ou acima do 90; a mudança da posição relativa em 4
// semanas tem mediana de ~11 pontos. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 30,
  limiarFortePct: 40,
  semanasTendencia: 4,
  limiarTendenciaPp: 15
});

const fator = criarFatorFundosCot({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  series: SERIES,
  parametrosPadrao: PARAMETROS_PADRAO,
  mercado: "no WTI",
  episodios: [
    { data: "2014-06-24", rotulo: "Fundos muito comprados antes da queda de 2014" },
    { data: "2016-02-16", rotulo: "Fundos muito vendidos no fundo de 2016" },
    { data: "2023-03-14", rotulo: "Fundos muito vendidos na crise dos bancos regionais dos EUA" },
    { data: "2020-04-21", rotulo: "Pandemia (WTI negativo)" },
    { data: "2025-04-08", rotulo: "Fundos muito vendidos depois do anúncio das tarifas" }
  ],
  nota:
    "Semanal, não é tempo real: a posição é de terça e a CFTC a divulga na sexta seguinte (com feriado, na segunda; " +
    "em 2025 o shutdown atrasou semanas). Fundos = managed money, só futuros, WTI da NYMEX."
});

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIES,
  PARAMETROS_PADRAO,
  METODOLOGIA: fator.METODOLOGIA,
  percentil,
  derivarFundosPetroleo: fator.derivar,
  calcularFundosPetroleo: fator.calcular,
  explicarFundos: fator.explicar,
  exemplosFundos: fator.exemplos
};
