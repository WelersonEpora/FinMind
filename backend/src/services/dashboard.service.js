"use strict";

const marketQuoteRepository = require("../repositories/market-quote.repository");

// Cartões do dashboard inicial. O cartão de cotação do dólar mostra dado
// real assim que a coleta (collectors/bcb/) tiver rodado - os demais
// continuam placeholders explícitos: nenhum valor de mercado (preço,
// variação, sinal) é inventado aqui enquanto o motor analítico não estiver
// configurado.
async function getDashboardCards(deps = {}) {
  const repo = deps.marketQuoteRepository || marketQuoteRepository;
  const cotacaoDolar = await repo.buscarMaisRecente("USD_BRL");

  return {
    ready: false,
    message:
      "O motor analítico do FinMind ainda está aguardando as definições de ativos, fontes e regras do especialista de mercado.",
    cards: [
      {
        id: "cotacao-dolar",
        title: "Cotação do dólar",
        ready: Boolean(cotacaoDolar),
        placeholder: "Nenhuma cotação coletada ainda - ver tela de Coletas.",
        value: cotacaoDolar ? Number(cotacaoDolar.value) : null,
        unit: cotacaoDolar ? cotacaoDolar.unit : null,
        asOf: cotacaoDolar ? cotacaoDolar.reference_date : null
      },
      {
        id: "ativos-monitorados",
        title: "Ativos monitorados",
        ready: false,
        placeholder: "Aguardando definição dos ativos a analisar."
      },
      {
        id: "fontes-de-dados",
        title: "Fontes de dados",
        ready: false,
        placeholder: "Nenhuma fonte de dados configurada ainda."
      },
      {
        id: "analises-executadas",
        title: "Análises executadas",
        ready: false,
        placeholder: "Motor analítico aguardando regras e cálculos."
      },
      {
        id: "sinais-operacionais",
        title: "Sinais operacionais",
        ready: false,
        placeholder: "Critérios de geração de sinais ainda não definidos."
      }
    ]
  };
}

module.exports = { getDashboardCards };
