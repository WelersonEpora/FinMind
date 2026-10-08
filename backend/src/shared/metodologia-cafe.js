"use strict";

const { SITUACAO, VALIDACAO_MOTORES, montarFatores, montarMetodologia } = require("./metodologia-base");
const { resumoParaTela } = require("../factors/agregacao/agregacao-cafe");

// Metodologia dos 8 fatores do café: só as definições (o formato de cada uma está em metodologia-base.js). Fonte do FEL
// 1: a tabela "Fatores de Influência de Preço: Café", v1.1, copiada sem reescrever.
//
// A proposta é o "Motor do Café — Relatório de Análise Técnica, Correções e Regras Revisadas por Fator", versão 1, de
// 2026-10-04, enviado pelo David (docs/Docs_David/Respostas FINMIND_V02.docx; ADR 0060). Diferente do Motor do Milho
// v0, ele NÃO traz limiares: toda regra candidata tem "[CALIBRAR COM DADOS POINT-IN-TIME]" e a marca "Hipótese v0 — não
// validada". O estudo também descarta os pesos fixos e a matriz de correlações do v0. Os limiares que o cálculo usa são
// CALIBRAÇÃO DO FINMIND (a P06 do estudo, autorizada pelo usuário em 2026-10-04): em geral, a posição da medida no
// próprio histórico (factors/modelos/posicao-historica.js), dita no cálculo de cada fator.
//
// Aprovação do Comitê (2026-10-05, ADR 0062): o Motor do Café v1 como está na tela, com os limiares calibrados pelo
// FinMind, vai ao prompt diário, à leitura de tendência da IA e ao Centro de Decisão, como o milho (ADR 0058). Leitura
// de tendência, nunca recomendação: nada daqui gera sinal de compra ou venda. O motor foi validado como está pelo
// Comitê, com o David, em 2026-10-07 (ADR 0108).

// v1 (2026-10-04): os 8 fatores do Motor do Café v1, todos calculados com a calibração do FinMind.
// v2 (2026-10-05): o vencimento do ICF de cada horizonte e a curva no prompt; a pergunta sai (ADR 0078).
// v3 (2026-10-05): as faixas calibradas ficam; a pergunta sai (ADR 0079).
// v4 (2026-10-06): as perguntas do F1 viram decisões; o INMET fica para depois da v1 (ADR 0083).
// v5 (2026-10-06): as perguntas do F2 viram decisões; a bienalidade fica como contexto (ADR 0084).
// v6 (2026-10-06): as perguntas do F3 viram decisões; as pendentes e a ECF como contexto; a validação histórica (ADR 0085).
// v7 (2026-10-06): as perguntas do F4 viram decisões; a validação histórica (ADR 0086).
// v8 (2026-10-06): as perguntas do F5 viram decisões; a validação histórica (ADR 0087).
// v9 (2026-10-06): as perguntas do F6 viram decisões; a faixa neutra calibrada; a validação histórica (ADR 0088).
// v10 (2026-10-06): as perguntas do F7 viram decisões; o catalisador na agregação; a validação histórica (ADR 0089).
// v11 (2026-10-06): as perguntas do F8 viram decisões; o dólar global como condição da baixa (ADR 0090).
// v12 (2026-10-06): a revisão crítica: o F8 volta à v1, com o dólar como contexto (ADR 0090, revisão); o F7 não muda a
// confiança (ADR 0089, revisão); os textos do F6 e do F7 dizem o que o histórico sustenta.
// v13 (2026-10-07): os eventos saem dos 8 fatores e vão a uma seção da base do prompt (ADR 0095).
// v14 (2026-10-07): a agregação em código sai do prompt (ADR 0066, adendo); as perguntas do ativo viram decisões.
// v15 (2026-10-08): o motor validado pelo Comitê, com o David, em 2026-10-07; os fatores saem como validados (ADR 0108).
const VERSAO = 15;
const DATA_VERSAO = "2026-10-08";
const AUTORIA = "Motor do Café v1, relatório enviado pelo David (2026-10-04, ADR 0060)";
const CALIBRACAO =
  "O limiar é calibração do FinMind (o estudo deixa \"[CALIBRAR COM DADOS POINT-IN-TIME]\"): a posição da medida no próprio histórico, neutra do percentil 20 ao 80 (a faixa que o estudo usa no COT), forte abaixo do 10 ou acima do 90.";

const DEFINICOES = [
  {
    codigo: "CAFE_CLIMA",
    nome: "Clima nas regiões de arábica (VHI da NOAA)",
    fel1: {
      tipo: "Climático",
      direcao: "Alta de preço com geada/seca; baixa com clima favorável",
      mecanismo: "Quebra de safra reduz oferta; clima bom eleva produção",
      fonte: "Conab, USDA, Somar Meteorologia"
    },
    dados: {
      observaveis: ["NOAA_VH_CAFE", "CONAB_CAFE"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para a saúde da vegetação, não para a regra inteira: o VHI da NOAA sobre o café é semanal desde 1982, por UF, e os episódios aparecem (a seca de set/2024, posição de -48 pontos, pressão de alta forte; a seca de jan-fev/2014, -44 pontos). As variáveis que o estudo pede (chuva quinzenal, temperatura mínima, horas de frio, balanço hídrico) são do INMET, que não é coletado. A geada não aparece no VHI na semana em que acontece (jul/2021: -24 pontos): ela vem da leitura diária de eventos. A seca de 2014 cai fora das janelas críticas do estudo (junho a novembro) e fica neutra."
      },
      lacunas: [
        "INMET (chuva, temperatura mínima, duração do frio, ponto de orvalho, balanço hídrico): fonte nova, pedida pelo estudo; depois da v1 (ADR 0083).",
        "O Paraná não tem região de café na NOAA: fica fora da ponderação (cerca de 1,5% do arábica em 2026).",
        "Os pesos por UF vêm da Conab desde jan/2023; antes, a aproximação pelos pesos do 1º levantamento na base."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir o estresse da lavoura de arábica nas fases críticas do ciclo (geada no inverno; florada e pegamento na primavera).",
      medida: "O VHI (saúde da vegetação, 0 a 100) sobre a área de café de MG, SP, ES e BA, ponderado pela produção de arábica de cada UF na safra mais nova da Conab.",
      comparacao: "Cada UF contra a mesma semana dos 30 anos anteriores (a \"média climatológica de 30 anos\" do estudo), em percentil; a posição relativa ponderada pelos mesmos pesos.",
      leitura: `Lavoura mais estressada que o normal da semana pesa para alta; mais saudável, para baixa; dentro da faixa, neutra (regras candidatas do estudo). ${CALIBRACAO} Só decide nas janelas críticas do estudo: junho a agosto (geada) e setembro a novembro (florada e pegamento); de dezembro a maio, neutra. Parâmetros ajustáveis pelo Comitê no card C. Decidir.`,
      regrasEspecialista: {
        alta: "Sinal de Alta: Queda expressiva de precipitação no período de desenvolvimento floral/chumbinho por período superior a [CALIBRAR COM DADOS POINT-IN-TIME] semanas consecutivas acompanhada de balanço hídrico negativo, ou registro oficial por estações do INMET de temperaturas foliares negativas com vento calmo e ponto de orvalho favorável a congelamento celular em polos representativos. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Regularidade de precipitação dentro ou moderadamente acima das médias históricas, associada à ausência de alertas de estresse térmico durante as fases de floração e pegamento da safra brasileira. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [],
    decisoes: [
      "Medida da v1 (usuário, 2026-10-06, ADR 0083): o VHI da NOAA sobre a área de arábica, sem o INMET; a geada vem da leitura diária de eventos.",
      "Janelas críticas (usuário, 2026-10-06, ADR 0083): ficam as do estudo, junho a novembro; o enchimento (dezembro a março) não entra. No preço do arábica do FMI (2002 a 2026), a pressão de alta de junho a novembro foi seguida de alta em 3 meses em 78% das semanas (56% em todas as semanas da janela); a de dezembro a março, em 44% (46% em todas): não acrescenta. A seca de verão, como a de 2014, quando o preço subiu durante a seca, chega pelos eventos.",
      "INMET (usuário, 2026-10-06, ADR 0083): fica para depois da v1, como os fatores ausentes do milho (ADR 0080); volta com uma demanda e uma autorização próprias, e o índice (geada ou balanço hídrico) se decide então."
    ]
  },
  {
    codigo: "CAFE_SAFRA_BRASIL",
    nome: "Safra brasileira de arábica (revisões da Conab)",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com safra menor; baixa com safra cheia",
      mecanismo: "Brasil é maior produtor; ciclo bienal alterna anos de alta e baixa produção",
      fonte: "Conab, ICO"
    },
    dados: {
      observaveis: ["CONAB_CAFE", "USDA_PSD_CAFE"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para medir a revisão atual, não para validar: a base tem os levantamentos da Conab desde jan/2023 (15, com o arábica separado do conilon, como o estudo exige), o que dá 11 revisões. Os números do estudo batem com a base: no 3º levantamento de 2026 (24/09), arábica de 48.213 mil sacas (+5,33% contra o 2º, de 45.773; +34,8% contra 2025) e conilon de 19.393 (-6,6% contra 2025). Antes de 2023, a Conab não mantém as páginas (P02 do estudo)."
      },
      lacunas: [
        "Os levantamentos da Conab antes de jan/2023 não estão na base (a fonte não mantém as páginas): o backtest do F2 fica curto.",
        "A expectativa do mercado antes de cada levantamento (a surpresa, §5.2 do estudo) não é coletada.",
        "O USDA (Coffee: World Markets and Trade e o GAIN do Brasil) entra só pelo PSD (balanço por país), sem o ano comercial alinhado ao da Conab."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir se a estimativa oficial de arábica está sendo cortada ou elevada, separando o arábica (o que o ICF negocia) do conilon.",
      medida: "A produção de arábica do Brasil em cada levantamento da Conab (mil sacas); o conilon e a variação contra a safra anterior como contexto (a bienalidade).",
      comparacao: "A revisão do arábica contra o levantamento anterior da MESMA safra, em % (o \"vintage oficial prévio\" do estudo).",
      leitura:
        "Corte do arábica além da margem normal das revisões pesa para alta; elevação, para baixa; revisões marginais, ou só do conilon, são neutras (regras candidatas do estudo). O limiar é calibração do FinMind sobre as 11 revisões do arábica na base (2023 a 2026): faixa neutra de 2% (|revisão| no percentil 40) e forte a partir de 5% (no percentil 80). O 1º levantamento de cada safra não tem revisão. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "Sinal de Alta: Redução das estimativas oficiais de arábica pela Conab ou USDA em magnitude superior a [CALIBRAR COM DADOS POINT-IN-TIME]% em relação ao levantamento imediatamente anterior. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Revisão altista da produção de arábica no levantamento da Conab superior a [CALIBRAR COM DADOS POINT-IN-TIME]% em comparação ao vintage oficial prévio. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [],
    decisoes: [
      "Limiares (usuário, 2026-10-06, ADR 0084): a faixa neutra de 2% e o forte de 5% ficam como ponto de partida, até o backtest. Nas 11 revisões da base, as duas fortes com preço depois (set/2024, -5,99%; mai/2025, +6,61%) foram seguidas do movimento esperado no arábica do FMI em 3 meses (+23,4% e -8,0%); as moderadas se dividiram. São episódios, não validação.",
      "Bienalidade (usuário, 2026-10-06, ADR 0084): fica como contexto, fora da decisão, como o estudo deixa. Na safra de arábica do USDA (PSD, 1992 a 2025, valor final), a queda de 10% ou mais contra a safra anterior foi seguida de preço médio de -2,1% em 12 meses (alta em 5 de 14 anos) e a alta de 10% ou mais, de +16,8% (7 de 13): o ciclo é previsível (o sinal trocou em 28 de 33 anos) e o mercado o precifica; o que move o preço é a revisão."
    ]
  },
  {
    codigo: "CAFE_ESTOQUES",
    nome: "Estoques certificados da ICE",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com estoques baixos; baixa com estoques altos",
      mecanismo: "Nível de inventário indica aperto ou folga de oferta",
      fonte: "ICO, ICE"
    },
    dados: {
      observaveis: ["ICE_CAFE_ESTOQUES", "ICO_CAFE", "ECF_CAFE_ESTOQUES", "USDA_PSD_CAFE"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para a regra do estoque certificado: o relatório diário da ICE (o \"Report 42\" do estudo, ADR 0032) está na base por origem e no total, no servidor desde 2016 (no banco de dev, só desde ago/2026: o fator não decide em dev). A série confirma a ordem de grandeza que o estudo marcou como não confirmada: em ago/2026, o estoque foi de 260,7 mil a 224,0 mil sacas. Validação histórica (ADR 0085), no estoque certificado de Nova York do relatório mensal da ICO (2012 a 2026) contra o preço do arábica do FMI: o estoque não antecipa o preço. Depois de uma queda fora do normal, o preço subiu em 3 meses em 40% dos meses (43% em todos); com o estoque perto da mínima de 5 anos, também em 40%. Ele tende a cair junto com a alta (o café sai da bolsa quando o mercado aperta): confirma, não antecipa."
      },
      lacunas: [
        "As sacas aguardando classificação (pending grading), que a regra de alta cita, vão ao prompt como contexto, fora da decisão (ADR 0085).",
        "Os estoques dos portos europeus (ECF, mensal, com ~2 meses de atraso) vão ao prompt como contexto, fora da decisão (ADR 0085); o estoque certificado de Londres (ICO, mensal) está na base, fora do fator."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir o aperto ou a folga do café entregável na bolsa de Nova York.",
      medida: "O estoque certificado da ICE no último pregão da semana (sacas) e a variação em 4 semanas, em %.",
      comparacao: "A variação em 4 semanas contra as 260 semanas anteriores (5 anos), em percentil.",
      leitura: `Queda do estoque fora do normal pesa para alta; entrada de sacas fora do normal, para baixa (regras candidatas do estudo). O "queda sustentada por mais de [CALIBRAR] sessões" vira a variação em 4 semanas contra o próprio histórico. ${CALIBRACAO} Parâmetros ajustáveis pelo Comitê no card C. Decidir.`,
      regrasEspecialista: {
        alta: "Sinal de Alta: Queda sustentada nos estoques certificados da ICE por mais de [CALIBRAR COM DADOS POINT-IN-TIME] sessões consecutivas acompanhada de redução nos lotes pendentes de certificação. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Injeção contínua e expressiva de novas sacas aprovadas na certificação da ICE associada à elevação dos estoques portuários europeus apurados pela ECF. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [],
    decisoes: [
      "Queda sustentada (usuário, 2026-10-06, ADR 0085): fica a variação em 4 semanas contra o próprio histórico (a v1). No dado mensal da ICO (2012 a 2026), 3 meses seguidos de queda tiveram leve vantagem só em 6 meses (alta em 61%, contra 49% em todos), e meses seguidos não são as sessões do estudo; o teste com o dado diário da ICE fica para o servidor.",
      "Nível do estoque (usuário, 2026-10-06, ADR 0085): não dá direção, fica como contexto (o valor da camada A). Com o estoque abaixo do percentil 20 de 5 anos, o preço subiu em 3 meses em 40% dos meses, contra 43% em todos.",
      "Pendentes e portos europeus (usuário, 2026-10-06, ADR 0085): vão ao prompt como contexto, fora da regra. O sentido do estudo aparece (com a ECF subindo, a queda do certificado foi seguida de alta em 25% dos meses; com a ECF caindo, em 40%), mas com 12 e 15 meses, pouco para condicionar a regra."
    ]
  },
  {
    codigo: "CAFE_DOLAR",
    nome: "Câmbio e incentivo à venda do produtor (PTAX)",
    fel1: {
      tipo: "Cambial",
      direcao: "Alta do dólar pressiona preço em R$ na B3; impacto misto no KC",
      mecanismo: "Café é commodity cotada em US$; câmbio afeta receita do produtor e preço local",
      fonte: "Cepea, BCB"
    },
    dados: {
      observaveis: ["USD_BRL", "CAFE_CECAFE_EMBARQUES"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para a medida da regra: a PTAX de venda (BCB) está na base desde o Plano Real (P01 do estudo já atendida). O ritmo de comercialização das cooperativas, que o estudo usa na leitura, não tem fonte estruturada; os embarques do Cecafé são o mais próximo, por mês. Validação histórica (ADR 0086), de 2005 a 2026 contra o preço mensal do arábica do FMI: o fator não separa o preço. Depois da pressão de baixa, o preço caiu em 1 mês em 52% das semanas (48% em todas) e em 3 meses em 51% (53% em todas); depois da de alta, subiu em 3 meses em 47% (47% em todas). O teste é grosseiro para um fluxo de 10 pregões (o preço do FMI é a média do mês): não dê ao câmbio mais peso do que isso sustenta."
      },
      lacunas: [
        "O ritmo de comercialização física do produtor (cooperativas) não é coletado.",
        "A condição da regra de baixa (preço em reais em patamar recorde no pico da safra) não entra na conta, por decisão (ADR 0086); a PTAX e o preço do ICF já vão ao prompt."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir o incentivo do produtor brasileiro a vender, pelo câmbio.",
      medida: "A PTAX de venda no último dia útil da semana e a variação em 10 pregões, em % (o \"em 10 pregões\" da regra do estudo).",
      comparacao: "A variação em 10 pregões contra as 260 semanas anteriores (5 anos), em percentil.",
      leitura: `Real se valorizando fora do normal (PTAX caindo) desestimula a venda e pesa para alta; real se desvalorizando forte destrava a fixação de vendas e pesa para baixa (regras candidatas do estudo). ${CALIBRACAO} O estudo pede não tratar o repasse como causal e mecânico. Parâmetros ajustáveis pelo Comitê no card C. Decidir.`,
      regrasEspecialista: {
        alta: "Sinal de Alta: Apreciação do Real frente ao Dólar em velocidade superior a [CALIBRAR COM DADOS POINT-IN-TIME]% em 10 pregões, reduzindo a receita em moeda local e desestimulando a fixação de vendas físicas pelos cafeicultores brasileiros. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Depreciação intensa do BRL que eleve as cotações em moeda corrente nacional em patamares recordes, destravando fluxos expressivos de fixação por parte de cooperativas e exportadores durante o pico da safra. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [],
    decisoes: [
      "Regra de baixa o ano todo (usuário, 2026-10-06, ADR 0086): como na v1. Só no pico da safra (maio a outubro), a pressão de baixa foi seguida de queda do preço em 1 mês em 47% das semanas, contra 49% em todas as semanas do pico: restringir não melhora e corta metade dos sinais.",
      "Preço em reais recorde (usuário, 2026-10-06, ADR 0086): não entra como condição da baixa. Com o arábica do FMI em reais acima do percentil 90 de 5 anos, a pressão de baixa foi seguida de queda em 1 mês em 45% das semanas e em 3 meses em 56%; sem ele, 62% e 53%: o resultado se contradiz. A PTAX e o preço do ICF já vão ao prompt."
    ]
  },
  {
    codigo: "CAFE_CUSTO_PRECO_MINIMO",
    nome: "Custo de produção e margem do arábica (Conab × ICF)",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com custos maiores; suporte de piso no preço mínimo",
      mecanismo: "Custo de insumos e política agrícola definem piso",
      fonte: "Conab, MAPA"
    },
    dados: {
      observaveis: ["CAFE_CUSTO_ARABICA_CONAB", "ICF_PRECOS", "USD_BRL"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para a margem de hoje, não para validar: o custo do arábica da Conab (14 municípios, desde 2003) só é conhecido na base desde a 1ª coleta, em 2026-10-01 (a fonte não informa a publicação), então o fator (point-in-time) começa agora. Hoje o ICF (ICFZ26, US$ 351,90/saca, R$ 1.834,53 pela PTAX) está 75% acima do custo total mediano de 2025 (R$ 1.050,74, 7 municípios): neutro. A regra de baixa pede 2 anos de margem. Validação histórica (ADR 0087), de 2011 a 2026, com o preço do grupo Brazilian Naturals da ICO em reais pela PTAX contra a mediana do custo da Conab do ano anterior: o preço ficou abaixo do custo operacional em 2 meses e do total em 6, todos em 2013-14, um episódio só (seguido de alta, que coincidiu com a seca de 2014); abaixo do custo variável, nunca. O fator raramente pesa, e o histórico não basta para validá-lo."
      },
      lacunas: [
        "O preço mínimo do MAPA não é coletado (bloqueado por reCAPTCHA).",
        "A relação de troca café/fertilizante não é calculada (o preço do fertilizante não é coletado).",
        "O custo da Conab é anual e por município; o mais novo na base é de 2025, com 7 municípios. A Conab muda a lista de municípios de um ano para outro (10 com custo em 2024, 7 em 2025), o que mexe na mediana."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir se o preço cobre o custo do cafeicultor, um efeito lento sobre as safras seguintes.",
      medida: "O ICF no vencimento mais próximo, em reais pela PTAX; a mediana do custo operacional e do total por saca do arábica entre os municípios da Conab, no ano mais novo publicado.",
      comparacao: "A margem do preço sobre o custo operacional e sobre o total, em %; o percentil da margem total nas 260 semanas anteriores.",
      leitura:
        "Preço abaixo do custo por período prolongado pesa para alta (margem comprimida, menos trato da lavoura, safras menores depois); margem historicamente alta, para baixa (regras candidatas do estudo). Calibração do FinMind: o \"prolongado\" são 4 semanas seguidas com a margem em 0% ou menos (moderada sobre o custo total, forte sobre o operacional); o \"historicamente alto\", a margem total no percentil 80 ou acima (com 2 anos de histórico). Fator lento, horizonte acima de 90 dias. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "Sinal de Alta: Preço de mercado operando por período prolongado abaixo do Custo Operacional Efetivo nas principais regiões, indicando compressão de margens e desincentivo ao investimento em adubação para os anos subsequentes. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Preços de mercado operando em patamares que representem relação de troca favorável aos produtores em níveis historicamente elevados, estimulando tratos culturais intensivos e incrementos de produtividade futura. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [],
    decisoes: [
      "Praças produtoras (usuário, 2026-10-06, ADR 0087): fica a mediana dos municípios de arábica da Conab. Só Sul de Minas e Cerrado (Guaxupé, Três Pontas e Patrocínio) dariam R$ 1.113 por saca de custo total em 2025, contra R$ 1.051 da mediana (6%): não muda nenhuma leitura com a margem de hoje.",
      "Custo Operacional Efetivo (usuário, 2026-10-06, ADR 0087): fica o custo operacional da Conab, com a ressalva de que ele inclui a depreciação e outros custos fixos e fica um pouco acima do COE estrito (o desembolso, mais perto do custo variável da Conab, de 74% a 94% do operacional). Com o variável, a regra não teria disparado em 15 anos; com o operacional, disparou na única crise de margem (2013)."
    ]
  },
  {
    codigo: "CAFE_DEMANDA",
    nome: "Demanda mundial (consumo no USDA PSD)",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com demanda forte; baixa com recessão",
      mecanismo: "Consumo de café é relativamente estável, mas crises afetam demanda",
      fonte: "ICO, USDA"
    },
    janelaEventos: 30,
    dados: {
      observaveis: ["USDA_PSD_CAFE", "CAFE_PRECO_FMI", "ICO_CAFE"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para o consumo, não para a regra inteira: o PSD do USDA dá o consumo por país desde 1960, mas as versões antigas têm a publicação estimada e só parte dos países, então o fator só decide desde a 1ª coleta (2026). No histórico da versão atual (2003 a 2026), o consumo mundial cresceu de -2,9% a +10,6% ao ano; nenhum dos 24 anos cai na faixa neutra de 1% a 2% do estudo (daí a faixa calibrada, ADR 0088). A importação por bloco e a moagem (ICO, alfândegas da UE e dos EUA) não são coletadas. Validação histórica (ADR 0088), contra o preço do arábica do FMI de julho a julho: o crescimento do consumo não separa o preço (nos 12 anos acima de 2%, o preço subiu em 7 de 11; nos 12 abaixo de 1%, em 8 de 12, com média maior). A arbitragem Nova York ÷ Londres da ICO (2011 a 2026) também não antecipou a substituição: com o arábica caro contra o robusta (acima do percentil 80 de 5 anos), Nova York caiu em 3 meses em 44% dos meses, contra 64% no meio da faixa, e a diferença não fechou."
      },
      lacunas: [
        "As estatísticas de comércio da ICO (desaparecimento aparente, importações) são só para membros: não são coletadas.",
        "As importações por bloco econômico e a moagem industrial não são coletadas.",
        "A substituição de arábica por robusta não entra na decisão: o preço do FMI (mensal) vai como contexto. Desde o ADR 0061, a média mensal de Nova York e de Londres (ICO) está na base, de onde sai a arbitragem que o estudo cita; o robusta diário de Londres (ICE Europe) é pago."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir se o consumo mundial de café está acelerando ou desacelerando contra a tendência.",
      medida: "O consumo mundial da safra mais nova no balanço do USDA (a soma dos países); arábica ÷ robusta no último mês do FMI, como contexto.",
      comparacao: "O crescimento contra a safra anterior, só com os países presentes nas duas; o desvio do meio da faixa neutra do estudo (1,5%).",
      leitura:
        "Consumo crescendo perto da \"taxa tendencial de 1% a 2% a.a.\" do estudo é neutro; bem acima, aceleração pesa para alta; bem abaixo, desaceleração para baixa (regras candidatas). O centro (1,5%) é do estudo; a faixa neutra, de 2 p.p. em torno dele (-0,5% a 3,5%), e o forte, de 4 p.p., são calibração do FinMind sobre 2003 a 2026 (ADR 0088). Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "Sinal de Alta: Aceleração nas importações líquidas de café verde pelos principais blocos consumidores associada a níveis sustentados de desaparecimento aparente reportados pela ICO. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Desaceleração acentuada do volume de café verde absorvido pelas torrefações ou evidência empírica de substituição volumétrica acelerada de arábica por robusta nas indústrias de manufatura. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [],
    decisoes: [
      "Consumo do PSD (usuário, 2026-10-06, ADR 0088): substitui as importações e o desaparecimento aparente da ICO na v1. As estatísticas de comércio da ICO são só para membros, e a aquisição de dados está encerrada.",
      "Faixa neutra calibrada (usuário, 2026-10-06, ADR 0088): 2 p.p. em torno de 1,5% (de -0,5% a 3,5%, perto dos percentis 30 e 70 de 2003 a 2026), no lugar da faixa de 1% a 2% do estudo, em que nenhum ano era neutro. O forte segue em 4 p.p. A faixa maior reduz o ruído (o fator deixa de pressionar todo ano); ela não tem poder preditivo validado: o crescimento do consumo não separa o preço em nenhuma versão, e o teste foi de 12 meses com o valor final do PSD, não nos 30 a 90 dias do fator nem com o dado da época.",
      "Arbitragem Nova York ÷ Londres (usuário, 2026-10-06, ADR 0088): não entra na regra, porque o histórico vai contra a hipótese da substituição; fica como contexto (a razão arábica ÷ robusta do FMI, que já vai ao prompt)."
    ]
  },
  {
    codigo: "CAFE_FUNDOS",
    nome: "Posicionamento dos fundos no café (COT)",
    fel1: {
      tipo: "Técnico/Fluxo",
      direcao: "Amplifica movimentos em ambos os sentidos",
      mecanismo: "Posições de fundos e fluxo de capital amplificam tendências",
      fonte: "CFTC (COT), ICE"
    },
    dados: {
      observaveis: ["COT_CAFE"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o COT desagregado da CFTC traz o managed money do Coffee C toda semana desde 2006, com a publicação real desde 2022-08 (P05 do estudo já atendida). Os extremos aparecem: o recorde de venda em ago/2018 (-34,7% dos contratos em aberto) e o de compra em fev/2025 (+37,5%). Hoje (29/09/2026) os fundos estão no percentil 7,7 dos 3 anos anteriores. Validação histórica (ADR 0089), de 2009 a 2026 contra o preço mensal do arábica do FMI: o extremo sozinho não mostrou reversão. Nas semanas, os vendidos em extremo foram seguidos de alta em 3 meses em 33% (46% em todas) e os comprados, de queda em 39% (54% em todas), mas são cerca de 20 episódios de cada lado e, com uma semana por trimestre, a diferença some (sem significância). O catalisador de F1 ou F2 que a regra pede quase nunca coincidiu com o extremo."
      },
      lacunas: ["A posição por tipo de investidor no ICF (B3) não é coletada: o COT mede Nova York."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir o posicionamento dos fundos em Nova York, como modificador de risco, sem voto próprio.",
      medida: "Posição líquida do managed money (compradas − vendidas), em contratos e em % dos contratos em aberto, e a variação semanal.",
      comparacao: "O percentil da posição em % dos contratos em aberto nos 3 anos anteriores (o COT Index de 3 anos do estudo).",
      leitura:
        "Vendidos em extremo pesam para alta; comprados em extremo, para baixa (as regras candidatas, leitura de reversão). A faixa neutra é a do estudo (percentis 20 a 80); o extremo forte (10 e 90) é calibração do FinMind. O catalisador de F1 ou F2 que as regras pedem cruza fatores e fica para a agregação. O estudo diz que o fator não vota: modifica o risco. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "Sinal de Alta: Posição vendida líquida de fundos atingindo níveis de sobrevenda histórica (percentil inferior a [CALIBRAR COM DADOS POINT-IN-TIME]%), desde que acompanhada por um catalisador fundamental altista confirmado nos módulos de oferta (F1 ou F2). [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Posição comprada líquida de fundos em patamares recordes (percentil superior a [CALIBRAR COM DADOS POINT-IN-TIME]%), desde que confirmada por divergência baixista nos balanços de safra ou recomposição de estoques. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [],
    decisoes: [
      "Janela de 3 anos (usuário, 2026-10-06, ADR 0089): como na v1. No histórico, as duas janelas dão o mesmo resultado; a de 3 anos, um pouco menos ruim em 6 meses.",
      "Só como informação (usuário, 2026-10-06, ADR 0089 e revisão): o extremo não muda a confiança da agregação nem da leitura da IA; o papel dele vai como informação. O catalisador de F1 ou F2 que a regra pede foi tentado e revertido: em 2009 a 2026, nenhuma semana de extremo forte teve o F1 na mesma direção, e o caminho pelo F2 nunca foi testado. O extremo sozinho não mostrou reversão."
    ]
  },
  {
    codigo: "CAFE_JUROS",
    nome: "Juros e liquidez global (Treasury de 10 anos)",
    fel1: {
      tipo: "Macroeconômico",
      direcao: "Juros altos tendem a pressionar commodities; juros baixos favorecem",
      mecanismo: "Custo de carregamento e apetite por risco",
      fonte: "Fed, BCB"
    },
    dados: {
      observaveis: ["TREASURY_10A", "META_FED", "DOLAR_AMPLO_FED"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para o canal do custo de carregar estoque: o Treasury de 10 anos e a meta do Fed (FRED) estão na base desde antes de 2010, os mesmos do fator de juros do petróleo. O DXY oficial é licenciado (o índice amplo do Fed é o substituto, como contexto, ADR 0090) e a inclinação das curvas não é calculada. Validação histórica (ADR 0090), de 2007 a 2026 contra o preço mensal do arábica do FMI: o fator confirma o sentido do estudo. Com o juro caindo, o preço subiu em 3 meses em 57% das semanas e em 6 meses em 63% (49% e 52% em todas); com o juro subindo, caiu em 57% e 55% (51% e 48% em todas); com o juro e o dólar subindo juntos, caiu em 70% e 67%, e com o juro subindo e o dólar caindo, só em 38%, mas por episódio (cerca de 12) a diferença não tem significância (p = 0,25), e só 2022 responde por 37% das semanas. Leia o dólar como contexto, não como condição."
      },
      lacunas: [
        "O DXY oficial (ICE) é licenciado: o índice amplo do Fed o substitui; a inclinação das curvas de juros não é calculada.",
        "A Selic e o diferencial de juros Brasil × EUA ficam no F4, pela regra de dupla contagem do estudo."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir o custo de carregar estoque de café e a liquidez para commodities.",
      medida: "O Treasury de 10 anos na média da semana; a meta do Fed como contexto.",
      comparacao: "A variação do Treasury em 26 semanas, em p.p.; o índice amplo do dólar (Fed) em 26 semanas, em %, como contexto.",
      leitura:
        "Juro em queda pesa para alta (estoque mais barato de carregar, liquidez para commodities); em alta, para baixa (regras candidatas do estudo). O dólar global, que as regras citam, vai como contexto, fora da decisão (ADR 0090, revisão). Limiares do FinMind, os mesmos do petróleo, calibrados na mesma série: faixa neutra de 0,5 p.p. (percentil 60 de |variação em 26 semanas| desde 2010), forte a partir de 1 p.p. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "Sinal de Alta: Ciclo de flexibilização monetária global com corte sincronizado de taxas de juros pelos bancos centrais e enfraquecimento do índice DXY, reduzindo o custo financeiro de estocagem de café e atraindo alocação de liquidez para cestas de matérias-primas. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Aperto monetário quantitativo agressivo com elevação das taxas reais de juros nos EUA e fortalecimento do Dólar global, elevando drasticamente o custo financeiro para manutenção de estoques comerciais e desestimulando a exposição comprada em ativos reais. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [],
    decisoes: [
      "Dólar global como contexto (usuário, 2026-10-06, ADR 0090 e revisão): o índice amplo do Fed em 26 semanas vai ao texto do fator, fora da decisão. A condição só na baixa foi tentada e revertida no mesmo dia: por episódio, a diferença não tem significância, e aplicá-la só onde ajudava era ajuste ao dado (a regra de alta do estudo também cita o dólar).",
      "Juro nominal (usuário, 2026-10-06, ADR 0090): fica o Treasury de 10 anos, como na v1. O juro real (DFII10) foi pior nos dois lados: alta em 3 meses em 51% das semanas e queda em 55%, contra 57% e 57% do nominal."
    ]
  }
];

const FATORES_CAFE = montarFatores("CAFE", DEFINICOES, VALIDACAO_MOTORES);

// O que vale para o ativo, não para um fator (metodologia-base.js): o que o Comitê aprovou em 2026-10-05 (ADR 0062) e o
// que segue em aberto.
const DECISAO_COMITE = "Comitê, 2026-10-05 (ADR 0062)";
const DO_ATIVO = {
  decisoes: [
    `Aprovação do Motor do Café v1 como está na tela, com os limiares calibrados pelo FinMind (a posição no próprio histórico) como ponto de partida; ajustes daqui em diante pelos parâmetros. O café entra no prompt diário, na leitura de tendência da IA e no Centro de Decisão. ${DECISAO_COMITE}.`,
    `Formato da leitura da IA: tendência por horizonte, com as faixas calibradas (como nos outros ativos), não recomendação de compra ou venda. ${DECISAO_COMITE}.`,
    `Preço de referência no prompt e no Centro de Decisão: o ICF da B3 (US$/saca), o vencimento mais próximo negociado, sem emendar contratos; o KC da ICE fica fora (pago). ${DECISAO_COMITE}.`,
    "Vencimento de cada horizonte: o mais próximo que ainda negocia depois da data-alvo (vale até o dia 15 do mês de vencimento), e a leitura e a avaliação do horizonte usam esse contrato; a curva vai ao prompt. Com o mais próximo para todos, o contrato vencia antes da data-alvo em 78% dos dias no horizonte de 90 dias. Liquidez mínima de 100 contratos negociados no dia, só com aviso: no ICF, pouco líquido, o aviso sai em cerca de um quarto dos dias. Usuário (Welerson), 2026-10-05 (ADR 0078).",
    "Faixas da leitura da IA: ficam as calibradas no próprio ICF (percentis 40 e 80 da variação, por horizonte), não as 6 classes fixas do prompt do David (1, 3, 5, 7 e 10%): no ICF, em 90 dias 60% das variações seriam \"excepcional\", e em 1 dia 85% caem nas duas primeiras classes, enquanto as calibradas dão cerca de 40% lateral, 40% leve e 20% forte em todos os horizontes. Usuário (Welerson), 2026-10-05 (ADR 0079).",
    `Horizontes em dias corridos (1, 7, 30 e 90), contados da data da análise, como nos outros ativos (o estudo conta em pregões). ${DECISAO_COMITE}.`,
    `Eventos sem validação humana, por ora, com a janela de 7 dias (30 nos marcados com a demanda). ${DECISAO_COMITE}.`,
    "Onde ficam os eventos (usuário, 2026-10-07, ADR 0095): numa seção só na base do prompt, cada um com a condição que afeta, sem peso nem leitura do motor; nenhum fator do café é de evento. Até então, cada fator recebia os seus (ADR 0062). O que o David pediu na reunião de 2026-10-03 foi avaliar um fator de eventos também no café (ADR 0055, P12), não eventos em cada fator.",
    "O WASDE não cobre café: o balanço do USDA para o café é o PSD (Coffee: World Markets and Trade). David, 2026-10-03 (P14, ADR 0055).",
    "Fontes novas do estudo: o Comitê autorizou em 2026-10-04 as sacas pendentes de classificação da ICE, o relatório mensal da ICO e os portos europeus da ECF, só como dado (ADR 0061). O INMET fica para depois da v1 (usuário, 2026-10-06, ADR 0083); o diário de Londres e do KC, orçamento e licença; o diferencial FOB não tem fonte pública.",
    "Agregação em código (usuário, 2026-10-07, ADR 0066, adendo): sai do prompt e do Centro de Decisão e fica na tela de metodologia como referência, com o script `npm run agregacao:cafe -- --acerto` para medir de novo. No histórico do ICF (dev, 2022 a 2026), não supera o \"sempre lateral\" em faixa exata e distância em nenhum horizonte, e fora do lateral erra a direção na maior parte das vezes (18% a 37% de acerto). A IA segue combinando os fatores pelo prompt, com as regras do estudo como orientação.",
    "A mesma régua no milho (usuário, 2026-10-07): já aplicada; a agregação em código do milho foi medida no histórico e ficou fora do prompt (ADR 0081)."
  ],
  perguntas: []
};

// Os pesos e as relações do estudo (formato em metodologia-base.js): sem pesos (o estudo os descarta) e sem matriz; as
// relações por par (§8) e as regras transversais (§5) como agregação, que vão ao prompt como orientação (ADR 0062). A
// proposta de agregação em código do FinMind (ADR 0066) vem do próprio agregador, separada do que é do David: só na tela.
const PESOS_CAFE = {
  autoria: AUTORIA,
  descricao:
    "os pesos fixos do v0 são descartados: \"devem ser zerados e recalibrados sob protocolo de simulação fora da amostra\". Sem peso por mês nem peso-base novo; cada fator traz o horizonte e a sazonalidade no texto. Os pesos por horizonte da proposta do FinMind (ADR 0066) não são do David.",
  pares: [
    {
      fatores: ["CAFE_CLIMA", "CAFE_SAFRA_BRASIL"],
      sentido: "Convergente estrutural",
      canal: "Anomalias hídricas ou térmicas (F1) afetam a produtividade e a carga do cafezal, sendo quantificadas posteriormente nos boletins de colheita da Conab (F2).",
      defasagem: "De 30 a 120 dias",
      tratamento: "Filtro de precedência: dar peso primário ao F1 durante as fases fenológicas críticas; migrar gradualmente o peso para o F2 à medida que a colheita avança e os dados se tornam oficiais.",
      noPrompt: "Item 6: o clima afeta a lavoura e a Conab quantifica a perda semanas ou meses depois; nas fases críticas, o clima é a informação mais nova; quando a Conab já revisou a safra, a revisão é o dado oficial. A defasagem vai sem número."
    },
    {
      fatores: ["CAFE_SAFRA_BRASIL", "CAFE_ESTOQUES"],
      sentido: "Inverso no balanço de passagem",
      canal: "Revisões expressivas na safra (F2) determinam o potencial de reconstituição dos estoques finais globais e de certificação em bolsa (F3).",
      defasagem: "De 60 a 180 dias",
      tratamento: "Não somar os dois fatores como fontes de evidência concorrentes independentes; F3 atua como confirmação de F2.",
      noPrompt: "Item 6: o mesmo choque na safra e nos estoques é um argumento só; os estoques confirmam a safra: confirmada, ela ganha firmeza; contradita, perde."
    },
    {
      fatores: ["CAFE_DOLAR", "CAFE_FUNDOS"],
      sentido: "Interação via fluxo externo",
      canal: "Oscilações fortes no Real impactam a arbitragem física/financeira e provocam realocação de risco por parte de fundos institucionais no KC.",
      defasagem: "De 5 a 15 pregões",
      tratamento: "Testar defasagens cruzadas (Cross-Correlation Function). Não pressupor simultaneidade instantânea de posições.",
      noPrompt: "Item 9: câmbio e fundos podem interagir com alguns pregões de defasagem; quando andam juntos, não são evidências independentes. O teste de defasagem cruzada não é feito."
    },
    {
      fatores: ["CAFE_CUSTO_PRECO_MINIMO", "CAFE_SAFRA_BRASIL"],
      sentido: "Inverso em horizontes plurianuais",
      canal: "Erosão severa da rentabilidade com preços abaixo do custo operacional (F5) leva ao abandono de tratos culturais, reduzindo safras futuras (F2).",
      defasagem: "De 1 a 3 anos",
      tratamento: "F5 deve ser restrito ao horizonte de longo prazo (>90 dias); o sinal não deve interferir em operações de curto prazo.",
      noPrompt: "Item 1: o custo age sobre as safras seguintes, em anos; só informa o horizonte LONGO, e pouco."
    },
    {
      fatores: ["CAFE_JUROS", "CAFE_ESTOQUES"],
      sentido: "Inverso sobre o carry",
      canal: "Juros internacionais elevados encarecem o carregamento financeiro de mercadorias, estimulando a indústria a operar com estoques mínimos (just-in-time).",
      defasagem: "De 30 a 90 dias",
      tratamento: "Analisar a curva a termo (contango vs. backwardation) para aferir a pressão sobre os estoques certificados da ICE.",
      noPrompt: "Item 10: juro e estoques certificados podem apontar a mesma força (o custo de carregar estoque). A curva a termo não está na base."
    }
  ],
  notaPares:
    "A matriz do v0 foi descartada pelo estudo (\"classificações qualitativas arbitrárias sem base empírica\"). Causalidade de Granger ou VAR serve só para parametrizar defasagens, nunca como regra de convicção.",
  agregacao: [
    {
      tema: "Neutralidade mandatória",
      tratamento:
        "O estado Neutro é compulsório com dados corrompidos, incompletos ou indisponíveis; com a medida dentro da faixa de ruído; ou com conflito interno de variáveis sem priorização objetiva.",
      fatores: ["CAFE_CLIMA", "CAFE_SAFRA_BRASIL", "CAFE_ESTOQUES", "CAFE_DOLAR", "CAFE_CUSTO_PRECO_MINIMO", "CAFE_DEMANDA", "CAFE_FUNDOS", "CAFE_JUROS"],
      noFinMind: {
        situacao: "ORIENTACAO",
        texto:
          "No prompt: um fator sem dado, sem histórico mínimo ou dentro da faixa neutra é neutro, não sinal fraco; o conflito entre blocos, ou entre variáveis sem prioridade objetiva, reduz a confiança, sem a IA resolvê-lo. Na agregação do motor (ADR 0066, no prompt, bloco 3B): sem dado conta 0 e reduz a cobertura; o conflito entre as duas maiores contribuições vira LATERAL com confiança BAIXA."
      }
    },
    {
      tema: "Dupla contagem: clima → safra → estoques",
      tratamento:
        "Choques que afetem os cafezais (F1) aparecem semanas depois nas revisões de safra (F2) e, depois, nos estoques (F3). O mesmo evento não pode acionar vários fatores no balanço geral.",
      fatores: ["CAFE_CLIMA", "CAFE_SAFRA_BRASIL", "CAFE_ESTOQUES"],
      noFinMind: {
        situacao: "ORIENTACAO",
        texto:
          "No prompt (item 6): a cadeia vai como os pares F1 × F2 e F2 × F3 (card Relações entre os fatores, acima): o mesmo choque nos três é um argumento só. Na agregação do motor (ADR 0066, bloco 3B): a família Oferta é um voto, com F1 e F2 pelo maior módulo e o F3 como confirmação."
      }
    },
    {
      tema: "Surpresa contra a expectativa",
      tratamento:
        "O impacto de um relatório depende da surpresa contra o consenso arquivado antes dele. Sem base de consenso, registrar só o sentido da revisão contra o vintage anterior, com peso direcional reduzido.",
      fatores: ["CAFE_SAFRA_BRASIL", "CAFE_DEMANDA"],
      noFinMind: {
        situacao: "ORIENTACAO",
        texto:
          "No prompt: a revisão da Conab é medida contra o levantamento anterior, sem a expectativa do mercado (paga, não coletada), e a IA lhe dá menos firmeza direcional do que o tamanho da revisão sugere. A agregação do motor (ADR 0066) não reduz o score do F2."
      }
    },
    {
      tema: "Fundos como modificador de risco",
      tratamento: "O fator de posicionamento atua exclusivamente como modificador de risco contextual, sem voto fundamental independente.",
      fatores: ["CAFE_FUNDOS"],
      noFinMind: {
        situacao: "ORIENTACAO",
        texto:
          "No prompt: o COT não vota nem muda a confiança; o papel dele vai em posicionamentoCot (confirma, excesso, risco de reversão ou enfraquece) como informação. Na agregação do motor (ADR 0066, bloco 3B): sem peso e sem efeito na confiança; o extremo aparece como informação (ADR 0089, revisão)."
      }
    }
  ],
  agregacaoFinMind: resumoParaTela()
};

function obterMetodologiaCafe() {
  return montarMetodologia({
    ativo: "CAFE",
    nome: "Café",
    versao: VERSAO,
    dataVersao: DATA_VERSAO,
    doAtivo: DO_ATIVO,
    pesos: PESOS_CAFE,
    fatores: FATORES_CAFE
  });
}

module.exports = { SITUACAO, FATORES_CAFE, obterMetodologiaCafe };
