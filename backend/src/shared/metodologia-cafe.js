"use strict";

const { SITUACAO, montarFatores, montarMetodologia } = require("./metodologia-base");
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
// de tendência, nunca recomendação: nada daqui gera sinal de compra ou venda.

// v1 (2026-10-04): os 8 fatores do Motor do Café v1, todos calculados com a calibração do FinMind.
// v2 (2026-10-05): o vencimento do ICF de cada horizonte e a curva no prompt; a pergunta sai (ADR 0078).
const VERSAO = 2;
const DATA_VERSAO = "2026-10-05";
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
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["NOAA_VH_CAFE", "CONAB_CAFE"],
      eventos: true,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para a saúde da vegetação, não para a regra inteira: o VHI da NOAA sobre o café é semanal desde 1982, por UF, e os episódios aparecem (a seca de set/2024, posição de -48 pontos, pressão de alta forte; a seca de jan-fev/2014, -44 pontos). As variáveis que o estudo pede (chuva quinzenal, temperatura mínima, horas de frio, balanço hídrico) são do INMET, que não é coletado. A geada não aparece no VHI na semana em que acontece (jul/2021: -24 pontos): ela vem da leitura diária de eventos. A seca de 2014 cai fora das janelas críticas do estudo (junho a novembro) e fica neutra."
      },
      lacunas: [
        "INMET (chuva, temperatura mínima, duração do frio, ponto de orvalho, balanço hídrico): fonte nova, pedida pelo estudo.",
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
    perguntas: [
      "Sem o INMET, o VHI da NOAA (satélite) serve como medida de estresse da v1, com a geada vindo da leitura diária de eventos?",
      "A seca de jan-fev/2014 (enchimento dos grãos) ficou fora das janelas críticas do estudo (junho a novembro). O enchimento de dezembro a março entra como janela crítica?",
      "O INMET entra como fonte nova (o estudo pede; a aquisição está encerrada desde 2026-10-01 e precisa de autorização num ADR)?"
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
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["CONAB_CAFE", "USDA_PSD_CAFE"],
      eventos: true,
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
    perguntas: [
      "Com 11 revisões na base, a faixa neutra de 2% e o forte de 5% servem como ponto de partida, até o backtest?",
      "A bienalidade (a variação contra a safra anterior: +34,8% em 2026) entra na decisão, ou fica como contexto, como o estudo deixa?"
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
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["ICE_CAFE_ESTOQUES", "ICO_CAFE", "ECF_CAFE_ESTOQUES", "USDA_PSD_CAFE"],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para a regra do estoque certificado: o relatório diário da ICE (o \"Report 42\" do estudo, ADR 0032) está na base por origem e no total, no servidor desde 2016 (no banco de dev, só desde ago/2026: o fator não decide em dev). A série confirma a ordem de grandeza que o estudo marcou como não confirmada: em ago/2026, o estoque foi de 260,7 mil a 224,0 mil sacas."
      },
      lacunas: [
        "As sacas aguardando classificação (pending grading), que a regra de alta cita, estão na base desde o ADR 0061 (só o total, no card da ICE), mas fora da decisão: falta definir o que é \"redução nos lotes pendentes\".",
        "Os estoques dos portos europeus (ECF, mensal, com ~2 meses de atraso) e o estoque certificado de Londres (ICO, mensal) estão na base desde o ADR 0061, fora da decisão: a regra de baixa cita a ECF sem limiar."
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
    perguntas: [
      "A variação em 4 semanas contra o próprio histórico representa a \"queda sustentada\", ou o Comitê prefere contar sessões seguidas de queda?",
      "O nível do estoque (perto da mínima de anos) também deve dar direção, além do ritmo?",
      "Com as sacas pendentes de classificação e os portos europeus na base (ADR 0061), como entram na regra? Ex.: queda do certificado só conta com as pendentes também caindo; entrada de sacas só conta com a ECF subindo no último dado."
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
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["USD_BRL", "CAFE_CECAFE_EMBARQUES"],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para a medida da regra: a PTAX de venda (BCB) está na base desde o Plano Real (P01 do estudo já atendida). O ritmo de comercialização das cooperativas, que o estudo usa na leitura, não tem fonte estruturada; os embarques do Cecafé são o mais próximo, por mês."
      },
      lacunas: [
        "O ritmo de comercialização física do produtor (cooperativas) não é coletado.",
        "A condição da regra de baixa (preço em reais em patamar recorde no pico da safra) não entra na conta."
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
    perguntas: [
      "A regra de baixa vale o ano todo, ou só no pico da safra (maio a outubro, como o estudo diz que o efeito é mais relevante)?",
      "O preço em reais \"em patamar recorde\" entra como condição da baixa (o ICF em reais, pela PTAX, desde 2022)?"
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
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["CAFE_CUSTO_ARABICA_CONAB", "ICF_PRECOS", "USD_BRL"],
      eventos: true,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para a margem de hoje, não para validar: o custo do arábica da Conab (14 municípios, desde 2003) só é conhecido na base desde a 1ª coleta, em 2026-10-01 (a fonte não informa a publicação), então o fator (point-in-time) começa agora. Hoje o ICF (ICFZ26, US$ 351,90/saca, R$ 1.834,53 pela PTAX) está 75% acima do custo total mediano de 2025 (R$ 1.050,74, 7 municípios): neutro. A regra de baixa pede 2 anos de margem."
      },
      lacunas: [
        "O preço mínimo do MAPA não é coletado (bloqueado por reCAPTCHA).",
        "A relação de troca café/fertilizante não é calculada (o preço do fertilizante não é coletado).",
        "O custo da Conab é anual e por município; o mais novo na base é de 2025, com 7 municípios."
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
    perguntas: [
      "A mediana dos municípios da Conab representa as \"praças produtoras padrão\", ou o Comitê escolhe municípios (ex.: Sul de Minas e Cerrado)?",
      "O custo operacional da Conab serve como o \"Custo Operacional Efetivo\" do estudo?"
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
    evento: { janelaDias: 30 },
    dados: {
      observaveis: ["USDA_PSD_CAFE", "CAFE_PRECO_FMI", "ICO_CAFE"],
      eventos: true,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para o consumo, não para a regra inteira: o PSD do USDA dá o consumo por país desde 1960, mas as versões antigas têm a publicação estimada e só parte dos países, então o fator só decide desde a 1ª coleta (2026). No histórico da versão atual (2003 a 2026), o consumo mundial cresceu de -2,9% a +10,6% ao ano; só 2 dos 24 anos caem na faixa neutra de 1% a 2% do estudo. A importação por bloco e a moagem (ICO, alfândegas da UE e dos EUA) não são coletadas."
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
        "Consumo crescendo dentro da \"taxa tendencial de 1% a 2% a.a.\" é neutro (o limiar é do estudo); acima, aceleração pesa para alta; abaixo, desaceleração para baixa (regras candidatas). O forte (4 p.p. de desvio) é calibração do FinMind: o percentil 80 do desvio de 2003 a 2026. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "Sinal de Alta: Aceleração nas importações líquidas de café verde pelos principais blocos consumidores associada a níveis sustentados de desaparecimento aparente reportados pela ICO. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Desaceleração acentuada do volume de café verde absorvido pelas torrefações ou evidência empírica de substituição volumétrica acelerada de arábica por robusta nas indústrias de manufatura. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [
      "O consumo do PSD (por país) substitui as importações e o desaparecimento aparente da ICO na v1?",
      "Com o consumo variando de -3% a +11% ao ano, a faixa neutra de 1% a 2% do estudo deixa quase todo ano com pressão. Ela fica, ou vira uma faixa calibrada?",
      "A arbitragem Nova York − Londres da ICO (mensal, na base desde o ADR 0061) entra como a medida da substituição de arábica por robusta?"
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
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["COT_CAFE"],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o COT desagregado da CFTC traz o managed money do Coffee C toda semana desde 2006, com a publicação real desde 2022-08 (P05 do estudo já atendida). Os extremos aparecem: o recorde de venda em ago/2018 (-34,7% dos contratos em aberto) e o de compra em fev/2025 (+37,5%). Hoje (29/09/2026) os fundos estão no percentil 7,7 dos 3 anos anteriores."
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
    perguntas: [
      "Janela de 1 ou de 3 anos para o percentil (o estudo cita as duas)? A v1 usa 3.",
      "Sem o catalisador de F1 ou F2, o extremo sozinho já é pressão (a v1), ou só vale com ele, como na regra?"
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
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["TREASURY_10A", "META_FED"],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para o canal do custo de carregar estoque: o Treasury de 10 anos e a meta do Fed (FRED) estão na base desde antes de 2010, os mesmos do fator de juros do petróleo. O DXY oficial é licenciado (o índice do Fed é o substituto) e a inclinação das curvas não é calculada."
      },
      lacunas: [
        "O DXY oficial (ICE) é licenciado; a inclinação das curvas de juros não é calculada.",
        "A Selic e o diferencial de juros Brasil × EUA ficam no F4, pela regra de dupla contagem do estudo."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Medir o custo de carregar estoque de café e a liquidez para commodities.",
      medida: "O Treasury de 10 anos na média da semana; a meta do Fed como contexto.",
      comparacao: "A variação do Treasury em 26 semanas, em p.p.",
      leitura:
        "Juro em queda pesa para alta (estoque mais barato de carregar, liquidez para commodities); em alta, para baixa (regras candidatas do estudo). Limiares do FinMind, os mesmos do petróleo, calibrados na mesma série: faixa neutra de 0,5 p.p. (percentil 60 de |variação em 26 semanas| desde 2010), forte a partir de 1 p.p. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "Sinal de Alta: Ciclo de flexibilização monetária global com corte sincronizado de taxas de juros pelos bancos centrais e enfraquecimento do índice DXY, reduzindo o custo financeiro de estocagem de café e atraindo alocação de liquidez para cestas de matérias-primas. [Hipótese v0 — não validada; não usar para ordem].",
        baixa: "Sinal de Baixa: Aperto monetário quantitativo agressivo com elevação das taxas reais de juros nos EUA e fortalecimento do Dólar global, elevando drasticamente o custo financeiro para manutenção de estoques comerciais e desestimulando a exposição comprada em ativos reais. [Hipótese v0 — não validada; não usar para ordem]."
      }
    },
    perguntas: [
      "O dólar global (o índice do Fed, substituto do DXY) entra como condição das regras, como o estudo escreve, ou fica fora do F8?",
      "O juro nominal de 10 anos serve, ou o estudo quer o juro real (como no ouro)?"
    ]
  }
];

const FATORES_CAFE = montarFatores("CAFE", DEFINICOES);

// O que vale para o ativo, não para um fator (metodologia-base.js): o que o Comitê aprovou em 2026-10-05 (ADR 0062) e o
// que segue em aberto.
const DECISAO_COMITE = "Comitê, 2026-10-05 (ADR 0062)";
const DO_ATIVO = {
  decisoes: [
    `Aprovação do Motor do Café v1 como está na tela, com os limiares calibrados pelo FinMind (a posição no próprio histórico) como ponto de partida; ajustes daqui em diante pelos parâmetros. O café entra no prompt diário, na leitura de tendência da IA e no Centro de Decisão. ${DECISAO_COMITE}.`,
    `Formato da leitura da IA: tendência por horizonte, com as faixas calibradas (como nos outros ativos), não recomendação de compra ou venda. ${DECISAO_COMITE}.`,
    `Preço de referência no prompt e no Centro de Decisão: o ICF da B3 (US$/saca), o vencimento mais próximo negociado, sem emendar contratos; o KC da ICE fica fora (pago). ${DECISAO_COMITE}.`,
    "Vencimento de cada horizonte: o mais próximo que ainda negocia depois da data-alvo (vale até o dia 15 do mês de vencimento), e a leitura e a avaliação do horizonte usam esse contrato; a curva vai ao prompt. Com o mais próximo para todos, o contrato vencia antes da data-alvo em 78% dos dias no horizonte de 90 dias. Liquidez mínima de 100 contratos negociados no dia, só com aviso: no ICF, pouco líquido, o aviso sai em cerca de um quarto dos dias. Usuário (Welerson), 2026-10-05 (ADR 0078).",
    `Horizontes em dias corridos (1, 7, 30 e 90), contados da data da análise, como nos outros ativos (o estudo conta em pregões). ${DECISAO_COMITE}.`,
    `Eventos por fator: o David pediu avaliar a leitura de eventos também no café (P12, ADR 0055). Cada fator recebe os eventos que a leitura diária por IA marca com ele (7 dias de janela; 30 na demanda), sem validação humana por ora, e eles vão ao prompt depois do cálculo. ${DECISAO_COMITE}.`,
    "O WASDE não cobre café: o balanço do USDA para o café é o PSD (Coffee: World Markets and Trade). David, 2026-10-03 (P14, ADR 0055).",
    "Fontes novas do estudo: o Comitê autorizou em 2026-10-04 as sacas pendentes de classificação da ICE, o relatório mensal da ICO e os portos europeus da ECF, só como dado (ADR 0061). O INMET espera o índice do David; o diário de Londres e do KC, orçamento e licença; o diferencial FOB não tem fonte pública."
  ],
  perguntas: [
    "Faixas da leitura da IA: hoje são os percentis 40 e 80 do ICF no vencimento mais próximo (2022 a 2026, um período de alta forte), por horizonte. Ficam, ou o Comitê prefere outra régua?",
    "Pesos e agregação: o estudo descarta os pesos fixos e a matriz do v0 e propõe regras transversais (neutralidade mandatória com dados faltando ou conflito; controle de dupla contagem F1 → F2 → F3; surpresa contra a expectativa). O prompt da IA já leva essas regras como orientação (e o peso do FEL 1 como o único na base). A agregação em código do FinMind, com famílias e peso por horizonte (ADR 0066), está em produção desde 2026-10-05 (no prompt e no Centro de Decisão), por decisão do usuário: a validação dela é do Comitê.",
    "INMET (F1): qual índice? Geada (temperatura mínima horária de maio a agosto em Varginha, Patrocínio, Franca e Caldas, com qual limiar) ou chuva e balanço hídrico contra a climatologia? A coleta só começa com o índice definido.",
    "Vale a mesma régua para o milho? O estudo critica pesos fixos e limiares sem teste, o que também se aplica ao Motor do Milho v0, já aprovado."
  ]
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
          "No prompt: o COT não vota; o papel dele vai em posicionamentoCot (confirma, excesso, risco de reversão ou enfraquece), e sem catalisador de clima ou de safra o extremo pesa menos. Na agregação do motor (ADR 0066, bloco 3B): sem peso; no extremo contra a direção, a confiança desce um nível."
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
