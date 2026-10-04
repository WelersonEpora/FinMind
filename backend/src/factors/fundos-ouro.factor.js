"use strict";

const { criarFatorFundosCot } = require("./modelos/fundos-cot");

// FATOR (PROPOSTA, ADR 0050): posicionamento dos fundos no ouro, fator "Posicionamento de fundos (COT)" do FEL 1. O
// cálculo é o molde comum do COT (modelos/fundos-cot.js), o mesmo do petróleo; aqui ficam o mercado (ouro da COMEX),
// os parâmetros padrão e os textos do ouro.
//
// A leitura C é a do FEL 1 ("amplifica movimentos em ambos os sentidos"): fundos muito comprados = pressão de ALTA; muito
// vendidos, de baixa. É o contrário da do petróleo (risco de reversão), porque o histórico do ouro (2009 a 2026, contra
// a LBMA) vai nessa direção: com os fundos entre os 10% mais comprados dos 3 anos, o ouro subiu em 76% dos casos 26
// semanas depois (média +8,9%), contra 63% fora dos extremos; entre os 10% mais vendidos, em 68% (média +4,0%). A
// relação muda de regime: +0,41 com o ouro 26 semanas depois em 2009 a 2014, -0,26 em 2015 a 2022 (reversão) e +0,32 em
// 2023 a 2026. A posição segue o preço (+0,49 com as 26 semanas anteriores). Pergunta ao David.

const FACTOR_ID = "fundos_ouro_cot_comex";
const FACTOR_VERSION = 1;

const SERIES = {
  comprados: "CFTC.GOLD.MM_LONG",
  vendidos: "CFTC.GOLD.MM_SHORT",
  contratosEmAberto: "CFTC.GOLD.OPEN_INTEREST"
};

// Os mesmos padrões do petróleo: a posição relativa é um percentil (- 50), então a faixa neutra de 30 pontos é sempre o
// percentil 20 a 80 dos 3 anos e o forte, de 40, abaixo do 10 ou acima do 90. A mudança em 4 semanas tem mediana de
// ~10 pontos no ouro. O Comitê ajusta.
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
  mercado: "no ouro",
  leitura: "AMPLIFICA",
  episodios: [
    { data: "2015-07-07", rotulo: "Fundos muito vendidos perto do fundo de 2015" },
    { data: "2016-05-03", rotulo: "Fundos muito comprados na alta de 2016" },
    { data: "2022-07-05", rotulo: "Fundos muito vendidos com a alta de juros do Fed" },
    { data: "2024-03-12", rotulo: "Fundos muito comprados no início da alta de 2024" }
  ],
  nota:
    "Semanal, não é tempo real: a posição é de terça e a CFTC a divulga na sexta seguinte (com feriado, na segunda; " +
    "em 2025 o shutdown atrasou semanas). Fundos = managed money, só futuros, ouro da COMEX."
});

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA: fator.METODOLOGIA, derivarFundosOuro: fator.derivar };
