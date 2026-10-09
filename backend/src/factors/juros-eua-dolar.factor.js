"use strict";

const { criarFatorDolarVariacao } = require("./modelos/dolar-variacao");
const d = require("./modelos/dolar-comum");

// FATOR F3 do dólar: juros dos EUA (proposta do dólar, §2.3; os fatores 11 a 14 do relatório do Comitê de 2026-10-08;
// ADR 0126). O primário é o Treasury de 2 anos (FRED DGS2), o vértice mais sensível ao Fed, que faz o papel do FedWatch
// (pago); a confirmação é o de 10 anos (DGS10); a inclinação (DGS10 - DGS2), o juro real (DFII10) e a meta do Fed
// (DFEDTARU) são contexto. Uma decisão do Fed fora do esperado chega como evento (F8).
// Direção (do relatório): o 2 anos subindo pressiona o dólar para ALTA; caindo, para BAIXA.

const FACTOR_ID = "dolar_juros_eua";
const FACTOR_VERSION = 1;

const fator = criarFatorDolarVariacao({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  primario: { serie: "FRED.DGS2", tipo: d.TIPO.PB, acima: d.DIRECAO.ALTA, rotulo: "Treasury de 2 anos", nivel: { unidade: "%", casas: 2 } },
  confirmacao: { serie: "FRED.DGS10", tipo: d.TIPO.PB, acima: d.DIRECAO.ALTA, rotulo: "Treasury de 10 anos", nivel: { unidade: "%", casas: 2 } },
  contexto: [
    { serie: "FRED.DFII10", tipo: d.TIPO.PB, rotulo: "juro real de 10 anos (TIPS)", nivel: { unidade: "%", casas: 2 } },
    { serie: "FRED.DFEDTARU", tipo: d.TIPO.PB, rotulo: "meta do Fed (teto)", nivel: { unidade: "%", casas: 2 } }
  ],
  episodios: [
    { data: "2013-06-21", rotulo: "Taper tantrum: os juros dos EUA disparam" },
    { data: "2022-06-17", rotulo: "Fed sobe 0,75 p.p." },
    { data: "2024-09-20", rotulo: "Fed começa a cortar" },
    { data: "2026-09-30", rotulo: "Setembro de 2026" }
  ],
  apresentacao: {
    graficoAB: {
      titulo: "Treasury de 2 anos (A) e de 10 anos (confirmação), em %",
      unidade: "%",
      casas: 2,
      exigeCampo: "nivel",
      series: [
        { campo: "nivel", rotulo: "2 anos (A)" },
        { campo: "nivelConfirmacao", rotulo: "10 anos (confirmação)" }
      ]
    },
    regra: "o Treasury de 2 anos subindo pressiona o dólar para alta; caindo, para baixa; o de 10 anos apontando o lado oposto limita a fraca; a inclinação (10 anos menos 2 anos), o juro real e a meta do Fed são contexto",
    nota: "Diário, publicado pelo Fed no dia útil seguinte, não é tempo real. A inclinação 2s10s é a diferença entre os dois níveis do quadro A."
  }
});

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES: fator.series, METODOLOGIA: fator.METODOLOGIA, derivarJurosEuaDolar: fator.derivar, calcularJurosEuaDolar: fator.calcular };
