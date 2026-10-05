"use strict";

const { criarFatorFundosCot } = require("./modelos/fundos-cot");
const { PARAMETROS_POSICAO } = require("./modelos/posicao-historica");

// FATOR (PROPOSTA, ADR 0060): posicionamento dos fundos no café arábica (Coffee C da ICE), fator "Especulação e
// posicionamento de fundos" do FEL 1 para o café, como o F7 do Motor do Café v1 (2026-10-04). O cálculo é o molde comum
// do COT (modelos/fundos-cot.js).
//
// Do estudo: managed money do relatório desagregado; COT Index em janelas de 1 e 3 anos (aqui, 3); "neutralidade" na
// zona entre os percentis 20 e 80 (a faixa neutra de 30 pontos); a posição de terça só vale a partir da divulgação de
// sexta (a publicação real, desde 2022-08; estimada antes). A leitura C é a das regras candidatas: vendido em extremo
// pesa para alta, comprado em extremo para baixa (reversão); o "catalisador fundamental" de F1 ou F2 que elas pedem
// cruza fatores e fica para a agregação. O estudo diz que o fator "não possui voto fundamental independente": é
// modificador de risco (como o COT do milho). O extremo forte (P10/P90) é calibração do FinMind.

const FACTOR_ID = "fundos_cafe_cot_ice";
const FACTOR_VERSION = 1;

const SERIES = {
  comprados: "CFTC.COFFEE.MM_LONG",
  vendidos: "CFTC.COFFEE.MM_SHORT",
  contratosEmAberto: "CFTC.COFFEE.OPEN_INTEREST"
};

const PARAMETROS_PADRAO = PARAMETROS_POSICAO;

const fator = criarFatorFundosCot({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  series: SERIES,
  parametrosPadrao: PARAMETROS_PADRAO,
  mercado: "no café arábica (ICE)",
  episodios: [
    { data: "2018-08-21", rotulo: "Fundos no recorde de venda, café abaixo de 1 US$/lb" },
    { data: "2021-07-27", rotulo: "Geadas no Brasil" },
    { data: "2025-02-18", rotulo: "Fundos no recorde de compra, café acima de 4 US$/lb" }
  ],
  nota:
    "Semanal, não é tempo real: a posição é de terça e a CFTC a divulga na sexta seguinte. Fundos = managed money, só " +
    "futuros, Coffee C da ICE (KC): mede Nova York, não a B3. O estudo trata o fator como modificador de risco, sem voto próprio."
});

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIES,
  PARAMETROS_PADRAO,
  METODOLOGIA: fator.METODOLOGIA,
  derivarFundosCafe: fator.derivar
};
