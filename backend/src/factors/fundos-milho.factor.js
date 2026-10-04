"use strict";

const { criarFatorFundosCot } = require("./modelos/fundos-cot");

// FATOR (PROPOSTA, ADR 0056): posicionamento dos fundos no milho de Chicago, fator "Especulação e posicionamento de
// fundos" do FEL 1. O cálculo é o molde comum do COT (modelos/fundos-cot.js), o mesmo do petróleo e do ouro; aqui ficam
// o mercado (milho da CBOT), os parâmetros e os textos do milho.
//
// A proposta é a R-FUN v0 do David ("Motor do Milho", 2026-10-02, ADR 0055): o extremo é o P10/P90 da posição em 10
// ANOS (não os 3 do petróleo e do ouro), e a leitura é de REVERSÃO (vendido em extremo pesa para alta, a recompra;
// comprado em extremo, para baixa, a liquidação). O FEL 1 diz "amplifica"; o histórico do milho vai com o David: contra
// o Indicador CEPEA/ESALQ (2018 a 2026), a posição relativa de 10 anos tem -0,44 com o indicador 26 semanas depois
// (-0,40 em 2018 a 2021; -0,54 em 2022 a 2026), contra -0,20 com a janela de 3 anos. Com os fundos no P90 ou acima, o
// indicador subiu em 4 de 38 semanas (média -7,8% em 26 semanas); no P10 ou abaixo, em 40 de 62 (+20,4%). São poucos
// episódios independentes (cerca de 6 de vendidos e 4 de comprados): as semanas de um episódio andam juntas.
//
// O "gatilho de alta de F1, F3 ou F8" das regras do David cruza fatores: não entra aqui (é a agregação, pendência do
// ativo). Sem ele, o fator dá a pressão do extremo; o prompt o trata como qualificador, como no petróleo e no ouro.

const FACTOR_ID = "fundos_milho_cot_cbot";
const FACTOR_VERSION = 1;

const SERIES = {
  comprados: "CFTC.CORN.MM_LONG",
  vendidos: "CFTC.CORN.MM_SHORT",
  contratosEmAberto: "CFTC.CORN.OPEN_INTEREST"
};

// Do David (R-FUN v0): o extremo no P10/P90 (posição relativa de 40 pontos) e a variação em 4 semanas. Do FinMind: o
// forte no P5/P95 (45 pontos) e a mudança mínima de 15 pontos (a mesma do ouro). O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 40,
  limiarFortePct: 45,
  semanasTendencia: 4,
  limiarTendenciaPp: 15
});

const fator = criarFatorFundosCot({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  series: SERIES,
  parametrosPadrao: PARAMETROS_PADRAO,
  mercado: "no milho de Chicago",
  leitura: "REVERSAO",
  anosJanela: 10,
  episodios: [
    { data: "2019-05-14", rotulo: "Fundos muito vendidos antes do plantio atrasado de 2019" },
    { data: "2020-06-30", rotulo: "Fundos muito vendidos na pandemia" },
    { data: "2022-01-04", rotulo: "Fundos muito comprados no ciclo de alta de 2021-22" },
    { data: "2024-04-30", rotulo: "Fundos muito vendidos com a safra recorde dos EUA" }
  ],
  nota:
    "Semanal, não é tempo real: a posição é de terça e a CFTC a divulga na sexta seguinte (com feriado, na segunda; " +
    "em 2025 o shutdown atrasou semanas). Fundos = managed money, só futuros, milho da CBOT: mede Chicago, não a B3."
});

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA: fator.METODOLOGIA, derivarFundosMilho: fator.derivar };
