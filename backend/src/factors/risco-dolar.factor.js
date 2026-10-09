"use strict";

const { criarFatorDolarVariacao } = require("./modelos/dolar-variacao");
const d = require("./modelos/dolar-comum");

// FATOR F5 do dólar: aversão a risco global (proposta do dólar, §2.3; os fatores 16 e 18 do relatório do Comitê de
// 2026-10-08; o 17, risco-país, ficou fora: ADR 0117, adendo; ADR 0126). O primário é o VIX (FRED VIXCLS); a confirmação é
// o S&P 500 à vista (FRED SP500; o futuro ES não está no FRED).
// Direção e limiar (do relatório): o VIX ACIMA DE 20 e subindo pressiona o dólar para ALTA; ABAIXO DE 20 e caindo, para
// BAIXA. Fora desses dois casos (acima de 20 e caindo, abaixo de 20 e subindo), neutro: o relatório só define os dois.
// O "subindo" e o "caindo" e a intensidade vêm da régua. O S&P 500 caindo aponta alta do dólar (aversão a risco); subindo,
// baixa: apontando o lado oposto do VIX, limita a fraca.

const FACTOR_ID = "dolar_aversao_risco";
const FACTOR_VERSION = 1;
// O limiar do VIX, do relatório do Comitê (fator 16). Não é parâmetro da régua: é a regra do fator.
const LIMIAR_VIX = 20;

// A regra do relatório sobre a leitura da régua: a alta só acima de 20; a baixa só abaixo dele.
function ajustarPeloNivel(leitura, { nivel }) {
  if (leitura.direcao === d.DIRECAO.ALTA && !(nivel > LIMIAR_VIX)) return { direcao: d.DIRECAO.NEUTRA, intensidade: d.INTENSIDADE.FRACA, foraDoLimiar: true };
  if (leitura.direcao === d.DIRECAO.BAIXA && !(nivel < LIMIAR_VIX)) return { direcao: d.DIRECAO.NEUTRA, intensidade: d.INTENSIDADE.FRACA, foraDoLimiar: true };
  return leitura;
}

const fator = criarFatorDolarVariacao({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  primario: { serie: "FRED.VIXCLS", tipo: d.TIPO.PONTOS, acima: d.DIRECAO.ALTA, rotulo: "VIX", nivel: { unidade: " pontos", casas: 2 } },
  confirmacao: { serie: "FRED.SP500", tipo: d.TIPO.PCT, acima: d.DIRECAO.BAIXA, rotulo: "S&P 500", nivel: { unidade: " pontos", casas: 2 } },
  ajustar: ajustarPeloNivel,
  episodios: [
    { data: "2008-10-24", rotulo: "Crise de 2008" },
    { data: "2020-03-16", rotulo: "Covid: o VIX acima de 80" },
    { data: "2025-04-08", rotulo: "Tarifas dos EUA: o VIX acima de 50" },
    { data: "2026-09-30", rotulo: "Setembro de 2026" }
  ],
  apresentacao: {
    graficoAB: {
      titulo: "VIX (A), em pontos",
      unidade: " pontos",
      casas: 2,
      exigeCampo: "nivel",
      series: [{ campo: "nivel", rotulo: "VIX (A)" }]
    },
    regra: `o VIX acima de ${LIMIAR_VIX} pontos e subindo pressiona o dólar para alta; abaixo de ${LIMIAR_VIX} e caindo, para baixa; fora desses dois casos, neutra (o limiar de ${LIMIAR_VIX} é do relatório do Comitê); o S&P 500 apontando o lado oposto (subindo com o VIX em alta, caindo com o VIX em baixa) limita a fraca`,
    nota: "Diário, publicado no FRED no dia útil seguinte (às vezes com atraso), não é tempo real. O VIX tem copyright da CBOE; o S&P 500 do FRED só tem os últimos 10 anos."
  }
});

module.exports = { FACTOR_ID, FACTOR_VERSION, LIMIAR_VIX, SERIES: fator.series, METODOLOGIA: fator.METODOLOGIA, ajustarPeloNivel, derivarRiscoDolar: fator.derivar, calcularRiscoDolar: fator.calcular };
