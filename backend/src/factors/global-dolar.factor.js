"use strict";

const { criarFatorDolarVariacao } = require("./modelos/dolar-variacao");
const d = require("./modelos/dolar-comum");

// FATOR F2 do dólar: dólar global (proposta do dólar, §2.3; os fatores 8 a 10 do relatório do Comitê de 2026-10-08;
// ADR 0126). O real é moeda emergente: o primário é o índice do dólar do Fed contra as economias emergentes (FRED
// DTWEXEMEGS), a confirmação é o índice amplo (DTWEXBGS) e o euro e o iene são contexto. O ouro, contexto aprovado, não
// entra no cálculo (o GLD é por vencimento e a LBMA fechou o feed): fica para a leitura do ouro.
// Direção (do relatório): o dólar subindo contra os emergentes pressiona o dólar para ALTA contra o real.
// R2: o Fed publica o índice uma vez por semana (segunda), então o F2 não lê o horizonte de 1 dia.

const FACTOR_ID = "dolar_global";
const FACTOR_VERSION = 1;

const fator = criarFatorDolarVariacao({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  primario: { serie: "FRED.DTWEXEMEGS", tipo: d.TIPO.PCT, acima: d.DIRECAO.ALTA, rotulo: "Índice do dólar contra emergentes (Fed)", nivel: { unidade: "", casas: 2 } },
  confirmacao: { serie: "FRED.DTWEXBGS", tipo: d.TIPO.PCT, acima: d.DIRECAO.ALTA, rotulo: "índice amplo do dólar (Fed)", nivel: { unidade: "", casas: 2 } },
  contexto: [
    { serie: "FRED.DEXUSEU", tipo: d.TIPO.PCT, rotulo: "euro (US$ por euro)", nivel: { unidade: "", casas: 4 } },
    { serie: "FRED.DEXJPUS", tipo: d.TIPO.PCT, rotulo: "iene (ienes por US$)", nivel: { unidade: "", casas: 2 } }
  ],
  r2: { IMEDIATO: "o Fed publica o índice uma vez por semana" },
  episodios: [
    { data: "2008-10-24", rotulo: "Crise de 2008: o dólar dispara contra os emergentes" },
    { data: "2013-06-21", rotulo: "Taper tantrum" },
    { data: "2020-03-20", rotulo: "Covid: corrida para o dólar" },
    { data: "2026-09-30", rotulo: "Setembro de 2026" }
  ],
  apresentacao: {
    graficoAB: {
      titulo: "Índice do dólar contra emergentes (A) e o índice amplo (confirmação), base jan/2006 = 100",
      unidade: "",
      casas: 2,
      exigeCampo: "nivel",
      series: [
        { campo: "nivel", rotulo: "Contra emergentes (A)" },
        { campo: "nivelConfirmacao", rotulo: "Amplo (confirmação)" }
      ]
    },
    regra: "o índice contra emergentes subindo pressiona o dólar para alta contra o real; caindo, para baixa; o índice amplo apontando o lado oposto limita a fraca; R2: sem leitura de 1 dia (o índice sai uma vez por semana)",
    nota: "Diário, publicado pelo Fed uma vez por semana (segunda), não é tempo real. Nenhum dos índices é o DXY (licenciado). O euro e o iene vão como contexto: já estão dentro do índice amplo."
  }
});

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES: fator.series, METODOLOGIA: fator.METODOLOGIA, derivarGlobalDolar: fator.derivar, calcularGlobalDolar: fator.calcular };
