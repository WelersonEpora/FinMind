"use strict";

// Cartões do dashboard inicial - todos placeholders explícitos. Nenhum
// valor de mercado (preço, variação, sinal) é inventado aqui: enquanto o
// motor analítico não estiver configurado, o dashboard mostra isso
// claramente em vez de fingir que há dado real.
function getDashboardCards() {
  return {
    ready: false,
    message:
      "O motor analítico do FinMind ainda está aguardando as definições de ativos, fontes e regras do especialista de mercado.",
    cards: [
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
