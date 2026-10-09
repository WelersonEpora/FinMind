"use strict";

const { VALIDACAO_DOLAR, montarFatores, montarMetodologia } = require("./metodologia-base");

// Metodologia do dólar (USD/BRL), o 6º ativo: os 8 fatores e a regra da proposta do dólar (docs/proposta-ativo-dolar.md,
// v1), a partir do relatório do Comitê de 2026-10-08, com as 8 decisões tomadas pelo usuário em 2026-10-09, com o mesmo
// poder de decisão do David (ADR 0117, adendo), e a aprovação até o prompt e o Centro de Decisão (ADR 0126). O dólar NÃO
// está no FEL 1: o `fel1` de cada fator é o que a proposta decidida diz, e a origem fica no catálogo (shared/fatores-fel1.js).
//
// Os 8 fatores são os 8 blocos do relatório (decisão 1): os fatores do relatório viram os observáveis de cada bloco, com
// um primário, no máximo uma confirmação e o contexto. Os PESOS são por categoria (decisão 5), a partir dos pontos do
// relatório que sobram em cada bloco (os 3 que faltavam foram para os fatores 10, 16 e 17); a RELEVÂNCIA por horizonte
// (a matriz da §2.7 da proposta) é orientação, não peso. A INTENSIDADE vem da régua (decisão 4), por horizonte. A
// AGREGAÇÃO segue a do milho, do café e da soja: a IA combina os fatores pelo prompt, sem soma ponderada em código.
// Leitura de tendência, nunca recomendação de compra ou venda.

// v1 (2026-10-09): a aprovação (ADR 0126).
const VERSAO = 1;
const DATA_VERSAO = "2026-10-09";
const AUTORIA = "proposta do dólar v1 do FinMind, a partir do relatório do Comitê de 2026-10-08, decidida pelo usuário em 2026-10-09 (ADR 0117, adendo; ADR 0126)";
const DECISAO = "usuário (Welerson), 2026-10-09, ADR 0117, adendo";
const REGUA =
  "A régua (decisão 4): a variação na janela de cada horizonte (1, 5, 20 e 60 dias úteis) contra as da mesma janela nos 3 anos anteriores; neutra abaixo do percentil 40 da variação absoluta, forte a partir do 80, fraca entre os dois. Calibração do FinMind, ajustável pelo Comitê.";
const MEDICAO = "Medição (decisão 1): o primário dá a direção e a intensidade; a confirmação no lado oposto, fora da faixa neutra, limita a fraca; o contexto só informa.";
const VALIDACAO_PENDENTE = "Sem validação histórica ainda: ela é feita pela Qualidade da IA e por um teste depois (ADR 0126).";

const DEFINICOES = [
  {
    codigo: "DOLAR_FLUXO",
    fel1: {
      tipo: "Fluxo",
      direcao: "Alta com a saída líquida de dólares do país (saldo financeiro negativo); baixa com a entrada",
      mecanismo: "O fluxo estrangeiro (investimento, rendas, carteira) é a oferta e a demanda de dólar físico no mercado à vista (o fator 3 do relatório, só a ponta à vista)",
      fonte: "BCB (fluxo cambial contratado, SGS 13961 a 13970)"
    },
    dados: {
      observaveis: ["FLUXO_CAMBIAL_BCB"],
      eventos: false,
      avaliacao: { suficiente: false, texto: `Diário desde 2008, mas divulgado às quartas com os dias até a sexta anterior (5 a 12 dias de atraso) e revisado no mês seguinte. A ponta do futuro e a custódia de não residentes na B3 não são públicas. ${VALIDACAO_PENDENTE}` },
      lacunas: ["O fluxo no mercado futuro e a custódia de não residentes na B3 (o resto do fator 3) não são públicos.", "Sem leitura de 1 dia (R2): a fonte é semanal."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler o fluxo estrangeiro de dólares no mercado à vista.",
      medida: "O saldo do fluxo financeiro contratado acumulado nos últimos 20 dias úteis; o saldo total como confirmação; o comercial como contexto.",
      comparacao: "O tamanho do saldo de 20 dias contra os dos 3 anos anteriores (percentil).",
      leitura: `Saída líquida pressiona para alta; entrada, para baixa. A mesma leitura em 7, 30 e 90 dias; sem leitura de 1 dia (R2). ${MEDICAO}`
    },
    perguntas: [],
    decisoes: [`Fator, primário e direção decididos (${DECISAO}, decisões 1 e 2).`, `Peso Baixo, por categoria, a partir dos 5 pontos do relatório (${DECISAO}, decisão 5).`]
  },
  {
    codigo: "DOLAR_GLOBAL",
    fel1: {
      tipo: "Mercado (dólar global)",
      direcao: "Alta com o dólar subindo contra as moedas emergentes; baixa com ele caindo",
      mecanismo: "O real é moeda emergente: quando o dólar se fortalece contra os pares do real, tende a se fortalecer contra ele (os fatores 8 a 10 do relatório)",
      fonte: "Fed, pelo FRED (DTWEXEMEGS, DTWEXBGS, DEXUSEU, DEXJPUS)"
    },
    dados: {
      observaveis: ["DOLAR_AMPLO_FED", "CAMBIO_DXY_FED"],
      eventos: false,
      avaliacao: { suficiente: true, texto: `Diário desde 2006, publicado pelo Fed uma vez por semana (por isso, sem leitura de 1 dia). Não é o DXY (licenciado). ${VALIDACAO_PENDENTE}` },
      lacunas: ["O DXY da ICE é licenciado: o índice do Fed o substitui.", "O ouro (contexto aprovado) não entra no cálculo: o GLD é por vencimento e a LBMA fechou o feed."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler a força global do dólar contra as moedas parecidas com o real.",
      medida: "O índice do dólar do Fed contra as economias emergentes; o índice amplo como confirmação; o euro e o iene como contexto.",
      comparacao: REGUA,
      leitura: `O índice subindo pressiona para alta; caindo, para baixa. Sem leitura de 1 dia (R2: o índice sai uma vez por semana). ${MEDICAO}`
    },
    perguntas: [],
    decisoes: [`Fator, primário, confirmação e direção decididos; o ouro como contexto, não confirmação (${DECISAO}, decisões 1 e 2).`, `Peso Alto, por categoria, a partir dos 15 pontos do relatório (${DECISAO}, decisão 5).`]
  },
  {
    codigo: "DOLAR_JUROS_EUA",
    fel1: {
      tipo: "Juros (EUA)",
      direcao: "Alta com os juros dos EUA subindo (o 2 anos); baixa com eles caindo",
      mecanismo: "O diferencial de juros: juros americanos mais altos atraem capital para o dólar (os fatores 11 a 14 do relatório)",
      fonte: "Fed e Tesouro dos EUA, pelo FRED (DGS2, DGS10, DFII10, DFEDTARU)"
    },
    dados: {
      observaveis: ["TREASURY_2A", "TREASURY_10A", "META_FED"],
      eventos: false,
      avaliacao: { suficiente: true, texto: `Diário desde 1976 (o 2 anos), publicado no dia útil seguinte. O FedWatch (pago) não entra: o 2 anos faz o papel dele, e a decisão do Fed fora do esperado chega como evento (F8). ${VALIDACAO_PENDENTE}` },
      lacunas: ["O CME FedWatch (fator 11) é pago."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler os juros dos EUA, a ponta americana do diferencial de juros.",
      medida: "O Treasury de 2 anos; o de 10 anos como confirmação; a inclinação, o juro real e a meta do Fed como contexto.",
      comparacao: REGUA,
      leitura: `O 2 anos subindo pressiona para alta; caindo, para baixa. ${MEDICAO}`
    },
    perguntas: [],
    decisoes: [`Fator, primário, confirmação e direção decididos (${DECISAO}, decisões 1 e 2).`, `Peso Alto, por categoria, a partir dos 14 pontos do relatório (${DECISAO}, decisão 5).`]
  },
  {
    codigo: "DOLAR_JUROS_BRASIL",
    fel1: {
      tipo: "Juros (Brasil)",
      direcao: "Alta com a abertura generalizada da curva do DI (os três vértices subindo); baixa com o fechamento",
      mecanismo: "A abertura da curva pré-fixada embute prêmio de risco e de inflação, que anda com o real mais fraco (o fator 15 do relatório)",
      fonte: "B3 (DI1, taxa de ajuste por vencimento, ADR 0118)"
    },
    dados: {
      observaveis: ["DI1_PRECOS"],
      eventos: false,
      avaliacao: { suficiente: false, texto: `Diário, mas só desde 2025-06 (a janela do Up2Data): a régua usa o que há, com o mínimo de 60 variações, até completar 3 anos. ${VALIDACAO_PENDENTE}` },
      lacunas: ["O histórico do DI1 começa em 2025-06 (o Boletim Diário anterior não foi carregado para o DI1)."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler a curva de juros doméstica.",
      medida: "A taxa de ajuste dos contratos de janeiro de 1, 3 e 5 anos à frente (no relatório, F27, F29 e F31).",
      comparacao: `${REGUA} Cada vértice no próprio histórico.`,
      leitura: "Os três abrindo pressionam para alta; os três fechando, para baixa, com a intensidade do mais fraco; mistos ou algum na faixa neutra, neutra."
    },
    perguntas: [],
    decisoes: [
      `Fator, vértices e direção decididos (${DECISAO}, decisões 1 e 2).`,
      `Peso Baixo, por categoria, pela tabela do relatório (5 pontos), embora o texto dele diga que a curva doméstica pesa tanto quanto o DXY: a validação diz se sobe (${DECISAO}, decisão 5).`
    ]
  },
  {
    codigo: "DOLAR_AVERSAO_RISCO",
    fel1: {
      tipo: "Risco global",
      direcao: "Alta com o VIX acima de 20 e subindo; baixa com ele abaixo de 20 e caindo",
      mecanismo: "Em aversão a risco, o capital sai dos emergentes para o dólar (os fatores 16 e 18 do relatório; o 17, risco-país, ficou fora)",
      fonte: "CBOE (VIX) e S&P, pelo FRED (VIXCLS, SP500)"
    },
    dados: {
      observaveis: ["VIX", "SP500"],
      eventos: false,
      avaliacao: { suficiente: true, texto: `O VIX desde 1990; o S&P 500 do FRED só tem os últimos 10 anos. ${VALIDACAO_PENDENTE}` },
      lacunas: ["O risco-país (fator 17: EMBI+ e CDS) ficou fora: sem fonte gratuita (decisão 7).", "O futuro do S&P (ES) não está no FRED: entra o índice à vista."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler a aversão a risco global.",
      medida: "O VIX; o S&P 500 como confirmação.",
      comparacao: `${REGUA} O lado vem do limiar de 20 do relatório.`,
      leitura: `O VIX acima de 20 e subindo pressiona para alta; abaixo de 20 e caindo, para baixa; fora desses dois casos, neutra. ${MEDICAO}`
    },
    perguntas: [],
    decisoes: [`Fator, primário, limiar e direção decididos; o risco-país fora (${DECISAO}, decisões 1, 2 e 7).`, `Peso Médio, por categoria, a partir dos 7 pontos do relatório (${DECISAO}, decisão 5).`]
  },
  {
    codigo: "DOLAR_COMMODITIES",
    fel1: {
      tipo: "Commodities (termos de troca)",
      direcao: "Alta com a maioria das commodities caindo; baixa com a maioria subindo",
      mecanismo: "Commodities mais caras melhoram os termos de troca do Brasil e trazem dólares (os fatores 19, 21 e 22 do relatório)",
      fonte: "Yahoo (Brent, não oficial) e B3 (ICF e SJC)"
    },
    dados: {
      observaveis: ["BRENT_FUTURO_CONTINUO", "ICF_PRECOS", "SJC_PRECOS"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto: `As três só têm leitura juntas desde 2022 (o histórico do ICF e do SJC). No histórico do FinMind (2000 a 2026), o petróleo anda junto com o dólar na mesma janela, mas não o antecipa (53% na janela seguinte, ADR 0117, adendo). ${VALIDACAO_PENDENTE}`
      },
      lacunas: ["O minério de ferro (fator 20) não tem fonte coletada.", "O milho da B3 (CCM) ficou fora: é cotado em reais.", "O Brent é o 1º vencimento contínuo do Yahoo, fonte não oficial (ADR 0096), com os saltos da rolagem."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler os termos de troca pelas commodities cotadas em dólar.",
      medida: "O Brent, o café (ICF) e a soja (SJC), cada um na régua.",
      comparacao: `${REGUA} O café e a soja no contrato mais próximo com as duas pontas da janela.`,
      leitura:
        "A maioria caindo pressiona para alta; subindo, para baixa, com a intensidade da mais fraca da maioria. O petróleo segue a regra linear da tabela; num choque de oferta, o efeito dele sobre o real é incerto (contexto no prompt)."
    },
    perguntas: [],
    decisoes: [
      `Fator e direção decididos: a maioria entre Brent, café e soja, sem o milho (${DECISAO}, decisões 1 e 2).`,
      `O petróleo pela regra linear, com a ressalva do choque de oferta como contexto (${DECISAO}, pergunta 6).`,
      `Peso Médio, por categoria, a partir dos 8 pontos do relatório (${DECISAO}, decisão 5).`
    ]
  },
  {
    codigo: "DOLAR_EXPECTATIVAS",
    fel1: {
      tipo: "Macro (Brasil)",
      direcao: "Alta com as expectativas piorando (o IPCA do ano seguinte revisto para cima); baixa com elas melhorando",
      mecanismo: "A expectativa de inflação desancorando é risco doméstico que enfraquece o real (o fator 24 do relatório, com o 26 como contexto)",
      fonte: "BCB (Focus; balanço de pagamentos)"
    },
    dados: {
      observaveis: ["FOCUS_EXPECTATIVAS", "BALANCO_PAGAMENTOS_BCB"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto: `O Focus semanal desde 2000. Metade das revisões semanais da mediana é zero: uma revisão de 0,01 p.p. já passa do percentil 40 e vira leitura fraca. ${VALIDACAO_PENDENTE}`
      },
      lacunas: ["A balança e as transações correntes são mensais e chegam com um mês de atraso: só contexto."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler se as expectativas domésticas estão desancorando.",
      medida: "A revisão semanal da mediana do IPCA do ano seguinte; a da Selic do ano seguinte como confirmação; o primário, o câmbio do Focus, a balança e as transações correntes como contexto.",
      comparacao: "O tamanho da revisão contra as revisões dos 3 anos anteriores (percentil), com a régua.",
      leitura: `O IPCA revisto para cima pressiona para alta; para baixo, para baixa; a mesma leitura nos quatro horizontes. A Selic confirma na direção do relatório (a nuance do carry fica para a validação). ${MEDICAO}`
    },
    perguntas: [],
    decisoes: [`Fator, primário (o IPCA do ano seguinte), confirmação (a Selic) e direção decididos (${DECISAO}, decisões 1 e 2).`, `Peso Baixo, por categoria, a partir dos 6 pontos do relatório (${DECISAO}, decisão 5).`]
  },
  {
    codigo: "DOLAR_EVENTOS",
    fel1: {
      tipo: "Evento (política e calendário)",
      direcao: "A pressão que a leitura de eventos atribui ao fato: alta quando o fato enfraquece o real; baixa quando o fortalece",
      mecanismo: "Decisões fiscais e monetárias, risco institucional, intervenção extraordinária do BCB e dado econômico com surpresa (os fatores 25, 27 e 28 do relatório)",
      fonte: "Leitura diária de eventos do dólar por IA, nas fontes autorizadas (ADR 0124)"
    },
    evento: { janelaDias: 7 },
    dados: { observaveis: ["BCB_ATUACOES_CAMBIO", "RESERVAS_INTERNACIONAIS_BCB"], eventos: true, lacunas: ["A gravidade e a pressão de cada evento são leitura da IA de eventos, sem validação humana.", "As janelas intradiárias da PTAX (fator 28) ficam com a fase 2."] },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Trazer os fatos de política e de calendário que movem o câmbio de uma vez.",
      medida: "Os eventos aceitos da leitura diária de eventos do dólar marcados com este fator, na janela de 7 dias.",
      comparacao: "Sem baseline: notícia não tem série. A geopolítica e a política comercial vão à seção de eventos da base do prompt, sem fator. As reservas são contexto (pergunta 6).",
      leitura: "Vale o evento mais grave da janela de 7 dias, como a geopolítica do petróleo (ADR 0098). Não vira número contínuo."
    },
    perguntas: [],
    decisoes: [
      `Fator de evento decidido; as atuações do BCB entram por ele, as reservas são contexto (${DECISAO}, decisão 1 e pergunta 6).`,
      `Peso Médio, por categoria, a partir dos 9 pontos do relatório (${DECISAO}, decisão 5).`
    ]
  },
  {
    codigo: "DOLAR_R1_FUNDOS",
    nome: "Posicionamento dos fundos no real (COT)",
    regra: {
      sigla: "R1",
      afeta: ["LEITURA"],
      dimensao: "INFORMACAO",
      quando: "Só no extremo, com direção na leitura, nos horizontes CURTO e MEDIO."
    },
    fel1: {
      tipo: "Regra da leitura consolidada",
      direcao: "Sem direção própria: marca o papel dos fundos na leitura (EXCESSO, ou SEM_PAPEL com o extremo contra)",
      mecanismo: "O COT reage ao preço; no petróleo e no café, o extremo não antecipou reversão nem continuação (ADRs 0089 e 0094). O papel fica gravado com a leitura, para medir depois",
      fonte: "CFTC (COT, relatório TFF, fundos alavancados no real da CME)"
    },
    dados: { observaveis: ["COT_REAL"], eventos: false, lacunas: ["O histórico do real na CFTC tem semanas faltando."] },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Marcar o papel dos fundos na leitura consolidada, como no café e na soja, só como informação.",
      medida: "A posição líquida dos fundos alavancados no real em % dos contratos em aberto.",
      comparacao: "O percentil dos 3 anos anteriores; extremo no 10 ou abaixo e no 90 ou acima (os do café).",
      leitura: "No extremo, lido como reversão: comprados em real apontam alta do dólar; vendidos, baixa. Com a leitura no mesmo lado, EXCESSO; no oposto, SEM_PAPEL com o extremo contra. Não muda a direção, a faixa nem a confiança."
    },
    perguntas: [],
    decisoes: [`Regra decidida como no café e na soja; o relatório dava direção ao fator 7 (${DECISAO}, decisão 3).`]
  }
];

const FATORES_DOLAR = montarFatores("DOLAR", DEFINICOES, VALIDACAO_DOLAR);

const DO_ATIVO = {
  decisoes: [
    `O dólar (USD/BRL) é o 6º ativo: os 8 fatores (os blocos do relatório do Comitê de 2026-10-08), a regra dos fundos e a medição da proposta do dólar, até o prompt diário, a leitura de tendência da IA e o Centro de Decisão (${DECISAO}; ADR 0126).`,
    `Preço de referência: a PTAX de venda do BCB (desde 1994, sem vencimento nem rolagem). O ajuste do DOL vai à leitura como contexto e fica como a referência da fase 2, o day-trade (${DECISAO}, decisão 6).`,
    "Faixas da leitura da IA: calibradas na própria PTAX (percentis 40 e 80 da variação, por horizonte, de 2010 a 2026), como nos outros ativos (ADR 0079).",
    "Horizontes em dias corridos (1, 7, 30 e 90), como nos outros ativos. O de 1 dia mede a PTAX contra a do dia anterior, não o fechamento contra o ajuste (a métrica do §11 do relatório).",
    `Pesos por categoria, como na soja: Alto, F2 e F3; Médio, F8, F6 e F5; Baixo, F7, F1 e F4. A matriz por horizonte (§2.7 da proposta) é relevância, não peso. A agregação segue a do milho, do café e da soja: a IA combina os fatores pelo prompt, sem soma ponderada em código. A fórmula do score do relatório (Σ w·s·C·N − Ω) não é adotada (${DECISAO}, decisão 5).`,
    `A régua de intensidade por horizonte (decisão 4) e a regra de defasagem (R2): o fluxo e o índice do Fed, semanais, não leem o horizonte de 1 dia.`,
    `A medição: os benchmarks da Qualidade da IA (ADR 0064), sem a meta fixa de 80% do relatório (${DECISAO}, decisão 8).`,
    "O day-trade (o ciclo intradiário, as três estratégias, o controle de risco por operação) é a fase 2, num módulo próprio (ADR 0117). Nenhuma execução automática de ordens."
  ],
  perguntas: []
};

const relevancia = (imediato, curto, medio, longo) =>
  Object.fromEntries(
    [
      ["IMEDIATO", imediato],
      ["CURTO", curto],
      ["MEDIO", medio],
      ["LONGO", longo]
    ].map(([h, [nivel, nota]]) => [h, { nivel, nota }])
  );
const SEM_1_DIA = "sem leitura de 1 dia, pela R2: o dado sai uma vez por semana";
const PESOS_DOLAR = {
  autoria: "o usuário (Welerson), em 2026-10-09 (ADR 0117, adendo; ADR 0126)",
  descricao:
    "o peso é por categoria (Alto, Médio, Baixo), a partir dos pontos do relatório do Comitê que sobram em cada bloco, igual em todos os horizontes. A relevância por horizonte não é peso: diz em que prazo o fator costuma mover o preço e vai ao prompt como orientação. A agregação segue a do milho, do café e da soja: a IA combina os fatores pelo prompt, sem soma ponderada em código. A regra R1 (os fundos) não tem peso.",
  relevancia: {
    descricao:
      "Em que prazo cada fator costuma mover o dólar (proposta do dólar, §2.7; hipótese, sem validação histórica). Não muda o peso: um fator de peso Médio com relevância alta (os eventos em 1 e 7 dias) pode ser a força dominante quando há evento grave.",
    fatores: {
      DOLAR_FLUXO: relevancia(["Baixa", SEM_1_DIA], ["Média"], ["Alta"], ["Média"]),
      DOLAR_GLOBAL: relevancia(["Baixa", SEM_1_DIA], ["Alta"], ["Alta"], ["Média"]),
      DOLAR_JUROS_EUA: relevancia(["Média"], ["Alta"], ["Alta"], ["Alta"]),
      DOLAR_JUROS_BRASIL: relevancia(["Alta"], ["Alta"], ["Alta"], ["Média"]),
      DOLAR_AVERSAO_RISCO: relevancia(["Alta"], ["Média"], ["Baixa"], ["Baixa"]),
      DOLAR_COMMODITIES: relevancia(["Baixa"], ["Média"], ["Média"], ["Média"]),
      DOLAR_EXPECTATIVAS: relevancia(["Baixa"], ["Média"], ["Alta"], ["Alta"]),
      DOLAR_EVENTOS: relevancia(["Alta"], ["Alta"], ["Média"], ["Baixa", "média se a medida for duradoura"])
    }
  }
};

function obterMetodologiaDolar() {
  return montarMetodologia({
    ativo: "DOLAR",
    nome: "Dólar",
    versao: VERSAO,
    dataVersao: DATA_VERSAO,
    doAtivo: DO_ATIVO,
    pesos: PESOS_DOLAR,
    fatores: FATORES_DOLAR
  });
}

module.exports = { FATORES_DOLAR, obterMetodologiaDolar };
