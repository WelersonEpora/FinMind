"use strict";

const { SITUACAO, montarFatores, montarMetodologia } = require("./metodologia-base");

// Metodologia dos 8 fatores do milho: só as definições (o formato de cada uma está em metodologia-base.js). Fonte do
// FEL 1: a tabela "Fatores de Influência de Preço: Milho", v1.1, copiada sem reescrever.
//
// Diferente do petróleo e do ouro, a proposta aqui é do DAVID: o "Motor do Milho — Tabelas por Fator", versão 0, de
// 2026-10-02 (ADR 0055), com uma regra de alta e uma de baixa por fator, o peso por mês e as correlações. Ela vai em
// `proposta` com `autoria` e as regras dele em `regrasEspecialista`, como ele escreveu; o que o FinMind acrescentou para
// caber no motor fica dito no cálculo do fator. O próprio documento diz: proposta para deliberação do Comitê, limiares e
// pesos ILUSTRATIVOS, a calibrar em backtest.
//
// Limite (CLAUDE.md e ADR 0050): o milho não vai ao prompt diário, ao Centro de Decisão nem à IA até a aprovação do
// Comitê, como foi com o petróleo (ADR 0052) e o ouro (ADR 0054). Nada daqui gera sinal de compra ou venda.
//
// A validação histórica (parte D) é contra o Indicador do Milho CEPEA/ESALQ (B3, R$/saca, desde 2018-06-08, ADR 0021),
// o preço em que o CCM liquida e o histórico mais longo do milho brasileiro na base.

// v1 (2026-10-04): os 8 fatores com a proposta v0 do David; o F3 (estoques) calculado.
// v2 (2026-10-05): o calendário de pesos vai ao prompt diário (ADR 0065); os fatores não mudam.
// v3 (2026-10-05): as regras de peso por força do sinal do David (F1, F2, F3 e F5) vão ao prompt como condições, ao
// lado das que já iam (ADR 0065, adendo); o ajuste do F1 pela colheita da safrinha sai da tela e vira pergunta (o
// andamento da colheita não está na BASE).
// v4 (2026-10-05): a condição da previsão do NOAA/CPC entra no F1 (ADR 0068, decisão do usuário); a pergunta sai.
const VERSAO = 4;
const DATA_VERSAO = "2026-10-05";
const AUTORIA_DAVID = "David, Motor do Milho v0 (2026-10-02, ADR 0055)";
const DECISAO_DAVID = "David, 2026-10-03 (ADR 0055)";

const DEFINICOES = [
  {
    codigo: "MILHO_CLIMA_SAFRA_EUA",
    fel1: {
      tipo: "Climático",
      direcao: "Alta com clima adverso no meio-oeste; baixa com clima bom",
      mecanismo: "EUA é maior exportador; condições de lavoura definem oferta",
      fonte: "USDA/NASS, NOAA"
    },
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["USDA_MILHO_CONDICAO", "USDA_MILHO_PROGRESSO", "NOAA_VH_MILHO", "NOAA_CPC_MILHO"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para medir o fator: a condição da lavoura do USDA é semanal desde 1986, o que dá a média de 5 anos da mesma semana desde 1991 e o percentil de 10 anos desde 1996; os episódios conhecidos aparecem (a seca de 2012, -36 p.p. contra a média; a seca-relâmpago de junho de 2023, -17 p.p.). Contra o Indicador CEPEA/ESALQ (115 semanas de junho a agosto, 2018 a 2026), não há relação: o desvio tem +0,15 com o indicador 13 semanas depois (o sentido contrário ao do FEL 1), e nas semanas com pressão de baixa o indicador subiu em 25 de 26 (média +13,6%), puxado por 2024 e 2025. São só 9 safras, e o efeito do clima americano chega ao CCM por Chicago e pela paridade, atenuado pela colheita da safrinha (o que a proposta do especialista já diz). Sem o ZC, não há como validar onde o efeito é direto."
      },
      lacunas: [
        "A previsão do NOAA/CPC (nos 5 maiores estados de milho) é coletada desde 2026-10-05, sem histórico (ADR 0067): antes disso o fator roda sem a condição dela, e ela não tem como ser testada no passado. O U.S. Drought Monitor, que a regra de alta também usa, não é coletado (fonte nova).",
        "A expectativa dos analistas antes do Crop Progress (a surpresa) não é coletada."
      ]
    },
    proposta: {
      autoria: AUTORIA_DAVID,
      objetivo: "Medir se o clima está tirando ou somando produção nos EUA, na fase em que isso pesa (a polinização, em julho).",
      medida: "Índice boa + excelente (% da lavoura) e a variação semanal em p.p.; % da área de milho em seca (D1 ou pior); % da lavoura em polinização.",
      comparacao: "Boa + excelente contra a média de 5 anos da mesma semana (desvio em p.p.) e o percentil de 10 anos da mesma semana; a surpresa contra a expectativa dos analistas. A fase da lavoura define o peso.",
      leitura: "De junho a agosto: boa + excelente 5 p.p. ou mais abaixo da média de 5 anos, ou caindo 3 p.p. em uma semana, pesa para alta; 3 p.p. ou mais acima da média por 3 semanas seguidas, para baixa (regra do David), com a condição da previsão do CPC de 8 a 14 dias: a alta só vale com calor acima e chuva abaixo do normal em 3 ou mais dos 5 estados do Corn Belt, e a baixa só sem isso (o limite de 3 de 5 é do FinMind, ADR 0068). O FinMind acrescentou: alta forte com as duas condições; baixa forte com a polinização concluída (90%); alta e baixa juntas dão neutra; tendência por 2 semanas. Peso por mês (do David, fora da conta): Alto em julho, Médio em junho e agosto, Baixo de setembro em diante; no CCM o sinal chega por Chicago e perde força com a colheita da safrinha acima de 50%. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "R-CLI-01 v0 (jun–ago): G/E 5 p.p. ou mais abaixo da média de 5 anos, ou queda de 3 p.p. ou mais em uma semana, com previsão CPC de calor acima e chuva abaixo do normal em 8–14 dias → pesa para alta.",
        baixa: "R-CLI-02 v0 (jun–ago): G/E 3 p.p. ou mais acima da média de 5 anos por 3 semanas seguidas, sem previsão adversa → pesa para baixa."
      }
    },
    perguntas: [
      "No preço em reais o fator não mostrou relação (9 safras): ele fica como está, à espera de uma validação contra Chicago (o ZC, Fase 2 da P8), ou entra com peso reduzido no CCM?"
    ],
    decisoes: [
      "Previsão do CPC como condição da regra (usuário, 2026-10-05, ADR 0068): a previsão de 8 a 14 dias é adversa com calor acima e chuva abaixo do normal em 3 ou mais dos 5 estados do Corn Belt (o \"3 de 5\" é do FinMind, ajustável no card C); a pressão de alta só vale com ela e a de baixa só sem ela (senão, neutra). Sem previsão na semana (antes de 2026-10-05), a condição não é aplicada, e o texto do fator diz isso."
    ]
  },
  {
    codigo: "MILHO_SAFRINHA",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com safrinha ruim; baixa com safrinha cheia",
      mecanismo: "Brasil é grande exportador; safrinha define oferta local e exportável",
      fonte: "Conab, IMEA"
    },
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["CONAB_MILHO_SAFRA", "IMEA_MILHO_SAFRA", "IMEA_MILHO_ANDAMENTO"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para medir a safra atual, não para validar a regra. A base tem os levantamentos da Conab desde fev/2025 (15, sem mar a jun/2025 e jan/2026, que a fonte não publicou): a comparação no mesmo levantamento só existe na safra 2025/26 e em 4 meses (fev, jul, ago e set/2026), e a 1ª estimativa, a partir dela. Não há histórico para testar o fator contra o preço. Os números batem com o exemplo do especialista: no 12º levantamento de 2025/26, +0,09% contra o mesmo levantamento de 2024/25 e +1,51% de revisão acumulada, abaixo dos limiares, com viés de baixa fraco pela revisão para cima. Em fev/2026, +13,8% contra o mesmo levantamento de 2025 (a estimativa de 2024/25 começou baixa): pressão de baixa. A validação mais longa depende da aproximação pelo WASDE (o Brasil no WASDE, desde 2011), aceita pelo especialista na P5 e ainda não calculada."
      },
      lacunas: [
        "As revisões da Conab só existem desde fev/2025; antes, a aproximação pelo WASDE (o Brasil no WASDE), validada pelo David na P5 (ADR 0055).",
        "A revisão contra o levantamento anterior atravessa os meses sem levantamento na base (ex.: fev a jul/2025).",
        "Chuva e temperatura (INMET/CPTEC) e a expectativa das consultorias (StoneX, AgRural, Safras) não são coletadas."
      ]
    },
    proposta: {
      autoria: AUTORIA_DAVID,
      objetivo: "Medir se a safrinha está vindo maior ou menor, separando o tamanho (nível) da mudança de estimativa (revisão).",
      medida: "Produção (mil t), área (mil ha) e produtividade (kg/ha) da 2ª safra; a revisão contra o levantamento anterior e a acumulada contra a 1ª estimativa; % do plantio na janela ideal e % colhido.",
      comparacao: "A safra anterior no MESMO levantamento (não o número final dela); o tamanho das revisões em desvios-padrão das revisões da Conab; o desvio contra a tendência de 10 anos.",
      leitura: "Produção 3% ou mais abaixo da safra anterior no mesmo levantamento, ou revisão acumulada contra a 1ª estimativa de −2% ou pior em 2 levantamentos seguidos, pesa para alta; o simétrico, para baixa; abaixo dos limiares, uma revisão para cima dá viés de baixa fraco (regra do David; o alerta agroclimático e o plantio na janela ficam fora, sem o dado). O FinMind acrescentou: forte com nível e revisão no mesmo sentido; neutra com os dois opostos. Peso por mês (do David, fora da conta): Alto de março a julho, Médio em agosto e setembro, Baixo depois (o fator passa ao F3). Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "R-SAF-01 v0: produção 3% ou mais abaixo da safra anterior (mesmo estágio), ou revisão acumulada de −2% ou pior em 2 levantamentos seguidos, ou alerta agroclimático (déficit hídrico em mar–mai; geada em jun–jul em PR, MS e SP) → pesa para alta.",
        baixa: "R-SAF-02 v0: produção 3% ou mais acima da safra anterior (mesmo estágio), ou revisão acumulada de +2% ou mais em 2 levantamentos seguidos, com plantio na janela e sem alerta climático → pesa para baixa."
      }
    },
    perguntas: [
      "Sem dado de clima brasileiro na base, o alerta agroclimático fica fora da regra na v1 (declarado), ou vira fonte nova?",
      "\"Revisão acumulada de −2% em 2 levantamentos seguidos\" é a acumulada contra a 1ª estimativa passando do limiar em 2 levantamentos seguidos (como no exemplo do especialista, que usou a acumulada contra a 1ª estimativa)? É a leitura do cálculo.",
      "O viés de baixa fraco vale com qualquer revisão para cima abaixo dos limiares (o cálculo), ou só com revisões seguidas (no exemplo, 3)?"
    ]
  },
  {
    codigo: "MILHO_ESTOQUES_WASDE",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com estoques baixos; baixa com estoques folgados",
      mecanismo: "Relação estoque/uso é o driver clássico de preço de grãos",
      fonte: "USDA/FAS"
    },
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["WASDE_MILHO_EUA", "WASDE_MILHO_PAISES", "CONAB_MILHO_BALANCO"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para medir o fator: o WASDE tem todas as edições desde 2011, com as revisões, e o estoque/uso dos EUA tem 10 safras anteriores a partir das edições de 2018. Contra o Indicador CEPEA/ESALQ (R$/saca, 95 edições de set/2018 a set/2026), o NÍVEL não antecipa o preço em reais e o sinal sai ao contrário do FEL 1: a posição do estoque/uso contra a mediana tem +0,44 com o indicador 90 dias depois (+0,50 de 2018 a 2021; +0,34 de 2022 a 2026) e -0,08 com os 90 dias anteriores. A REVISÃO tem o sentido esperado, fraco: -0,16 com o indicador 30 dias depois (estoque revisado para baixo, preço depois mais alto). Pela regra, nas edições com pressão de alta o indicador subiu em 16 de 23 casos em 90 dias (média +1,3%), mas com pressão de baixa também subiu em 17 de 30 (+2,5%). O preço em reais mistura o dólar e o mercado interno; contra Chicago (o ZC, pago) a relação pode ser outra."
      },
      lacunas: [
        "A expectativa dos analistas antes do WASDE (pesquisa Reuters ou Bloomberg, a surpresa) não é coletada: é paga. A revisão contra a edição anterior é o substituto.",
        "O mundo menos a China só existe no WASDE a partir das edições de 2019 (safra 2017/18): o percentil de 10 safras dele só a partir da safra 2027/28. Vai como nível, de contexto.",
        "O balanço da Conab (estoque/uso do Brasil, que a regra também cita) ainda não entra no cálculo.",
        "Sem o ZC, a validação é contra o preço em reais, não contra Chicago."
      ]
    },
    proposta: {
      autoria: AUTORIA_DAVID,
      objetivo: "Medir se o balanço do milho está apertado ou folgado e se a última edição surpreendeu.",
      medida: "Estoque/uso da safra mais nova de cada edição do WASDE (estoque final ÷ uso total), dos EUA; o mundo e o mundo menos a China como contexto.",
      comparacao: "O percentil do estoque/uso contra as 10 safras anteriores (posição contra a mediana, em pontos) e a revisão do estoque final dos EUA contra a edição anterior.",
      leitura: "Estoque/uso no P25 ou abaixo, ou estoque final revisado 3% ou mais para baixo, pesa para alta; no P75 ou acima, ou revisado 3% ou mais para cima, para baixa (regra do David). O FinMind acrescentou: nível e revisão opostos dão neutra; forte com os dois no mesmo sentido ou no P10/P90; tendência por 3 edições. Peso: Alto, maior quanto mais baixo o percentil (a convexidade, ainda não calculada). Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "R-EST-01 v0: estoque/uso (EUA ou Mundo ex-China) no percentil 25 ou abaixo, ou revisão do estoque final de 3% ou mais para baixo (ou abaixo da expectativa) → pesa para alta. Vale também para o estoque/uso do Brasil (Conab).",
        baixa: "R-EST-02 v0: estoque/uso no percentil 75 ou acima, ou revisão do estoque final de 3% ou mais para cima (ou acima da expectativa) → pesa para baixa."
      }
    },
    perguntas: [
      "Quando o estoque/uso dos EUA e o do mundo menos a China divergem, qual decide? A v1 usa os EUA (Chicago) e mostra o mundo como contexto.",
      "No histórico em reais, o nível do estoque/uso não antecipou o Indicador ESALQ (até andou ao contrário); só a revisão teve o sentido esperado. O nível continua dando direção, ou vira contexto e a revisão decide?",
      "A regra do Brasil (estoque/uso da Conab) entra junto, com que peso?"
    ]
  },
  {
    codigo: "MILHO_DOLAR_PARIDADE",
    fel1: {
      tipo: "Cambial",
      direcao: "Dólar alto eleva preço doméstico; dólar baixo reduz",
      mecanismo: "Preço interno reflete paridade de exportação em R$",
      fonte: "Cepea, Comex Stat"
    },
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["USD_BRL", "IMEA_MILHO_PARIDADE", "MILHO_CEPEA_ESALQ", "COMEX_MILHO_VOLUME"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para a regra de baixa, não para a de alta: a paridade do IMEA (MT) existe desde 31/05/2021, e a PTAX e o Indicador ESALQ cobrem o período. A base da regra (ESALQ − paridade) mistura praças: Campinas fica acima de MT pelo frete, e a base foi negativa em 1 de 251 semanas (mediana de R$ 26/saca). Por isso a alta quase nunca dispara: na guerra da Ucrânia (mar/2022, paridade +13,8% em 10 pregões) e no dólar acima de R$ 6 (dez/2024, +8%), a leitura fica neutra. Contra o Indicador ESALQ (223 semanas, 2021 a 2026), a relação é fraca, no sentido da regra: nas 83 semanas com pressão de baixa o indicador caiu em média 3,6% nas 13 semanas seguintes (subiu em 46% delas), contra -0,2% nas semanas neutras (55%); a variação da paridade tem +0,12 com o indicador 13 semanas depois. A série do IMEA tem ruído e quebras: a troca anual do contrato de referência (10 semanas sem decisão), um salto de nível fora do rótulo (ago/2025) e uma semana fora da série (jul/2022)."
      },
      lacunas: [
        "A paridade de exportação do IMEA (P16, ADR 0055) é coletada desde 2026-10-04 (ADR 0057), com a tabela diária desde 31/05/2021: cerca de 5 anos, não os 10 da comparação proposta. É a paridade de MT, e o contrato de referência muda uma vez por ano (quebra na série).",
        "O ZC (CME) é pago; o prêmio de exportação em Paranaguá e o frete não são coletados. A fórmula da paridade da proposta depende dos três."
      ]
    },
    proposta: {
      autoria: AUTORIA_DAVID,
      objetivo: "Medir se o câmbio e Chicago estão puxando a paridade de exportação, e se o preço interno está acima ou abaixo dela.",
      medida: "USDBRL (PTAX); a paridade de exportação em R$/saca; a base interna = Indicador ESALQ (Campinas) − paridade.",
      comparacao: "A variação da paridade em 10 pregões, decomposta entre câmbio e ZC; o percentil de 10 anos da paridade e da base na mesma época; o USDBRL contra a volatilidade de 12 meses (z-score).",
      leitura: "Paridade subindo 3% ou mais em 10 pregões, metade ou mais pelo câmbio, com o preço interno abaixo dela, pesa para alta; caindo 3% com o preço interno acima, para baixa (regra do David). O cálculo usa a paridade pronta do IMEA (MT, P16), a PTAX de venda e o Indicador ESALQ (Campinas) como preço interno. Sem o ZC, a parte do câmbio é aproximada (a variação do dólar ÷ a da paridade, que a subestima). O FinMind acrescentou: forte com 6% ou mais; sem decisão quando os 10 pregões cruzam a troca do contrato de referência ou a variação chega a 30% (quebra da série); tendência por 2 semanas. Peso por mês: Alto de julho a janeiro (exportação), Médio nos demais. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "R-CAM-01 v0: paridade em R$ sobe 3% ou mais em 10 pregões, com 50% ou mais da alta vindo do câmbio, e preço interno abaixo da paridade (base negativa) → pesa para alta (o preço interno tende a convergir).",
        baixa: "R-CAM-02 v0: paridade em R$ cai 3% ou mais em 10 pregões, e preço interno acima da paridade (base positiva) → pesa para baixa."
      }
    },
    perguntas: [
      "Qual praça importa para o CCM: MT (onde está a paridade do IMEA) ou Campinas (onde o CCM liquida)? A base \"ESALQ − paridade\" mistura as duas.",
      "Na v1, sem o ZC e o prêmio, a paridade do IMEA (pronta, P16) substitui a fórmula? A parte do câmbio fica aproximada (a variação do dólar ÷ a da paridade).",
      "A base Campinas − MT é quase sempre positiva e a alta não dispara. Qual saída: um limiar da base diferente de zero (parâmetro), a base contra a própria média, ou o preço do milho em MT (a linha \"Milho Disponível\" do mesmo boletim do IMEA, que pede autorização de coleta)?",
      "Reponderar o fator para Alto (como a proposta sugere) entra no FEL 1 revisado?"
    ]
  },
  {
    codigo: "MILHO_ETANOL",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com demanda forte de etanol; baixa com demanda fraca",
      mecanismo: "Milho é matéria-prima de etanol nos EUA; disputa com uso alimentar",
      fonte: "EIA, USDA"
    },
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["ETANOL_EUA_EIA", "WASDE_MILHO_EUA"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para a parte dos EUA, não para o fator inteiro: a produção semanal de etanol da EIA é coletada desde 2010 e os episódios conhecidos aparecem (a pandemia, -19% contra a média de 4 semanas em abr/2020; o frio extremo no Texas, -29% em fev/2021). A margem do etanol de milho e a moagem do Brasil (UNEM, ANP, Cepea), de que dependem a regra de alta e boa parte da de baixa, não são coletadas: o fator só dá pressão de baixa. Contra o Indicador CEPEA/ESALQ (432 semanas, 2018 a 2026), a relação é fraca, no sentido da regra: nas 64 semanas com pressão de baixa o indicador caiu em média 1,4% nas 13 semanas seguintes (subiu em 44% delas), contra +3,5% nas semanas neutras (60%); o desvio tem +0,12 com o indicador 13 semanas depois."
      },
      lacunas: [
        "O etanol de milho do Brasil (UNEM, ANP, Cepea etanol hidratado) não é coletado: a margem e a moagem brasileiras da proposta dependem dele.",
        "A expectativa semanal antes da EIA não é coletada."
      ]
    },
    proposta: {
      autoria: AUTORIA_DAVID,
      objetivo: "Medir se a demanda de milho para etanol está firme ou fraca, nos EUA e no Brasil.",
      medida: "EUA: moagem implícita (produção de etanol × 42 ÷ ~2,8 gal/bu). Brasil: milho consumido por etanol e a margem do etanol de milho (R$/saca).",
      comparacao: "O percentil de 10 anos da margem; a moagem contra o mesmo período do ano anterior e contra a capacidade; a surpresa semanal da EIA.",
      leitura: "Margem no P70 ou acima com moagem crescendo pesa para alta; margem no P30 ou abaixo, ou moagem semanal 3% ou mais abaixo da média de 4 semanas, para baixa (regra do David). O cálculo faz só a parte da EIA: a produção semanal dos EUA 3% ou mais abaixo da média de 4 semanas pesa para baixa; sem a margem, não há direção de alta. O FinMind acrescentou: forte com a semana também 3% ou mais abaixo do ano anterior; tendência por 4 semanas. Peso: Médio; Alto na base de MT durante a colheita (jun–set). Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "R-ETA-01 v0: margem no percentil 70 ou acima, e moagem ou capacidade instalada crescendo contra o ano anterior (nova planta confirmada pela UNEM) → pesa para alta (demanda local firme).",
        baixa: "R-ETA-02 v0: margem no percentil 30 ou abaixo, ou moagem semanal (EIA) 3% ou mais abaixo da média de 4 semanas, ou paradas de plantas → pesa para baixa."
      }
    },
    perguntas: [
      "Sem o etanol brasileiro na base, a v1 roda só com a parte dos EUA (a moagem da EIA), declarando a lacuna?"
    ]
  },
  {
    codigo: "MILHO_INSUMOS",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com custos maiores",
      mecanismo: "Custo de produção pressiona preço mínimo de equilíbrio",
      fonte: "Conab, IMEA"
    },
    evento: { janelaDias: 7 },
    // Sinal defasado (Motor do Milho v0, regras de agregação): o F6 age sobre a área e a safrinha da safra seguinte.
    efeitoDefasado: { mesesMin: 6, mesesMax: 12, sobre: "a área e a safrinha (F2) da safra seguinte" },
    dados: {
      observaveis: ["IMEA_CUSTO_MILHO_MES", "IMEA_CUSTO_MILHO_SAFRA", "MILHO_CEPEA_ESALQ"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para a margem de hoje, não para validar: o custo por safra do IMEA (média de MT, 5 safras, 2021/22 a 2025/26) só é conhecido na base desde a 1ª coleta, em 2026-09-15, então o fator (point-in-time) tem poucas semanas. Fora do point-in-time, só como leitura dos números: a safra 2023/24 custou R$ 58,60 por saca em MT, e o Indicador ESALQ (Campinas) estava em ~R$ 57 em meados de 2024, no custo, antes da alta para ~R$ 74 em jan/2025; em 2023, com o produtor de MT no prejuízo, o indicador de Campinas (~R$ 55) ficou acima do custo de R$ 48,10 da safra 2022/23 (o frete separa as duas praças). Sem o preço do fertilizante, não há relação de troca nem direção de baixa."
      },
      lacunas: [
        "O preço do milho em MT não é coletado: a margem usa o Indicador ESALQ (Campinas), acima do preço de MT pelo frete.",
        "O custo é só de Mato Grosso e agregado; o preço isolado de fertilizante (Banco Mundial, importação pelo Comex Stat) e o diesel (ANP) não são coletados.",
        "O custo de produção de milho da Conab não é coletado (só o do café, ADR 0043)."
      ]
    },
    proposta: {
      autoria: AUTORIA_DAVID,
      objetivo: "Medir se o custo do produtor serve de piso para o preço, e o efeito defasado sobre a área da safra seguinte.",
      medida: "Margem do produtor = preço do milho − custo total por saca; a relação de troca (sacas por tonelada de adubo); a variação dos insumos em 3 e 6 meses.",
      comparacao: "O percentil de 10 anos da relação de troca; a margem contra a média de 5 anos.",
      leitura: "Relação de troca pior que o P75 por 2 meses, ou margem do produtor ≤ 0, pesa para alta (piso e menos área depois); adubo barato com margem confortável, para baixa (regra do David). O cálculo faz a parte da margem: o Indicador ESALQ contra o custo total por saca do IMEA (MT), e margem de 0% ou menos pesa para alta; sem o preço do fertilizante, não há relação de troca nem direção de baixa. O FinMind acrescentou: forte com o preço no custo operacional efetivo ou abaixo (o caixa); tendência por 4 semanas. Peso: Baixo no horizonte do sistema; Médio para vencimentos a 6 meses ou mais. Sinal defasado de 6 a 12 meses. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "R-INS-01 v0: relação de troca pior que o percentil 75 por 2 meses ou mais, ou preço do milho igual ou abaixo do custo total por saca (margem ≤ 0) → pesa para alta (retenção de oferta e menor área futura).",
        baixa: "R-INS-02 v0: relação de troca melhor que o percentil 25 (adubo barato) e margem do produtor confortável (limiar a definir) → pesa para baixa (incentivo a mais área e tecnologia na safra seguinte)."
      }
    },
    perguntas: [
      "Na v1, a margem do produtor (Indicador ESALQ − custo do IMEA) basta, sem a relação de troca (o David confirmou o IMEA na §5)? O ESALQ é de Campinas e o custo, de MT.",
      "Qual é a margem \"confortável\" da regra de baixa?"
    ]
  },
  {
    codigo: "MILHO_FUNDOS",
    fel1: {
      tipo: "Técnico/Fluxo",
      direcao: "Amplifica movimentos em ambos os sentidos",
      mecanismo: "Posições de fundos amplificam tendências",
      fonte: "CFTC (COT), CME"
    },
    evento: { janelaDias: 7 },
    dados: {
      observaveis: ["COT_MILHO"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o COT da CFTC traz o managed money do milho da CBOT toda semana desde 2006, o que dá a janela de 10 anos da proposta a partir de 2016. Contra o Indicador CEPEA/ESALQ (417 semanas, 2018 a 2026), a posição relativa de 10 anos tem -0,44 com o indicador 26 semanas depois (-0,40 em 2018 a 2021; -0,54 em 2022 a 2026), a REVERSÃO da proposta do David (o FEL 1 diz \"amplifica\"): com os fundos no P90 ou acima, o indicador subiu em 4 de 38 semanas (média -7,8% em 26 semanas); no P10 ou abaixo, em 40 de 62 (+20,4%); fora dos extremos, em 112 de 198 (+4,9%). Com a janela de 3 anos do petróleo e do ouro, a relação cai para -0,20. Ressalva: são poucos episódios independentes (cerca de 6 de vendidos e 4 de comprados), e as semanas de um episódio andam juntas."
      },
      lacunas: [
        "A posição no CCM por tipo de investidor (B3) não é coletada: o COT mede Chicago, não a B3.",
        "O COT Index de 52 semanas da proposta não é calculado: a posição relativa de 10 anos faz o papel do extremo."
      ]
    },
    proposta: {
      autoria: AUTORIA_DAVID,
      objetivo: "Medir o posicionamento dos fundos em Chicago, como amplificador e termômetro de timing, sem voto próprio.",
      medida: "Posição líquida do managed money (compradas − vendidas), em contratos e em % dos contratos em aberto; a variação em 4 semanas; o COT Index de 52 semanas.",
      comparacao: "O percentil de 10 anos da posição líquida (extremos no P90 e no P10); a velocidade e a inversão de sinal.",
      leitura: "Vendido em extremo (P10 ou abaixo em 10 anos) pesa para alta, a recompra; comprado em extremo (P90 ou acima), para baixa, a liquidação (regra do David, leitura de reversão). O FinMind acrescentou: forte no P5/P95; tendência pela posição de 4 semanas antes. O gatilho de F1, F3 ou F8 da regra cruza fatores e fica para a agregação. Não vota: multiplica o peso dos fatores que o acionam (×1,25 com o extremo alinhado) e vira regra de risco quando está contra, como o COT do petróleo e do ouro (qualificador). Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "R-FUN-01 v0: managed money vendido em extremo (P10 ou abaixo) e, ao mesmo tempo, gatilho de alta vindo de F1, F3 ou F8 → pesa para alta (a recompra de posições amplifica).",
        baixa: "R-FUN-02 v0: managed money comprado em extremo (P90 ou acima) sem gatilho de alta em F1 ou F3, ou com variação em 4 semanas negativa → pesa para baixa (liquidação de posições compradas)."
      }
    },
    perguntas: [
      "A leitura de reversão da proposta (que o histórico confirma) substitui o \"amplifica\" do FEL 1 na revisão do documento?",
      "Sem o gatilho de F1, F3 ou F8, o extremo sozinho já é pressão (a v1), ou só vale com o gatilho, como na regra?"
    ]
  },
  {
    codigo: "MILHO_POLITICA_COMERCIAL",
    fel1: {
      tipo: "Geopolítico",
      direcao: "Alta com demanda forte de importadores; baixa com barreiras",
      mecanismo: "Fluxos de comércio global de grãos",
      fonte: "Comex Stat, USDA"
    },
    evento: { janelaDias: 30 },
    dados: {
      observaveis: ["EXPORTACAO_MILHO_DESTINO", "COMEX_MILHO_VOLUME"],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para medir o ritmo: o Comex Stat tem a exportação de milho mensal desde 2005, com o destino (a China, código 160). O ritmo é o acumulado do ano comercial (fevereiro a janeiro) contra a média do mesmo trecho nos 5 anos anteriores: o mês sozinho salta na entressafra (+67% e -35% em mar e mai/2026, sobre volumes pequenos). Contra o Indicador CEPEA/ESALQ (97 meses, 2018 a 2026, contados da publicação de cada mês), não há relação estável: -0,06 com o indicador 3 meses depois no período todo, +0,35 em 2018 a 2021 (o sentido do FEL 1) e -0,31 em 2022 a 2026 (o contrário). As exportações seguem a competitividade do milho brasileiro, e a relação troca de regime. A parte de eventos (tarifas, habilitações) não entra na conta e não tem validação no passado (P12: buscar eventos antigos hoje repete o problema do vintage)."
      },
      lacunas: [
        "USDA Export Sales, ANEC e o Secex semanal não são coletados: o ritmo de embarque é mensal (Comex Stat).",
        "Os eventos (tarifas, habilitações) vêm da leitura diária por IA (ADR 0049), sem validação humana antes do prompt."
      ]
    },
    proposta: {
      autoria: AUTORIA_DAVID,
      objetivo: "Medir o fluxo de exportação do milho brasileiro e os atos oficiais que o abrem ou fecham.",
      medida: "Volume exportado (mil t/mês) e o acumulado do ano comercial; a participação da China no total (P12: com a variação contra o mesmo mês do ano anterior); cada evento oficial com data, tipo, países, direção e volume estimado.",
      comparacao: "O ritmo de embarque contra a média de 5 anos da mesma época; a janela de efeito do evento e o decaimento; o preço afetado (Chicago ou o prêmio no porto).",
      leitura: "Evento oficial que amplia o acesso ao milho brasileiro, ou embarques 10% ou mais acima da média de 5 anos, pesa para alta; evento que restringe, ou embarques 10% ou mais abaixo, para baixa (regra do David). O cálculo faz a parte dos embarques; os eventos vêm da leitura diária por IA, fora da conta. O FinMind acrescentou: o ritmo pelo acumulado do ano comercial (fevereiro a janeiro), não pelo mês sozinho; forte a partir de 25%; tendência por 3 meses. Peso: Médio; Alto se o destino é grande (China) e o ato está confirmado. Evento só entra com confirmação oficial e validação humana. Parâmetros ajustáveis pelo Comitê no card C. Decidir.",
      regrasEspecialista: {
        alta: "R-POL-01 v0: evento oficial que reduz a oferta concorrente ou amplia o acesso ao milho brasileiro (tarifa ao milho dos EUA, restrição de exportação na Argentina ou na Ucrânia, nova habilitação sanitária), com volume estimado relevante (limiar a definir), ou embarques 10% ou mais acima da média de 5 anos → pesa para alta.",
        baixa: "R-POL-02 v0: evento oficial que restringe o milho brasileiro (embargo sanitário, tarifa de grande comprador, cancelamento de compras), acordo que devolve compras de milho dos EUA a mercados asiáticos, imposto ou restrição à exportação no Brasil, ou embarques 10% ou mais abaixo da média de 5 anos → pesa para baixa."
      }
    },
    perguntas: [
      "Qual o valor do \"volume estimado relevante\" que torna um evento uma pressão?",
      "Qual o valor do decaimento de um evento: em quanto tempo ele deixa de pesar na leitura?",
      "O ritmo de embarque pelo acumulado do ano comercial (o cálculo) atende, ou o especialista quer o mês contra a média do mesmo mês (que salta na entressafra)?"
    ]
  }
];

const FATORES_MILHO = montarFatores("MILHO", DEFINICOES);

// O que vale para o ativo, não para um fator (metodologia-base.js). As decisões vêm das respostas do David ao FEL 1
// (ADR 0055); as perguntas, da Seção 5 da proposta dele ("Pendências para deliberação do Comitê") e da conversa marcada
// com ele (docs/conversa-david-respostas-fel1.md).
const DO_ATIVO = {
  decisoes: [
    `Preço de referência: o CCM da B3 (R$/saca), o instrumento operado, que liquida pelo Indicador CEPEA/ESALQ (Campinas); o ZC de Chicago entra como fator, não como substituto, se houver orçamento. ${DECISAO_DAVID}, P2.`,
    `Perfil especulativo, não hedge: swing trade de 7 a 21 dias, com risco × retorno mínimo de 2:1. ${DECISAO_DAVID}.`,
    `Backtest em duas fases: a Fase 1 no CCM (2022+), declarando a limitação; a Fase 2 no ZC, se houver orçamento. ${DECISAO_DAVID}, P8.`,
    "Aprovação do Comitê (2026-10-04, ADR 0058): o Motor do Milho v0 como está na tela, com as regras do David, os limiares v0 e os acréscimos do FinMind; ajustes daqui em diante pelos parâmetros. O milho entra no prompt diário, na leitura de tendência da IA e no Centro de Decisão.",
    "Formato da leitura da IA: tendência por horizonte, com as faixas calibradas (como no petróleo e no ouro), não recomendação de compra ou venda. Comitê, 2026-10-04 (ADR 0058).",
    "Preço de referência no prompt e no Centro de Decisão: o CCM, o vencimento mais próximo negociado, sem emendar contratos. Comitê, 2026-10-04 (ADR 0058).",
    "Eventos sem validação humana, por ora: cada fator recebe os eventos que a leitura diária por IA marca com ele, como chegam (7 dias de janela; 30 no F8). Comitê, 2026-10-04 (ADR 0058); confirmado pelo usuário (Welerson), 2026-10-05: não haverá validação humana.",
    "Base do F4 (Campinas − paridade de MT): fica como está por ora, com o limiar 0 da regra do David. Comitê, 2026-10-04 (ADR 0058).",
    `Medidas da camada A confirmadas: COT em managed money (contratos e % dos contratos em aberto), estoque/uso dos EUA e do mundo com a revisão, safrinha em nível e revisão (Conab e IMEA), boa + excelente com o VHI, insumos pelo IMEA na v1. ${DECISAO_DAVID}, §5.`,
    "Peso por mês e agregação no prompt: o calendário de pesos da proposta vai ao prompt diário como uma tabela fixa, e as regras de agregação como orientação em texto, sem cálculo novo; a agregação em código continua para o Comitê. Nos meses que a proposta não define (o F1 de janeiro a maio, o F2 em janeiro e fevereiro), vale o peso do FEL 1. Usuário (Welerson), 2026-10-05 (ADR 0065).",
    "F7 (fundos) não vota, como dizem as regras de agregação: reforça ou enfraquece a firmeza de F1, F3 e F8, sem o multiplicador numérico. Usuário (Welerson), 2026-10-05 (ADR 0065)."
  ],
  perguntas: [
    "Vencimentos do CCM por horizonte: hoje vale o mais próximo negociado em todos os prazos. Um vencimento por horizonte, com a liquidez mínima (contratos em aberto), e a curva dos vencimentos no prompt?",
    "Agregação em código (Seção 4 da proposta): o teto do bloco de oferta e a paridade líquida (Chicago × câmbio) só existem como orientação no prompt. O Comitê quer a agregação calculada pelo motor, com o backtest?",
    "Ajuste do F1 ao CCM: a proposta reduz o peso do F1 de junho a agosto enquanto a colheita da safrinha passa de 50%. O andamento da colheita (IMEA) é coletado, mas não está na BASE do prompt: levamos o andamento ao prompt (como contexto do F2) ou a regra fica de fora?",
    "Calendário de pesos: qual o peso do F1 (clima dos EUA) de janeiro a maio e do F2 (safrinha) em janeiro e fevereiro? A proposta não define esses meses; por ora vale o do FEL 1 (ADR 0065).",
    "Faixas da leitura da IA: hoje são os percentis 40 e 80 do Indicador ESALQ (2018 a 2026), por horizonte. As 6 classes fixas do prompt do David (1, 3, 5, 7 e 10%) substituem?",
    "Correções da tabela original do FEL 1 (\"Copea\" para Cepea, câmbio pelo BCB, etanol com fontes brasileiras, F4 para Alto e F6 para Baixo-Médio): entram no FEL 1 revisado (até 2026-10-15)?",
    "Fatores ausentes propostos (ração, frete e base MT→porto, prêmio em Paranaguá, soja, clima brasileiro como fator próprio): entram na v1, ou depois?"
  ]
};

// Os pesos e as relações do Motor do Milho v0 (formato em metodologia-base.js), copiados da proposta do David: o peso de
// cada regra (Seção 3), a "Sugestão" de peso-base de cada fator, a matriz de correlações e as regras de agregação
// (Seção 4). O mês que ele não definiu fica sem peso (ex.: o F1 de janeiro a maio): não se completa por inferência. O
// calendário vai ao prompt diário como uma tabela fixa (ADR 0065, bloco 2.5); as frases das relações também
// (bloco 2.5); a matriz de símbolos, não. A orientação de agregação é texto fixo do prompt (ai/prompts/milho-analise-diaria.md,
// bloco 4).
const PESOS_MILHO = {
  autoria: AUTORIA_DAVID,
  noPrompt: {
    autorizacao: "Usuário (Welerson), 2026-10-05 (ADR 0065), antes da aprovação do Comitê",
    mesSemDefinicao: "vale o peso do FEL 1"
  },
  descricao:
    "o peso separa-se da direção e depende do peso-base do fator, do mês e da força do sinal. Pesos ilustrativos, a calibrar em backtest.",
  fatores: {
    MILHO_CLIMA_SAFRA_EUA: {
      sugestao: "Alto para Chicago (ZC); Médio-Alto para o CCM, porque o efeito chega por paridade e é atenuado pela colheita da safrinha.",
      meses: { Alto: [7], Médio: [6, 8], Baixo: [9, 10, 11, 12] },
      condicoes: [
        {
          texto:
            "Pressão de baixa (lavoura boa + excelente acima da média): peso Médio; Alto quando a polinização está concluída (90% ou mais da área)."
        }
      ],
      notas: [
        "A fase da lavoura define o peso: junho (pré-polinização), julho (polinização), agosto (enchimento), setembro a novembro (maturação e colheita). \"Baixo de setembro em diante\"; de janeiro a maio, não definido."
      ]
    },
    MILHO_SAFRINHA: {
      sugestao: "Alto de março a julho, decrescente depois (a safra já está colhida em setembro).",
      meses: { Alto: [3, 4, 5, 6, 7], Médio: [8, 9], Baixo: [10, 11, 12] },
      condicoes: [{ texto: "Revisão para cima que não atinge os limiares do fator: viés baixista fraco, com peso Baixo." }],
      notas: ["\"Baixo de outubro em diante, quando o fator passa para F3 (estoque de passagem)\"; janeiro e fevereiro, não definidos."]
    },
    MILHO_ESTOQUES_WASDE: {
      sugestao: "Alto. É o hub do motor: recebe e consolida os fatores F1, F2, F5 e F8.",
      fixo: "Alto",
      condicoes: [
        { texto: "O peso cresce quanto mais baixo o percentil do estoque/uso (convexidade): estoque apertado pesa mais que estoque farto." },
        {
          texto:
            "Pressão de baixa (estoque folgado): peso Médio; Alto só com surpresa contra a expectativa do mercado, que não está na BASE (então vale o Médio)."
        }
      ]
    },
    MILHO_DOLAR_PARIDADE: {
      sugestao: "Alto, pois o dólar converte todos os fatores internacionais para R$.",
      meses: { Alto: [1, 7, 8, 9, 10, 11, 12], Médio: [2, 3, 4, 5, 6] },
      notas: ["Alto no período de exportação (julho a janeiro); Médio nos demais meses."]
    },
    MILHO_ETANOL: {
      sugestao: "Médio; Alto na base de MT durante a colheita.",
      meses: { Médio: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      condicoes: [
        { texto: "Alto na base de MT durante a colheita (junho a setembro), quando a usina é o comprador marginal.", meses: [6, 7, 8, 9] },
        { texto: "Pressão de baixa: peso Médio, mesmo de junho a setembro." }
      ]
    },
    MILHO_INSUMOS: {
      sugestao: "Baixo-Médio. É um fator lento: age sobre a safra seguinte e tem pouco poder preditivo no horizonte de swing e position.",
      fixo: "Baixo",
      condicoes: [{ texto: "Médio para vencimentos a 6 meses ou mais e quando a margem do produtor é ≤ 0 (funciona como piso)." }],
      notas: ["Sinal defasado: age sobre a safrinha seguinte, de 6 a 12 meses depois."]
    },
    MILHO_FUNDOS: {
      sugestao: "Médio. Não é fundamento: é amplificador e termômetro de timing.",
      papel: "Não vota: multiplica o peso de F1, F3 e F8 (ex.: ×1,25) quando o extremo de posição está alinhado ao sinal; contra o sinal, vira regra de risco.",
      notas: [
        "Na tabela do fator, a regra diz \"Peso: Médio; Alto se o COT Index está em 10 ou abaixo e a variação em 4 semanas muda de sinal\"; nas regras de agregação (Seção 4), o F7 não vota.",
        "Vale o das regras de agregação: o F7 não vota, sem o multiplicador numérico (usuário, 2026-10-05, ADR 0065)."
      ]
    },
    MILHO_POLITICA_COMERCIAL: {
      sugestao: "Médio, com caudas pesadas: alto impacto e baixa frequência. Modelar como flag de regime e camada de risco, não como variável contínua.",
      fixo: "Médio",
      condicoes: [{ texto: "Alto se o destino é grande (ex.: China) e o ato está confirmado." }]
    }
  },
  relacoes: {
    descricao:
      "O sinal compara as pressões de alta de dois fatores: + quando tendem a aparecer juntas, − quando aparecem em sentido oposto. É um julgamento estrutural, a validar com correlações defasadas, Granger e VAR, separados por regime sazonal.",
    simbolos: [
      { simbolo: "++", significado: "forte" },
      { simbolo: "+", significado: "média" },
      { simbolo: "(+)", significado: "fraca" },
      { simbolo: "−", significado: "média, inversa" },
      { simbolo: "(−)", significado: "fraca, inversa" },
      { simbolo: "±", significado: "depende do regime" },
      { simbolo: "(±)", significado: "fraca, depende do regime" },
      { simbolo: "+/++", significado: "média a forte" },
      { simbolo: "0", significado: "desprezível" }
    ],
    // Na ordem dos fatores: F1 Clima EUA, F2 Safrinha, F3 Estoques, F4 Dólar, F5 Etanol, F6 Insumos, F7 Fundos, F8 Política.
    matriz: {
      MILHO_CLIMA_SAFRA_EUA: [null, "±", "++", "(−)", "(−)", "(+)", "++", "(+)"],
      MILHO_SAFRINHA: ["±", null, "+", "(−)", "−", "+", "(+)", "+"],
      MILHO_ESTOQUES_WASDE: ["++", "+", null, "0", "+", "(+)", "++", "+"],
      MILHO_DOLAR_PARIDADE: ["(−)", "(−)", "0", null, "(±)", "+/++", "−", "±"],
      MILHO_ETANOL: ["(−)", "−", "+", "(±)", null, "+", "(+)", "0"],
      MILHO_INSUMOS: ["(+)", "+", "(+)", "+/++", "+", null, "(+)", "(+)"],
      MILHO_FUNDOS: ["++", "(+)", "++", "−", "(+)", "(+)", null, "±"],
      MILHO_POLITICA_COMERCIAL: ["(+)", "+", "+", "±", "0", "(+)", "±", null]
    },
    observacoes: ["F2 × F6 é defasada de 6 a 12 meses."],
    leitura: [
      "Os dois fatores que mais influenciam os demais: F1 Clima EUA (origem do choque) e F3 Estoques (hub que consolida os outros). F4 é o conversor obrigatório para R$ e F7 é o fator mais influenciado (amplificador).",
      "Correlações inversas relevantes: F4 × F1/F3/F7 (risk-on); F2 × F1 na sazonalidade de jun–ago; F2 × F5 (estabilizador); F1 × F5 (margem do etanol); F6 × área plantada (defasada); ZC × prêmio do Brasil em F8."
    ]
  },
  agregacao: [
    {
      tema: "Bloco de oferta",
      tratamento:
        "F1, F2 e F3 medem a mesma cadeia (clima e produção viram estoque). Os sinais do bloco formam um só, com teto de peso: três sinais do bloco na mesma direção contam como um sinal Alto, não como três.",
      fatores: ["MILHO_CLIMA_SAFRA_EUA", "MILHO_SAFRINHA", "MILHO_ESTOQUES_WASDE"],
      noFinMind: { situacao: "ORIENTACAO", texto: "No prompt: o bloco é um argumento só, com o teto de um fator de peso Alto, sem contar o mesmo choque duas vezes. O teto não é calculado." }
    },
    {
      tema: "Paridade líquida",
      tratamento:
        "O motor entrega à IA o efeito líquido em R$ (Chicago × câmbio), além dos sinais separados, porque o real tende a se mover contra as commodities em risk-on.",
      fatores: ["MILHO_DOLAR_PARIDADE", "MILHO_CLIMA_SAFRA_EUA", "MILHO_ESTOQUES_WASDE", "MILHO_FUNDOS"],
      noFinMind: { situacao: "FORA", texto: "Sem o ZC (pago), não há efeito líquido de Chicago × câmbio. O F4 usa a paridade pronta do IMEA." }
    },
    {
      tema: "Fundos como multiplicador",
      tratamento:
        "F7 não vota. Multiplica o peso de F1, F3 e F8 quando o extremo de posição está alinhado ao sinal, e vira regra de risco quando está contra.",
      fatores: ["MILHO_FUNDOS", "MILHO_CLIMA_SAFRA_EUA", "MILHO_ESTOQUES_WASDE", "MILHO_POLITICA_COMERCIAL"],
      noFinMind: { situacao: "ORIENTACAO", texto: "No prompt: o COT não vota; alinhado ao sinal de F1, F3 ou F8, reforça a firmeza deles; contra o sinal, é risco de reversão. O multiplicador numérico (×1,25) ficou fora por decisão do usuário (2026-10-05, ADR 0065): a IA não faz conta." }
    },
    {
      tema: "F3 como filtro",
      tratamento: "Sinal de F1, F2 ou F5 confirmado por F3 sobe de confiança; contradito por F3, perde peso.",
      fatores: ["MILHO_ESTOQUES_WASDE", "MILHO_CLIMA_SAFRA_EUA", "MILHO_SAFRINHA", "MILHO_ETANOL"],
      noFinMind: { situacao: "ORIENTACAO", texto: "No prompt: os estoques confirmam ou enfraquecem o clima, a safrinha e o etanol." }
    },
    {
      tema: "Mapa sazonal de pesos",
      tratamento:
        "O Comitê aprova uma matriz fator × mês com o peso máximo de cada fator (ex.: F2 Alto de março a julho; F1 Alto em julho; F4 Alto de julho a janeiro; F6 Baixo).",
      fatores: [
        "MILHO_CLIMA_SAFRA_EUA",
        "MILHO_SAFRINHA",
        "MILHO_ESTOQUES_WASDE",
        "MILHO_DOLAR_PARIDADE",
        "MILHO_ETANOL",
        "MILHO_INSUMOS",
        "MILHO_FUNDOS",
        "MILHO_POLITICA_COMERCIAL"
      ],
      noFinMind: {
        situacao: "ORIENTACAO",
        texto: "No prompt: o calendário vai como tabela fixa (bloco 2.5), e a IA usa o peso do mês da análise; nos meses não definidos, o do FEL 1 (ADR 0065). O motor não calcula com o peso."
      }
    },
    {
      tema: "Sinais defasados",
      tratamento: "F6 age sobre F2 da safra seguinte (6 a 12 meses). Registrar com data de efeito esperada, não como sinal imediato.",
      fatores: ["MILHO_INSUMOS", "MILHO_SAFRINHA"],
      noFinMind: {
        situacao: "ORIENTACAO",
        texto: "No prompt: o custo de produção é sinal defasado, que informa pouco os horizontes; o bloco do F6 traz a data de efeito esperada (de 6 a 12 meses depois do dado), sobre a safrinha seguinte."
      }
    },
    {
      tema: "Eventos",
      tratamento: "F8 entra como flag com data, tipo, volume e decaimento, após confirmação oficial e validação humana.",
      fatores: ["MILHO_POLITICA_COMERCIAL"],
      noFinMind: {
        situacao: "PARCIAL",
        texto: "Os eventos vão ao prompt com data e tipo, numa janela de 30 dias, sem validação humana (decidido: Comitê, ADR 0058, e usuário, 2026-10-05). Falta definir o valor do volume estimado relevante e o do decaimento."
      }
    },
    {
      tema: "Conflito entre blocos",
      tratamento:
        "Quando blocos independentes divergem (ex.: oferta em alta e paridade em baixa), o motor não resolve sozinho: passa os dois à IA com a marcação \"conflito\", e a recomendação sai com confiança reduzida.",
      fatores: [
        "MILHO_CLIMA_SAFRA_EUA",
        "MILHO_SAFRINHA",
        "MILHO_ESTOQUES_WASDE",
        "MILHO_DOLAR_PARIDADE",
        "MILHO_ETANOL",
        "MILHO_INSUMOS",
        "MILHO_FUNDOS",
        "MILHO_POLITICA_COMERCIAL"
      ],
      noFinMind: { situacao: "ORIENTACAO", texto: "No prompt: a IA explica as duas forças e reduz a confiança. O motor não marca o conflito." }
    },
    {
      tema: "Cobertura",
      tratamento:
        "O motor informa à IA quantos fatores têm dado e regra naquele dia. Cobertura baixa reduz a confiança, como já prevê o desenho do motor.",
      fatores: [
        "MILHO_CLIMA_SAFRA_EUA",
        "MILHO_SAFRINHA",
        "MILHO_ESTOQUES_WASDE",
        "MILHO_DOLAR_PARIDADE",
        "MILHO_ETANOL",
        "MILHO_INSUMOS",
        "MILHO_FUNDOS",
        "MILHO_POLITICA_COMERCIAL"
      ],
      noFinMind: { situacao: "ORIENTACAO", texto: "No prompt: a tabela da cobertura (a idade e a situação de cada fator) e a confiança rebaixada sem dado." }
    }
  ]
};

function obterMetodologiaMilho() {
  return montarMetodologia({
    ativo: "MILHO",
    nome: "Milho",
    versao: VERSAO,
    dataVersao: DATA_VERSAO,
    doAtivo: DO_ATIVO,
    pesos: PESOS_MILHO,
    fatores: FATORES_MILHO
  });
}

module.exports = { SITUACAO, FATORES_MILHO, obterMetodologiaMilho };
