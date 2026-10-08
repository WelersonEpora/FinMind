"use strict";

const { VALIDACAO_SOJA, montarFatores, montarMetodologia } = require("./metodologia-base");

// Metodologia da soja, o 5º ativo: os 4 fatores e as 3 regras da proposta da soja (docs/proposta-ativo-soja.md, v2.2),
// aprovados pelo Comitê, com o David, em 2026-10-08 (ADR 0116), itens 1 a 6 da §2.15, como propostos. A soja NÃO está
// no FEL 1: o `fel1` de cada fator é o que a proposta aprovada diz (o tipo, a direção, o mecanismo e as fontes), e a
// origem fica no catálogo (shared/fatores-fel1.js, `origem`). Os PESOS, aprovados pelo Comitê na mesma data, são fixos
// por fator (o catálogo: F1 e F2 Alto, F3 Médio, F4 Baixo); a relevância por horizonte (§2.10 da proposta, `PESOS_SOJA.
// relevancia`) é outra coisa: diz em que prazo cada fator costuma mover o preço e vai ao prompt como orientação. A
// AGREGAÇÃO segue a do milho e do café: a IA combina os fatores pelo prompt, sem soma ponderada em código.
//
// Quatro coisas que não se confundem: o PESO (fixo, quanto o fator conta), a RELEVÂNCIA (por horizonte, em que prazo ele
// costuma pesar), a INTENSIDADE (fraca, moderada ou forte, o tamanho do choque na data, calculada pelo motor) e a REGRA
// (R1 a R3, sem peso: muda a aplicabilidade ou a intensidade, ou marca a leitura).
//
// As regras (R1, R2 e R3) são itens próprios (`regra`, metodologia-base.js): calculadas como os fatores, sem peso nem
// pressão. Os limites das medidas de F1 a F3 (a posição no próprio histórico, neutra do percentil 20 ao 80, forte abaixo
// do 10 ou acima do 90) são calibração do FinMind, como no café (ADR 0060); os da R2 (20 e 80) e da R3 (10 e 90) foram
// aprovados. Leitura de tendência, nunca recomendação: nada daqui gera sinal de compra ou venda.

// v1 (2026-10-08): a aprovação do Comitê (ADR 0116).
// v2 (2026-10-08): os pesos fixos por fator e a relevância por horizonte, aprovados pelo Comitê (ADR 0116, adendo).
const VERSAO = 2;
const DATA_VERSAO = "2026-10-08";
const AUTORIA = "proposta da soja v2.2 do FinMind, aprovada pelo Comitê, com o David, em 2026-10-08 (ADR 0116)";
const CALIBRACAO =
  "Os limites são calibração do FinMind, como no café (ADR 0060): a posição de cada medida no próprio histórico, neutra do percentil 20 ao 80, forte abaixo do 10 ou acima do 90. A proposta aprovada define o baseline (§2.8); os limites são parâmetros do Comitê.";
const MEDICAO =
  "Medição aprovada (§2.5): um primário por período decide a direção e a intensidade; a confirmação que aponta o lado oposto, fora da faixa neutra, limita o fator a fraca; o contexto só informa.";

const DEFINICOES = [
  {
    codigo: "SOJA_OFERTA_EUA",
    fel1: {
      tipo: "Fundamentalista (oferta)",
      direcao: "Alta com o choque que reduz a produção americana (área menor, lavoura pior, produção revista para baixo); baixa com o contrário",
      mecanismo: "A produção dos EUA (área × produtividade) é a maior oferta exportável do ano-safra; o choque novo nela move Chicago, que é o preço do SJC",
      fonte: "USDA (Prospective Plantings, Acreage, Crop Progress, WASDE), NOAA (VHI e previsão do CPC)"
    },
    dados: {
      observaveis: ["USDA_SOJA_AREA_PLANTADA", "USDA_SOJA_CONDICAO", "NOAA_VH_SOJA", "WASDE_SOJA_EUA", "NOAA_CPC_MILHO"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para a medição aprovada: a área desde 2001 (51 edições), a condição desde 1986, o VHI desde 1982 e o WASDE desde as edições de 2011 (as revisões da produção só têm o histórico mínimo de 10 desde 2013). Sem validação histórica ainda: ela é feita pela Qualidade da IA e por um teste depois (ADR 0116). Com 25 a 40 anos, os percentis nos extremos são grosseiros: em 2012, o Acreage foi o maior aumento sobre a intenção da série (percentil 100), e a condição da seca ficou no percentil 3,8 (a de 1988 foi pior); pela regra, valeu a área, limitada a fraca."
      },
      lacunas: [
        "A expectativa do mercado antes de cada relatório não é coletada: a surpresa medida é a revisão contra a edição anterior (§2.8).",
        "A previsão do NOAA/CPC (contexto) só começou em 2026-10-05, nos 5 estados do Corn Belt."
      ]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler o choque NOVO sobre a produção americana do ano-safra (área × produtividade), da intenção de plantio ao WASDE de janeiro.",
      medida:
        "Até o 1º boletim de condição: a área (a intenção contra a área final do ano anterior; o Acreage contra a intenção). Do 1º boletim ao WASDE de agosto: a área e a produtividade (condição boa + excelente), com o VHI dos EUA confirmando a produtividade e a previsão do CPC como contexto. Do WASDE de agosto ao de janeiro: a revisão da produção no WASDE, com a condição confirmando.",
      comparacao: "A área e a revisão contra as do mesmo relatório nos anos anteriores; a condição e o VHI contra a mesma semana dos anos anteriores (percentil).",
      leitura: `Mais oferta pressiona para baixa; menos, para alta. Com área e produtividade em lados opostos, vale a de posição mais extrema, limitada a fraca; no empate, a publicada por último (o choque novo, operacionalização do FinMind). ${MEDICAO} ${CALIBRACAO} Fora da janela (R1), não pressiona.`
    },
    perguntas: [],
    decisoes: [
      "Fator, medição e baseline aprovados como propostos (Comitê, com o David, 2026-10-08, ADR 0116; proposta v2.2, §2.5 e §2.8).",
      "Peso Alto (3), fixo; a relevância por horizonte e a janela da safra (R1) dizem quando ele atua (Comitê, com o David, 2026-10-08, ADR 0116)."
    ]
  },
  {
    codigo: "SOJA_OFERTA_AMERICA_SUL",
    fel1: {
      tipo: "Fundamentalista (oferta)",
      direcao: "Alta com a quebra da safra do Brasil e da Argentina; baixa com a safra cheia",
      mecanismo: "Brasil e Argentina somam mais da metade da exportação mundial: a safra deles disputa a demanda com a americana e move Chicago",
      fonte: "USDA (WASDE), Conab, NOAA (VHI)"
    },
    dados: {
      observaveis: ["WASDE_SOJA_PAISES", "CONAB_SOJA_SAFRA", "NOAA_VH_SOJA"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para a medição aprovada: o WASDE com Brasil e Argentina desde as edições de 2011 e o VHI desde 1982. A Conab (confirmação) só tem levantamentos desde fev/2025: as revisões dela só ganham o histórico mínimo de 10 com o tempo, e até lá não limitam o fator. Na seca argentina de 2022/23, janeiro e fevereiro ficaram neutros (o Brasil, com a safra recorde, pesa mais na ponderação) e março, só com a Argentina, deu alta forte. Sem validação histórica ainda (ADR 0116)."
      },
      lacunas: ["Os dados da Argentina (Bolsa de Cereales) não são coletados: a Argentina entra pelo WASDE e pelo VHI (§2.14).", "O andamento semanal do plantio e da colheita da Conab não é coletado: a fase vem do calendário (R1)."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler o choque NOVO na produção somada de Brasil e Argentina, de 1º de novembro a 30 de junho.",
      medida:
        "Em novembro e de abril a junho: a revisão da produção de Brasil + Argentina no WASDE, com a revisão da Conab (Brasil) confirmando. De dezembro a março: o VHI sobre a soja (dezembro, o Brasil; janeiro e fevereiro, os dois ponderados pela produção da safra anterior no WASDE; março, a Argentina), com o WASDE e a Conab confirmando e as UFs e as províncias como contexto.",
      comparacao: "A revisão contra as das edições de novembro a junho dos anos anteriores; o VHI contra a mesma semana dos anos anteriores (percentil).",
      leitura: `Mais oferta pressiona para baixa; menos, para alta. ${MEDICAO} ${CALIBRACAO} Fora da janela (R1, de julho a outubro), não pressiona.`
    },
    perguntas: [],
    decisoes: [
      "Fator, medição e baseline aprovados como propostos (Comitê, com o David, 2026-10-08, ADR 0116; proposta v2.2, §2.5 e §2.8).",
      "Peso Alto (3), fixo; a relevância por horizonte e a janela da safra (R1) dizem quando ele atua (Comitê, com o David, 2026-10-08, ADR 0116)."
    ]
  },
  {
    codigo: "SOJA_DEMANDA_EUA",
    fel1: {
      tipo: "Fundamentalista (demanda)",
      direcao: "Alta com a demanda pela soja dos EUA revista para cima; baixa com ela revista para baixo",
      mecanismo: "Quanto o mundo e as esmagadoras compram da soja americana (exportação e esmagamento): o outro lado do preço",
      fonte: "USDA (WASDE)"
    },
    dados: {
      observaveis: ["WASDE_SOJA_EUA", "WASDE_SOJA_PAISES"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "Basta para a fase 1, só mensal: a revisão do uso no WASDE desde as edições de 2011. Nos horizontes de 1 e 7 dias, a demanda só chega pelos eventos (F4). As vendas semanais (Export Sales), o primário da fase 2, ficaram fora desta aprovação (§2.14, item 7 da §2.15). A margem de esmagamento (FMI) é candidata a confirmação, só depois do teste (ADR 0116). Sem validação histórica ainda."
      },
      lacunas: ["As vendas semanais para exportação (USDA Export Sales) não são coletadas: fase 2, com demanda e ADR próprios.", "A margem de esmagamento não entra até o teste."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Ler o choque NOVO na demanda pela soja dos EUA, nunca o nível.",
      medida: "O uso dos EUA (exportação + esmagamento) na safra mais nova de cada edição do WASDE; a importação da China como contexto.",
      comparacao: "A revisão contra a edição anterior (a mesma safra), no percentil das revisões das edições anteriores.",
      leitura: `Demanda revista para cima pressiona para alta; para baixo, para baixa. O 1º número de uma safra (a edição de maio) não tem revisão: neutra. ${CALIBRACAO}`
    },
    perguntas: [],
    decisoes: [
      "Fator, medição e baseline aprovados como propostos (Comitê, com o David, 2026-10-08, ADR 0116; proposta v2.2, §2.5 e §2.8). A margem de esmagamento: testar; só vira confirmação se passar (item 6).",
      "Peso Médio (2), fixo (Comitê, com o David, 2026-10-08, ADR 0116)."
    ]
  },
  {
    codigo: "SOJA_POLITICA",
    fel1: {
      tipo: "Evento (política)",
      direcao: "Depende da decisão: a que desloca a demanda pela soja dos EUA para cima, ou a oferta concorrente para baixo, pressiona para alta; a contrária, para baixa",
      mecanismo: "Decisões de governo que deslocam a demanda ou a oferta de uma vez: tarifas e acordos EUA–China, retenções e câmbio especial da Argentina, volumes de biocombustível nos EUA (EPA) e a mistura de biodiesel no Brasil",
      fonte: "Leitura diária de eventos por IA nas fontes autorizadas (ADR 0115)"
    },
    evento: { janelaDias: 7 },
    dados: { observaveis: [], eventos: true, lacunas: ["A gravidade e a pressão de cada evento são leitura da IA de eventos, sem validação humana; a escala de níveis é provisória."] },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Trazer as decisões de política comercial e de biocombustíveis que mudam a oferta ou a demanda da soja de uma vez.",
      medida: "Os eventos aceitos da leitura diária de eventos da soja marcados com este fator, na janela de 7 dias.",
      comparacao: "Sem baseline: notícia não tem série. A logística, a sanidade e o resto vão à seção de eventos da base do prompt, sem fator.",
      leitura:
        "Vale o evento mais grave da janela de 7 dias, como a geopolítica do petróleo (ADR 0098). Não vira número contínuo. O peso Baixo é estrutural: um evento político grave pode ser a força dominante em 1 e 7 dias (relevância alta nesses prazos)."
    },
    perguntas: [],
    decisoes: [
      "Fator de evento aprovado como proposto (Comitê, com o David, 2026-10-08, ADR 0116; proposta v2.2, §2.5). A leitura de eventos da soja passa a marcá-lo (eventos-soja-diaria.md v2).",
      "Peso Baixo (1), fixo, com a relevância alta em 1 e 7 dias: o peso é estrutural e não limita o impacto de um evento grave no curto prazo (Comitê, com o David, 2026-10-08, ADR 0116)."
    ]
  },
  {
    codigo: "SOJA_R1_CALENDARIO",
    nome: "Calendário da safra",
    regra: {
      sigla: "R1",
      afeta: ["SOJA_OFERTA_EUA", "SOJA_OFERTA_AMERICA_SUL"],
      dimensao: "APLICABILIDADE",
      quando: "Sempre: diz em que fase está cada país e se F1 e F2 estão na janela."
    },
    fel1: {
      tipo: "Regra de aplicabilidade",
      direcao: "Sem direção: fora da janela da safra, o fator não pressiona",
      mecanismo: "A safra só pode surpreender enquanto está em formação: fora disso, F1 e F2 não têm choque novo",
      fonte: "USDA (Crop Progress) nos EUA; calendário fixo no Brasil e na Argentina (§2.4)"
    },
    dados: { observaveis: ["USDA_SOJA_PROGRESSO", "USDA_SOJA_AREA_PLANTADA"], eventos: false, lacunas: ["O andamento semanal da Conab não é coletado: o Brasil e a Argentina seguem o calendário."] },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Dizer quando F1 e F2 se aplicam e qual observável é o primário.",
      medida: "A fase da cultura em cada país e a janela de cada fator de oferta.",
      comparacao: "O F1 da intenção de plantio ao WASDE de janeiro; o F2 de 1º de novembro a 30 de junho.",
      leitura: "Fora da janela, o fator lê \"fora da janela\" e não pressiona. Sem peso, sem direção."
    },
    perguntas: [],
    decisoes: ["Regra aprovada como proposta (Comitê, com o David, 2026-10-08, ADR 0116; proposta v2.2, §2.4 e §2.6)."]
  },
  {
    codigo: "SOJA_R2_FOLGA_BALANCO",
    nome: "Folga do balanço dos EUA",
    regra: {
      sigla: "R2",
      afeta: ["SOJA_OFERTA_EUA", "SOJA_OFERTA_AMERICA_SUL", "SOJA_DEMANDA_EUA"],
      dimensao: "INTENSIDADE",
      quando: "Só quando o fator afetado não está neutro; nunca no F4."
    },
    fel1: {
      tipo: "Regra de intensidade",
      direcao: "Sem direção: diz QUANTO um choque move o preço, não para onde",
      mecanismo: "Com estoque apertado, a oferta não amortece o choque e o preço precisa se mover mais para racionar o uso; com estoque folgado, o estoque absorve",
      fonte: "USDA (WASDE; Grain Stocks como contexto)"
    },
    dados: {
      observaveis: ["WASDE_SOJA_EUA", "WASDE_SOJA_PAISES", "ESTOQUES_SOJA_EUA_TRIMESTRAIS"],
      eventos: false,
      lacunas: ["A forma do efeito (quanto a intensidade muda e se é simétrico) é da etapa da agregação; até lá, o prompt diz só o sentido. Com as edições do WASDE desde 2011, o estado começa em 2016 (5 anos do mesmo mês)."]
    },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Dizer se o balanço americano amplia ou amortece os choques de oferta e de demanda.",
      medida: "O estoque final sobre o uso dos EUA na safra mais nova de cada edição do WASDE; o estoque/uso mundial e o Grain Stocks como contexto.",
      comparacao: "O percentil contra as edições do mesmo mês nos anos anteriores (o nível, não a variação).",
      leitura: "Apertado até o percentil 20, folgado a partir do 80 (aprovados). Apertado: um choque de F1, F2 ou F3 tende a mover mais o preço; folgado, menos. Muda a intensidade, nunca a direção nem o peso."
    },
    perguntas: [],
    decisoes: ["Regra e limites aprovados como propostos (Comitê, com o David, 2026-10-08, ADR 0116; proposta v2.2, §2.6 e item 5 da §2.15)."]
  },
  {
    codigo: "SOJA_R3_FUNDOS",
    nome: "Posicionamento dos fundos (COT)",
    regra: {
      sigla: "R3",
      afeta: ["LEITURA"],
      dimensao: "INFORMACAO",
      quando: "Só no extremo, com direção na leitura, nos horizontes CURTO e MEDIO."
    },
    fel1: {
      tipo: "Regra da leitura consolidada",
      direcao: "Sem direção própria: marca o papel dos fundos na leitura (EXCESSO, ou SEM_PAPEL com o extremo contra)",
      mecanismo: "O COT reage ao preço; no petróleo e no café, o extremo não antecipou reversão nem continuação (ADRs 0089 e 0094). O papel fica gravado com a leitura, para medir depois se tem relação com o acerto",
      fonte: "CFTC (COT, managed money, soja da CBOT)"
    },
    dados: { observaveis: ["COT_SOJA"], eventos: false, lacunas: [] },
    proposta: {
      autoria: AUTORIA,
      objetivo: "Marcar o papel dos fundos na leitura consolidada, como no café, só como informação.",
      medida: "A posição líquida do managed money em % dos contratos em aberto.",
      comparacao: "O percentil dos 3 anos anteriores; extremo no 10 ou abaixo e no 90 ou acima (aprovados, os do café).",
      leitura: "No extremo, lido como reversão: com a leitura no mesmo lado que o extremo aponta, EXCESSO; no lado oposto, SEM_PAPEL com o extremo contra. Não muda a direção, a faixa nem a confiança. O efeito na confiança fica pendente da validação."
    },
    perguntas: [],
    decisoes: ["Regra e limites aprovados como propostos, igual ao café (Comitê, com o David, 2026-10-08, ADR 0116; proposta v2.2, §2.6 e item 5 da §2.15)."]
  }
];

const FATORES_SOJA = montarFatores("SOJA", DEFINICOES, VALIDACAO_SOJA);

const DECISAO_COMITE = "Comitê, com o David, 2026-10-08 (ADR 0116)";
const DO_ATIVO = {
  decisoes: [
    `A soja é o 5º ativo: os itens 1 a 6 da proposta v2.2 (arquitetura, fatores, regras, medição, baselines e limites, margem de esmagamento só como teste) aprovados como propostos, até o prompt diário, a leitura de tendência da IA e o Centro de Decisão. ${DECISAO_COMITE}.`,
    `Preço de referência: o SJC da B3 (US$/saca), liquidado pelo preço da soja da CME; o câmbio e o prêmio de Paranaguá não entram no preço (§0 e §2.12 da proposta). Um vencimento por horizonte, o mais próximo que ainda negocia depois da data-alvo, com o aviso de menos de 100 contratos no dia (como o ADR 0078). ${DECISAO_COMITE}.`,
    "Faixas da leitura da IA: calibradas no próprio SJC (percentis 40 e 80 da variação, por horizonte), como nos outros ativos (ADR 0079). Provisórias: o histórico do SJC começa em 2022-03-21 e tem um buraco de cerca de 9 meses em 2023.",
    "Horizontes em dias corridos (1, 7, 30 e 90), como nos outros ativos.",
    `Pesos fixos por fator, na escala do FEL 1: F1 e F2 Alto (3), F3 Médio (2), F4 Baixo (1), iguais em todos os horizontes. A matriz fator × horizonte da proposta (§2.10) é relevância, não peso: vai ao prompt como orientação. A agregação segue a do milho e do café: a IA combina os fatores pelo prompt, sem soma ponderada em código. A sugestão de agregação do FinMind (docs/proposta-pesos-agregacao-soja.md) não foi adotada. Comitê, com o David, 2026-10-08 (ADR 0116, adendo).`,
    `As fontes da fase 2 (Export Sales e o Chicago diário do Yahoo como pesquisa) ficaram de fora (item 7). ${DECISAO_COMITE}.`,
    "A validação histórica da §3 da proposta deixa de ser condição para o prompt: a soja segue o caminho do milho e do café, e a validação é feita pela Qualidade da IA e por um teste histórico depois. Um fator que não passar sai do prompt como pressão (ADR 0116).",
    "Os eventos de política comercial e de biocombustíveis da leitura diária da soja (ADR 0115) marcam o F4; a logística, a sanidade e o resto vão à seção de eventos da base do prompt, sem fator."
  ],
  perguntas: []
};

// Os pesos (fixos, no catálogo) e a relevância por horizonte, aprovados pelo Comitê, com o David, em 2026-10-08 (ADR
// 0116, adendo). A relevância é a matriz da §2.10 da proposta, com as notas dela; o prompt (soja-analise-diaria.md, item 1
// do bloco 4) leva a mesma tabela em texto, e um teste confere as duas.
const relevancia = (imediato, curto, medio, longo) =>
  Object.fromEntries(
    [
      ["IMEDIATO", imediato],
      ["CURTO", curto],
      ["MEDIO", medio],
      ["LONGO", longo]
    ].map(([h, [nivel, nota]]) => [h, { nivel, nota }])
  );
const PESOS_SOJA = {
  autoria: "Comitê, com o David, em 2026-10-08 (ADR 0116)",
  descricao:
    "o peso é fixo por fator, na escala do FEL 1 (Alto = 3, Médio = 2, Baixo = 1), igual em todos os horizontes. A relevância por horizonte não é peso: diz em que prazo o fator costuma mover o preço e vai ao prompt como orientação. A agregação segue a do milho e do café: a IA combina os fatores pelo prompt, sem soma ponderada em código. A janela da safra (R1) controla quando F1 e F2 atuam; as regras R1 a R3 não têm peso.",
  relevancia: {
    descricao:
      "Em que prazo cada fator costuma mover o preço (proposta v2.2, §2.10; hipótese, sem validação histórica). Não muda o peso: um fator de peso Baixo com relevância alta (a política em 1 e 7 dias) pode ser a força dominante quando há evento grave. Fora da janela da safra (R1), F1 e F2 não pressionam em nenhum horizonte.",
    fatores: {
      SOJA_OFERTA_EUA: relevancia(
        ["Média", "alta em dia de relatório e na virada da previsão em julho e agosto"],
        ["Alta", "junho a agosto"],
        ["Alta", "junho a setembro"],
        ["Média", "área e produtividade definem o ano"]
      ),
      SOJA_OFERTA_AMERICA_SUL: relevancia(["Baixa", "média em dia de Conab e WASDE"], ["Média", "dezembro a fevereiro"], ["Alta", "dezembro a março"], ["Média"]),
      SOJA_DEMANDA_EUA: relevancia(["Baixa", "mensal: nesse prazo, a demanda chega pelos eventos"], ["Baixa", "mensal: nesse prazo, a demanda chega pelos eventos"], ["Média"], ["Média"]),
      SOJA_POLITICA: relevancia(["Alta"], ["Alta"], ["Média"], ["Baixa", "média se a medida for duradoura, como uma tarifa"])
    }
  }
};

function obterMetodologiaSoja() {
  return montarMetodologia({
    ativo: "SOJA",
    nome: "Soja",
    versao: VERSAO,
    dataVersao: DATA_VERSAO,
    doAtivo: DO_ATIVO,
    pesos: PESOS_SOJA,
    fatores: FATORES_SOJA
  });
}

module.exports = { FATORES_SOJA, obterMetodologiaSoja };
