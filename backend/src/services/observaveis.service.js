"use strict";

const marketDataService = require("./market-data.service");
const observationDataService = require("./observation-data.service");
const marketQuoteRepository = require("../repositories/market-quote.repository");
const collectionExecutionRepository = require("../repositories/collection-execution.repository");
const { NotFoundError } = require("../shared/errors");

// Partes comuns dos cards do WASDE (milho): série anual, uma edição mensal, valores como publicados.
const BASE_WASDE_MILHO = {
  origem: "observation",
  frequencia: "ANUAL",
  toleranciaDias: 400,
  fonte: "USDA - WASDE",
  fonteCollectorCode: "wasde-milho"
};

// Partes comuns dos cards da Conab (milho): série por safra, revista a cada levantamento mensal.
// `toleranciaDias` cobre o intervalo até o 1º levantamento da safra seguinte (mid-out).
const BASE_CONAB_MILHO = {
  origem: "observation",
  frequencia: "ANUAL",
  toleranciaDias: 430,
  fonte: "Conab - Boletim da Safra de Grãos",
  fonteCollectorCode: "conab-milho"
};

const FONTE_DETALHE_CONAB_MILHO = {
  metodologia:
    "Um valor por safra (o dia da observação é 1º de setembro do ano de início; convenção, como no WASDE). Cada levantamento mensal da Conab reestima a safra corrente e a anterior: a data de publicação é a REAL, tirada da página do levantamento, e cada revisão vira uma versão nova, o que preserva o que o mercado sabia em cada data. Valores como publicados, sem conversão de unidade (mil t, mil ha, kg/ha). A planilha baixada é a versão atual de cada levantamento: se a Conab a corrigiu depois de publicar (a página informa \"Atualizado em\"), a correção pode já estar nos valores.",
  formatoOrigem: "XLSX (planilha de cada levantamento mensal do Boletim da Safra de Grãos)",
  urlOficial: "https://www.gov.br/conab/pt-br/atuacao/informacoes-agropecuarias/safras/safra-de-graos/boletim-da-safra-de-graos"
};

// O escopo (o que o card cobre e o que não cobre) é de cada card: o dos EUA cobre só os EUA, o por país cobre a seleção do WASDE.
const FIM_ESCOPO_WASDE_MILHO = "A PSD do USDA, com 125 países e dados desde 1960, não foi implementada. Histórico do WASDE: de 2011 em diante.";

const FONTE_DETALHE_WASDE_MILHO = {
  metodologia:
    "Um valor por safra (o dia da observação é 1º de setembro do ano de início; o WASDE agrega anos comerciais locais, então é uma convenção). Cada edição mensal do WASDE reestima a safra corrente e as anteriores: a data de publicação é a REAL do release (listagem do ESMIS), e cada revisão vira uma versão nova, o que preserva o que o mercado sabia em cada data. Edições de 2011 em diante (antes só há PDF/TXT). Valores como publicados, sem conversão de unidade: os EUA em bushels (card \"Milho EUA\"), os países em toneladas (card \"Milho por país\").",
  formatoOrigem: "XLS (planilha de cada edição no ESMIS)",
  urlOficial: "https://esmis.nal.usda.gov/publication/world-agricultural-supply-and-demand-estimates"
};

// Catálogo estático dos observáveis conhecidos pelo FinMind - sem tabela
// própria de propósito (ver docs/decisoes-tecnicas.md, "não criar tabela
// sem necessidade real"). Um novo ativo = uma entrada nova aqui + um novo
// coletor (ver collectors/base/README.md), até que o especialista David
// justifique uma modelagem de domínio própria.
const CATALOGO_OBSERVAVEIS = [
  {
    instrumentCode: "USD_BRL",
    nome: "Dólar (USD/BRL)",
    unidade: "R$/US$",
    fonteCollectorCode: "bcb-usd-brl-venda",
    frequencia: "DIARIA",
    // Metodologia/proveniência real da fonte (não inventada) - ver decisão e
    // confirmação por chamada real à API em
    // docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md.
    fonteDetalhe: {
      descricao:
        "Fechamento diário do câmbio livre (taxa PTAX de venda), calculada pelo Banco Central como média das taxas efetivas do mercado interbancário.",
      metodologia:
        "Não é uma cotação intradiária/tempo real - um novo dia útil só aparece na série depois do fechamento do câmbio, uma vez por dia.",
      formatoOrigem: "JSON (API SGS do Banco Central)",
      urlOficial: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/10?formato=json"
    }
  },
  {
    instrumentCode: "SELIC",
    nome: "Taxa Selic (Meta e Realizada)",
    unidade: "% a.a.",
    // Instrumento agrupa 2 séries via `modality` (meta/realizada) - ver
    // docs/adr/0006-fonte-taxa-selic-bcb-sgs.md. "Cotação atual" (card,
    // dashboard) usa sempre a meta: é o número publicamente reconhecido
    // como "a taxa Selic". Gráfico/tabela de histórico mostram as duas.
    modalidadePrincipal: "meta",
    fonteCollectorCode: ["bcb-selic-meta", "bcb-selic-realizada"],
    frequencia: "DIARIA",
    // Metodologia/proveniência real da fonte (não inventada) - ver decisão e
    // confirmação por chamada real à API em
    // docs/adr/0006-fonte-taxa-selic-bcb-sgs.md.
    fonteDetalhe: {
      descricao:
        "Duas séries do Banco Central, na mesma unidade (% ao ano): a Meta Selic definida pelo Copom (série SGS 432) e a Selic realizada - taxa diária efetiva já composta e anualizada pelo próprio BCB (série SGS 1178).",
      metodologia:
        "A meta muda só nas reuniões do Copom (~8 por ano), repetindo o mesmo valor todo dia entre elas. A realizada é a taxa diária efetiva do mercado interbancário (série SGS 11) já acumulada no mês e anualizada pelo BCB - o FinMind não faz nenhum cálculo/composição própria sobre esse valor.",
      formatoOrigem: "JSON (API SGS do Banco Central)",
      urlOficial: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/10?formato=json"
    }
  },

  // --- Observáveis point-in-time (tabela `observation`, ADR 0008/0009) ---
  // `origem: "observation"` faz o serviço ler de observation em vez de
  // market_quote. Um card agrupa séries de MESMA unidade (a modalidade é a
  // chave de cada série no gráfico). Mesma convenção da Selic.
  {
    instrumentCode: "OURO_LBMA",
    origem: "observation",
    nome: "Ouro - LBMA Gold Price PM",
    unidade: "US$/oz",
    casasDecimais: 2,
    frequencia: "DIARIA",
    toleranciaDias: 4,
    fonte: "LBMA (ICE Benchmark Administration)",
    fonteCollectorCode: "lbma-gold-pm-usd",
    series: [{ modalidade: "usd", seriesCode: "LBMA.GOLD_PM.USD" }],
    modalidadePrincipal: "usd",
    fonteDetalhe: {
      descricao: "Preço de referência do ouro fixado no leilão da tarde (PM) de Londres, em dólares por onça troy. Histórico desde 1968.",
      metodologia:
        "Um valor por dia útil, fixado às 15:00 de Londres. A fonte não informa quando publicou: a data de disponibilidade é ESTIMADA em 15:00 de Londres do próprio dia. Licença: a IBA exige licença para obter, usar ou redistribuir o histórico do preço - uso atual restrito a pesquisa interna, sem exibir a terceiros (ADR 0009).",
      formatoOrigem: "JSON (feed público da LBMA)",
      urlOficial: "https://prices.lbma.org.uk/json/gold_pm.json"
    }
  },
  {
    instrumentCode: "TREASURY_10A",
    origem: "observation",
    nome: "Treasury 10 anos (EUA)",
    unidade: "% a.a.",
    casasDecimais: 2,
    frequencia: "DIARIA",
    // O FRED publica o valor de sexta só na segunda: 5 dias evita "atrasada"
    // toda segunda de manhã (e após feriado dos EUA).
    toleranciaDias: 5,
    fonte: "FRED - Federal Reserve (H.15)",
    fonteCollectorCode: ["fred-dgs10", "fred-dfii10", "fred-t10yie"],
    series: [
      { modalidade: "nominal", seriesCode: "FRED.DGS10" },
      { modalidade: "real", seriesCode: "FRED.DFII10" },
      { modalidade: "breakeven", seriesCode: "FRED.T10YIE" }
    ],
    // O "valor atual" do card é o juro real (DFII10): é o driver do ouro no relatório FEL 1.
    modalidadePrincipal: "real",
    fonteDetalhe: {
      descricao:
        "Três séries do FRED na mesma unidade: rendimento nominal (DGS10), rendimento real dos títulos indexados à inflação - TIPS (DFII10) e a inflação implícita (T10YIE = nominal - real, calculada pelo próprio FRED).",
      metodologia:
        "Um valor por dia útil. A coleta diária do FRED (API ou CSV) não informa a data de publicação nem revisões: a disponibilidade é ESTIMADA em 1 dia útil após a data observada (não conhece feriados dos EUA). Nas 5.932 datas com as três séries, nominal - inflação implícita reproduz o juro real com diferença zero. Licença: DGS10 e DFII10 são do Board of Governors do Fed (domínio público, citação pedida); o status da T10YIE, calculada pelo FRED, não foi confirmado. Uso atual: pesquisa interna, sem exibir a terceiros (ADR 0009).",
      formatoOrigem: "API REST do FRED (reserva: CSV público)",
      urlOficial: "https://fred.stlouisfed.org/series/DFII10"
    }
  },
  {
    instrumentCode: "DOLAR_AMPLO_FED",
    origem: "observation",
    nome: "Índice amplo do dólar (Fed)",
    unidade: "índice",
    casasDecimais: 4,
    frequencia: "DIARIA",
    // Série diária, mas divulgada semanalmente (Fed H.10, segundas): a última
    // observação pode ter até ~9 dias, e na segunda de manhã (antes do lote da
    // semana) chega a ~10,5.
    toleranciaDias: 12,
    fonte: "FRED - Federal Reserve (H.10)",
    fonteCollectorCode: "fred-dtwexbgs",
    series: [{ modalidade: "indice", seriesCode: "FRED.DTWEXBGS" }],
    modalidadePrincipal: "indice",
    fonteDetalhe: {
      descricao:
        "Índice do dólar contra uma cesta ampla de moedas (DTWEXBGS). Não é o DXY (índice ICE, licenciado): é o substituto gratuito, com metodologia e composição diferentes.",
      metodologia:
        "Os valores são diários, mas o Fed os divulga em lote semanal (segundas-feiras). A disponibilidade é ESTIMADA como a segunda-feira seguinte à data observada. Licença: série do Board of Governors do Fed (domínio público, citação pedida). Uso atual: pesquisa interna, sem exibir a terceiros (ADR 0009).",
      formatoOrigem: "API REST do FRED (reserva: CSV público)",
      urlOficial: "https://fred.stlouisfed.org/series/DTWEXBGS"
    }
  },
  ...["ouro", "milho"].map((ativo) => ({
    instrumentCode: ativo === "ouro" ? "COT_OURO" : "COT_MILHO",
    origem: "observation",
    nome: `CFTC COT - ${ativo === "ouro" ? "Ouro (COMEX)" : "Milho (CBOT)"}`,
    unidade: "contratos",
    casasDecimais: 0,
    frequencia: "SEMANAL",
    toleranciaDias: 10,
    fonte: "CFTC - Commitments of Traders",
    fonteCollectorCode: ativo === "ouro" ? "cftc-cot-gold" : "cftc-cot-corn",
    series: ["open_interest", "mm_long", "mm_short"].map((modalidade) => ({
      modalidade,
      seriesCode: `CFTC.${ativo === "ouro" ? "GOLD" : "CORN"}.${modalidade === "open_interest" ? "OPEN_INTEREST" : modalidade.toUpperCase()}`
    })),
    modalidadePrincipal: "open_interest",
    fonteDetalhe: {
      descricao:
        "Posições em contratos futuros: contratos em aberto e posições compradas e vendidas dos fundos (managed money). A posição líquida não é gravada - é um fator, calculado a partir destas séries.",
      metodologia:
        "O dado é de terça-feira e normalmente sai na sexta, 15:30 ET, mas houve atrasos reais (o shutdown de 2025 atrasou semanas em até 50 dias). Desde ago/2022 a data de publicação é a REAL informada pela fonte; antes disso (carga em lote na fonte) é ESTIMADA em sexta 15:30 ET.",
      formatoOrigem: "JSON (API Socrata da CFTC)",
      urlOficial: "https://publicreporting.cftc.gov/resource/72hh-3qpy.json"
    }
  })),

  // --- USDA NASS Crop Progress do milho (EUA), semanal, abr-nov (ADR 0009) ---
  // Dois cards, todas as séries em % e do mesmo coletor. Fora da temporada
  // (dez-mar) a última observação passa da tolerância e o card aparece
  // "atrasado" - é a sazonalidade da fonte, não falha de coleta.
  ...[
    {
      instrumentCode: "USDA_MILHO_CONDICAO",
      nome: "Milho EUA - Condição da lavoura (USDA)",
      modalidadePrincipal: "good",
      series: [
        ["very_poor", "VERY_POOR"],
        ["poor", "POOR"],
        ["fair", "FAIR"],
        ["good", "GOOD"],
        ["excellent", "EXCELLENT"]
      ].map(([modalidade, classe]) => ({ modalidade, seriesCode: `USDA.CORN.CONDITION.${classe}` })),
      descricao:
        "Porcentagem da lavoura de milho dos EUA em cada classe de condição (muito ruim, ruim, regular, boa, excelente), conforme o relatório semanal Crop Progress do USDA. As cinco classes somam 100%. O valor em destaque é só a classe \"boa\": nenhuma soma ou índice é calculado aqui."
    },
    {
      instrumentCode: "USDA_MILHO_PROGRESSO",
      nome: "Milho EUA - Progresso da safra (USDA)",
      modalidadePrincipal: "harvested",
      series: [
        ["planted", "PLANTED"],
        ["emerged", "EMERGED"],
        ["silking", "SILKING"],
        ["dough", "DOUGH"],
        ["dented", "DENTED"],
        ["mature", "MATURE"],
        ["harvested", "HARVESTED"]
      ].map(([modalidade, etapa]) => ({ modalidade, seriesCode: `USDA.CORN.PROGRESS.${etapa}` })),
      descricao:
        "Porcentagem acumulada da área de milho dos EUA que já atingiu cada etapa do ciclo (plantio, emergência, floração, grão leitoso, grão farináceo, maturação e colheita), conforme o Crop Progress do USDA. Cada etapa só é reportada dentro da sua janela do ano; o valor em destaque é a colheita."
    }
  ].map((cartao) => ({
    ...cartao,
    origem: "observation",
    unidade: "%",
    casasDecimais: 0,
    frequencia: "SEMANAL",
    toleranciaDias: 10,
    fonte: "USDA NASS - Crop Progress",
    fonteCollectorCode: "usda-nass-crop-progress-milho",
    fonteDetalhe: {
      descricao: cartao.descricao,
      metodologia:
        "Relatório semanal (semana terminada no domingo), publicado às 16:00 ET do primeiro dia útil da semana - feriado federal desloca para terça. A fonte não informa a hora da publicação: a data de disponibilidade é ESTIMADA por esse calendário. Só de abril a novembro; fora da temporada não há dado novo.",
      formatoOrigem: "JSON (API QuickStats do USDA NASS)",
      urlOficial: "https://quickstats.nass.usda.gov/api"
    }
  })),

  // --- Exportação brasileira de milho, mensal (Comex Stat / MDIC, ADR 0013) ---
  // Dois cards, um por unidade (kg e US$ não dividem o mesmo eixo). Dado desde
  // 2005: antes disso o código NCM muda e não foi mapeado. Mensal com divulgação
  // ~1 mês depois: a última observação pode ter ~70 dias antes de "atrasar".
  ...[
    {
      instrumentCode: "COMEX_MILHO_VOLUME",
      nome: "Milho - Exportação (volume)",
      unidade: "kg",
      seriesCode: "COMEX.MILHO.EXPORT.KG",
      descricao: "Volume mensal de milho em grão exportado pelo Brasil (NCM 10059010), em quilogramas, conforme o Comex Stat do MDIC."
    },
    {
      instrumentCode: "COMEX_MILHO_VALOR",
      nome: "Milho - Exportação (valor FOB)",
      unidade: "US$",
      seriesCode: "COMEX.MILHO.EXPORT.FOB_USD",
      descricao: "Valor mensal FOB do milho em grão exportado pelo Brasil (NCM 10059010), em dólares, conforme o Comex Stat do MDIC."
    }
  ].map(({ seriesCode, descricao, ...cartao }) => ({
    ...cartao,
    origem: "observation",
    casasDecimais: 0,
    frequencia: "MENSAL",
    toleranciaDias: 75,
    fonte: "Comex Stat (MDIC)",
    fonteCollectorCode: "comex-milho-exportacao",
    series: [{ modalidade: "export", seriesCode }],
    modalidadePrincipal: "export",
    fonteDetalhe: {
      descricao,
      metodologia:
        "Um valor por mês (o dia da observação é o 1º do mês). A fonte não informa quando publicou nem se revisa meses já divulgados: a data de disponibilidade é ESTIMADA em 15 do mês seguinte, e a coleta diária relê o ano corrente e o anterior. Cobertura a partir de 2005: antes disso o código NCM muda e o mapeamento não foi feito. Só exportação.",
      formatoOrigem: "JSON (API de dados do Comex Stat, sem chave)",
      urlOficial: "https://comexstat.mdic.gov.br"
    }
  })),

  // --- USDA WASDE - balanço do milho, uma edição por mês desde 2011 (ADR 0015). Todas as linhas do WASDE são coletadas ---
  // A série é ANUAL (um ponto por safra, observed_at = 1º/set do ano de início) e cada edição do
  // WASDE pode revisá-la: o histórico mostra a versão mais recente de cada safra, e o vintage (o
  // que se sabia em cada edição) fica na camada point-in-time. `toleranciaDias` alto de propósito:
  // o último ponto é a safra em projeção, com observed_at futuro ou de até ~1 ano atrás.
  // Dois cards: os EUA (série própria, uma métrica por vez, cada uma na unidade do USDA) e um
  // card por país (em milhões de toneladas, com seletor de região e de métrica, como o CCM
  // tem de vencimento).
  {
    instrumentCode: "WASDE_MILHO_EUA",
    nome: "Milho EUA (WASDE)",
    unidade: "milhões de bushels",
    casasDecimais: 0,
    ...BASE_WASDE_MILHO,
    // Séries `WASDE.MILHO.EUA.<CAMPO>`: UMA série por métrica, sem itens - a tela só oferece o seletor de métrica.
    porCampo: { prefixoSerie: "WASDE.MILHO.EUA" },
    campoPrincipal: "ENDING_STOCKS",
    campos: [
      { codigo: "ENDING_STOCKS", nome: "Estoque final", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "PRODUCTION", nome: "Produção", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "AREA_PLANTED", nome: "Área plantada", unidade: "milhões de acres", casasDecimais: 1 },
      { codigo: "AREA_HARVESTED", nome: "Área colhida", unidade: "milhões de acres", casasDecimais: 1 },
      { codigo: "YIELD", nome: "Produtividade", unidade: "bushels/acre", casasDecimais: 1 },
      { codigo: "BEGINNING_STOCKS", nome: "Estoque inicial", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "IMPORTS", nome: "Importações", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "SUPPLY_TOTAL", nome: "Oferta total", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "FEED_RESIDUAL", nome: "Ração e resíduo", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "FSI", nome: "Alimentos, sementes e uso industrial", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "DOMESTIC_TOTAL", nome: "Consumo interno total", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "EXPORTS", nome: "Exportações", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "USE_TOTAL", nome: "Uso total", unidade: "milhões de bushels", casasDecimais: 0 }
    ],
    fonteDetalhe: {
      ...FONTE_DETALHE_WASDE_MILHO,
      escopo: `só os Estados Unidos, com as 13 métricas que o WASDE traz para o país. Os demais países estão no card "Milho por país", em toneladas. ${FIM_ESCOPO_WASDE_MILHO}`,
      descricao:
        "Balanço de milho dos Estados Unidos por safra (ano comercial set-ago), conforme o WASDE do USDA: estoques, produção, área, produtividade, oferta e uso. Cada métrica na unidade do USDA (bushels, acres, bushels/acre), sem conversão."
    }
  },
  {
    instrumentCode: "WASDE_MILHO_PAISES",
    nome: "Milho por país (WASDE)",
    unidade: "milhões de t",
    casasDecimais: 1,
    ...BASE_WASDE_MILHO,
    // Séries `WASDE.MILHO.MUNDO.<REGIAO>.<CAMPO>`: os itens (regiões) são descobertos no banco;
    // vêm marcadas as `itensPadrao` (o resto é opt-in) e o destaque do card é `itemPrincipal`.
    porRegiao: {
      prefixoSerie: "WASDE.MILHO.MUNDO",
      campoReferencia: "ENDING_STOCKS",
      itemPrincipal: "WORLD",
      itensPadrao: ["BRAZIL", "UNITED_STATES", "ARGENTINA", "CHINA"]
    },
    campoPrincipal: "ENDING_STOCKS",
    campos: [
      { codigo: "ENDING_STOCKS", nome: "Estoque final", unidade: "milhões de t", casasDecimais: 1 },
      { codigo: "PRODUCTION", nome: "Produção", unidade: "milhões de t", casasDecimais: 1 },
      { codigo: "BEGINNING_STOCKS", nome: "Estoque inicial", unidade: "milhões de t", casasDecimais: 1 },
      { codigo: "IMPORTS", nome: "Importações", unidade: "milhões de t", casasDecimais: 1 },
      { codigo: "EXPORTS", nome: "Exportações", unidade: "milhões de t", casasDecimais: 1 },
      { codigo: "DOMESTIC_TOTAL", nome: "Consumo interno total", unidade: "milhões de t", casasDecimais: 1 },
      { codigo: "DOMESTIC_FEED", nome: "Consumo para ração", unidade: "milhões de t", casasDecimais: 1 }
    ],
    fonteDetalhe: {
      ...FONTE_DETALHE_WASDE_MILHO,
      escopo: `a seleção de países que o WASDE publica: Argentina, Brasil, Canadá, China, Egito, Estados Unidos, Japão, México, Rússia, África do Sul, Coreia do Sul, Ucrânia, União Europeia e Sudeste Asiático, mais os agregados Mundo, Mundo sem China, Total estrangeiro e Grandes exportadores/importadores. Todas essas linhas são coletadas; escolha as que quer ver. A Rússia só aparece a partir de 2017 (antes o WASDE agregava a ex-URSS) e a União Europeia tem séries por período. Países fora dessa seleção (Índia, Indonésia, Vietnã e outros) não são cobertos. ${FIM_ESCOPO_WASDE_MILHO}`,
      descricao:
        "Balanço de milho por país e por métrica (estoque final e inicial, produção, importações, exportações, consumo), por safra, em milhões de toneladas, conforme a tabela mundial do WASDE do USDA (estimativa do USDA, não da Conab). Uma linha por região; os agregados (mundo, mundo sem China etc.) ficam desmarcados por padrão por terem escala muito maior."
    }
  },

  // --- Conab - Boletim da Safra de Grãos, milho (ADR 0017): um levantamento por mês, desde fev/2025 ---
  // Dois cards: o milho por safra (1ª, 2ª, 3ª e total) por Região/UF, com seletor de região e de métrica (como o
  // card por país do WASDE), e o balanço nacional de oferta e demanda (uma série por métrica, como o card dos EUA).
  {
    instrumentCode: "CONAB_MILHO_SAFRA",
    nome: "Milho por safra e UF (Conab)",
    unidade: "mil t",
    casasDecimais: 1,
    ...BASE_CONAB_MILHO,
    // Séries `CONAB.MILHO.<REGIAO>.<METRICA>_<TIPO>`: as regiões são descobertas no banco; vêm marcados o Brasil e as
    // maiores UFs produtoras (`itensPadrao`, só exibição) e o destaque do card é o Brasil.
    porRegiao: {
      prefixoSerie: "CONAB.MILHO",
      campoReferencia: "PRODUCAO_TOTAL",
      itemPrincipal: "BRASIL",
      itensPadrao: ["BRASIL", "MT", "PR", "GO", "MS"],
      descritor: "conab"
    },
    campoPrincipal: "PRODUCAO_TOTAL",
    campos: [
      { codigo: "PRODUCAO_TOTAL", nome: "Produção - total (1ª, 2ª e 3ª safra)", unidade: "mil t", casasDecimais: 1 },
      { codigo: "PRODUCAO_1A", nome: "Produção - 1ª safra", unidade: "mil t", casasDecimais: 1 },
      { codigo: "PRODUCAO_2A", nome: "Produção - 2ª safra", unidade: "mil t", casasDecimais: 1 },
      { codigo: "PRODUCAO_3A", nome: "Produção - 3ª safra", unidade: "mil t", casasDecimais: 1 },
      { codigo: "AREA_TOTAL", nome: "Área - total", unidade: "mil ha", casasDecimais: 1 },
      { codigo: "AREA_1A", nome: "Área - 1ª safra", unidade: "mil ha", casasDecimais: 1 },
      { codigo: "AREA_2A", nome: "Área - 2ª safra", unidade: "mil ha", casasDecimais: 1 },
      { codigo: "AREA_3A", nome: "Área - 3ª safra", unidade: "mil ha", casasDecimais: 1 },
      { codigo: "PRODUTIVIDADE_TOTAL", nome: "Produtividade - total", unidade: "kg/ha", casasDecimais: 0 },
      { codigo: "PRODUTIVIDADE_1A", nome: "Produtividade - 1ª safra", unidade: "kg/ha", casasDecimais: 0 },
      { codigo: "PRODUTIVIDADE_2A", nome: "Produtividade - 2ª safra", unidade: "kg/ha", casasDecimais: 0 },
      { codigo: "PRODUTIVIDADE_3A", nome: "Produtividade - 3ª safra", unidade: "kg/ha", casasDecimais: 0 }
    ],
    fonteDetalhe: {
      ...FONTE_DETALHE_CONAB_MILHO,
      escopo:
        "só milho em grão (1ª, 2ª e 3ª safra e o total), com área, produtividade e produção de todas as regiões e das 27 UFs; os demais produtos da planilha (soja, trigo, algodão etc.) não são coletados. A 3ª safra só existe em poucas UFs (o resto vem zerado ou em branco). O vintage começa em fev/2025 (o que o índice da Conab ainda mantém); as séries históricas desde 1976/77 e os preços da Conab não foram carregados.",
      descricao:
        "Milho por safra (1ª, 2ª, 3ª e total) e por região ou UF, conforme o Boletim da Safra de Grãos da Conab (estimativa da Conab, não do USDA): área, produtividade e produção. Cada levantamento mensal revisa a estimativa da safra; uma linha por região ou UF."
    }
  },
  {
    instrumentCode: "CONAB_MILHO_BALANCO",
    nome: "Milho - balanço nacional (Conab)",
    unidade: "mil t",
    casasDecimais: 1,
    ...BASE_CONAB_MILHO,
    // Séries `CONAB.MILHO.BALANCO.<CAMPO>`: UMA série por métrica, só do Brasil - a tela oferece o seletor de métrica.
    porCampo: { prefixoSerie: "CONAB.MILHO.BALANCO" },
    campoPrincipal: "ESTOQUE_FINAL",
    campos: [
      { codigo: "ESTOQUE_FINAL", nome: "Estoque final", unidade: "mil t", casasDecimais: 1 },
      { codigo: "ESTOQUE_INICIAL", nome: "Estoque inicial", unidade: "mil t", casasDecimais: 1 },
      { codigo: "PRODUCAO", nome: "Produção", unidade: "mil t", casasDecimais: 1 },
      { codigo: "IMPORTACAO", nome: "Importação", unidade: "mil t", casasDecimais: 1 },
      { codigo: "SUPRIMENTO", nome: "Suprimento (oferta total)", unidade: "mil t", casasDecimais: 1 },
      { codigo: "CONSUMO", nome: "Consumo", unidade: "mil t", casasDecimais: 1 },
      { codigo: "EXPORTACAO", nome: "Exportação", unidade: "mil t", casasDecimais: 1 },
      { codigo: "DEMANDA_TOTAL", nome: "Demanda total", unidade: "mil t", casasDecimais: 1 }
    ],
    fonteDetalhe: {
      ...FONTE_DETALHE_CONAB_MILHO,
      escopo:
        "só o balanço NACIONAL do milho (não há estoque nem consumo por UF na fonte), por safra, a partir de 2019/20 (a planilha traz as safras mais recentes; os levantamentos anteriores a fev/2025 não estão no índice da Conab). Só milho: os demais produtos da aba Suprimento não são coletados.",
      descricao:
        "Balanço de oferta e demanda do milho no Brasil por safra, conforme o Boletim da Safra de Grãos da Conab: estoque inicial e final, produção, importação, suprimento, consumo, exportação e demanda total, em mil toneladas. Na safra em projeção vale o mês do levantamento."
    }
  },

  // --- Futuro de milho da B3 (CCM), por vencimento (ADR 0009) ---
  // Dois cards sobre as MESMAS séries `B3.CCM.<TICKER>.<CAMPO>`: os campos têm
  // unidades diferentes, então a tela mostra UM campo por vez, com uma linha por
  // vencimento (nunca uma série contínua). `porVencimento` faz o serviço descobrir
  // os vencimentos no banco; por padrão só os que ainda negociam.
  ...[
    {
      instrumentCode: "CCM_PRECOS",
      nome: "Milho B3 (CCM) — Preços",
      unidade: "R$/saca",
      campoPrincipal: "SETTLE",
      campos: [
        { codigo: "SETTLE", nome: "Preço de ajuste", unidade: "R$/saca", casasDecimais: 2 },
        { codigo: "LAST", nome: "Último preço", unidade: "R$/saca", casasDecimais: 2 },
        { codigo: "HIGH", nome: "Máxima do dia", unidade: "R$/saca", casasDecimais: 2 },
        { codigo: "LOW", nome: "Mínima do dia", unidade: "R$/saca", casasDecimais: 2 },
        { codigo: "AVG", nome: "Preço médio", unidade: "R$/saca", casasDecimais: 2 },
        { codigo: "OSCN_PCT", nome: "Oscilação", unidade: "%", casasDecimais: 2 }
      ],
      descricao:
        "Preços diários de cada vencimento do futuro de milho da B3 (CCM): preço de ajuste, último, máxima, mínima, médio e oscilação. Cada vencimento é uma linha própria - o FinMind não encadeia vencimentos em série contínua."
    },
    {
      instrumentCode: "CCM_LIQUIDEZ",
      nome: "Milho B3 (CCM) — Liquidez",
      unidade: "contratos",
      campoPrincipal: "CONTRACTS",
      campos: [
        { codigo: "CONTRACTS", nome: "Contratos negociados", unidade: "contratos", casasDecimais: 0 },
        { codigo: "TRADES", nome: "Número de negócios", unidade: "negócios", casasDecimais: 0 },
        { codigo: "VOLUME_BRL", nome: "Volume financeiro", unidade: "R$", casasDecimais: 0 }
      ],
      descricao:
        "Liquidez diária de cada vencimento do futuro de milho da B3 (CCM): contratos negociados, número de negócios e volume financeiro. O relatório FEL 1 classifica a liquidez do CCM como modesta (§8.4, §13.3) - esta é a medida real."
    }
  ].map((cartao) => ({
    ...cartao,
    origem: "observation",
    porVencimento: { prefixoSerie: "B3.CCM", campoReferencia: "SETTLE" },
    casasDecimais: cartao.campos.find((c) => c.codigo === cartao.campoPrincipal).casasDecimais,
    frequencia: "DIARIA",
    toleranciaDias: 4,
    fonte: "B3 - Up2Data (negócios consolidados)",
    fonteCollectorCode: "b3-ccm-futuro",
    fonteDetalhe: {
      descricao: cartao.descricao,
      metodologia:
        "Um valor por vencimento e pregão. O valor em destaque é o do vencimento mais próximo ainda em negociação (sempre identificado ao lado). Por padrão o gráfico mostra os vencimentos que negociaram no último pregão; os já vencidos ficam disponíveis para seleção. A data de publicação é ESTIMADA (fim do dia do pregão em Brasília). Histórico: o arquivo público da B3 cobre só cerca de 15 meses e o FinMind acumula daqui em diante.",
      formatoOrigem: "CSV (TradeInformationConsolidatedFile, B3 Up2Data)",
      urlOficial: "https://arquivos.b3.com.br/tabelas/TradeInformationConsolidatedFile"
    }
  }))
];

// Heurística operacional simples (não é regra de negócio do especialista de
// mercado): uma série diária sem observação nos últimos dias corridos é
// tratada como "atrasada" - folga de 4 dias cobre um fim de semana + 1 dia
// de tolerância pra latência de publicação da fonte.
const DIAS_TOLERANCIA_FRESCOR = 4;

// `toleranciaDias` por observável: séries semanais (COT) ou divulgadas em lote
// semanal (índice do dólar) precisam de uma folga maior que a das diárias.
function calcularSituacao(dataReferencia, toleranciaDias = DIAS_TOLERANCIA_FRESCOR) {
  if (!dataReferencia) return "SEM_COLETA";
  const diffDias = (Date.now() - new Date(`${dataReferencia}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24);
  return diffDias <= toleranciaDias ? "EM_DIA" : "ATRASADA";
}

function ehObservation(item) {
  return item.origem === "observation";
}

// Cotação atual pela origem certa (market_quote ou observation).
function obterCotacaoAtualDoItem(item, deps) {
  return ehObservation(item)
    ? observationDataService.obterCotacaoAtual(item, deps)
    : marketDataService.obterCotacaoAtual(item.instrumentCode, item.modalidadePrincipal, deps);
}

function buscarNoCatalogo(codigo) {
  return CATALOGO_OBSERVAVEIS.find((item) => item.instrumentCode === codigo);
}

async function listarObservaveis(deps = {}) {
  const observaveis = await Promise.all(
    CATALOGO_OBSERVAVEIS.map(async (item) => {
      const { cotacao, destaque } = await obterCotacaoAtualDoItem(item, deps);
      // Futuro por vencimento / WASDE por região: o valor em destaque é o de UM item - a lista
      // diz qual (ex.: "R$/saca (CCMX26)", "milhões de t (Mundo)") em vez de sugerir uma série contínua.
      const unidade = cotacao?.unidade ?? item.unidade;
      return {
        codigo: item.instrumentCode,
        nome: item.nome,
        fonte: cotacao?.fonte ?? item.fonte ?? null,
        valor: cotacao?.valor ?? null,
        unidade: destaque ? `${unidade} (${destaque})` : unidade,
        casasDecimais: item.casasDecimais ?? 4,
        dataReferencia: cotacao?.dataReferencia ?? null,
        frequencia: item.frequencia,
        situacao: calcularSituacao(cotacao?.dataReferencia, item.toleranciaDias)
      };
    })
  );

  return { observaveis };
}

async function obterDetalheObservavel(codigo, deps = {}) {
  const item = buscarNoCatalogo(codigo);
  if (!item) {
    throw new NotFoundError("Observável não encontrado.");
  }

  const repoExecucao = deps.collectionExecutionRepository || collectionExecutionRepository;

  const { cotacao, mensagem, destaque } = await obterCotacaoAtualDoItem(item, deps);
  const dimensoes = ehObservation(item) ? await observationDataService.obterDimensoes(item, deps) : null;
  const estatisticas = ehObservation(item)
    ? await observationDataService.obterEstatisticas(item, deps)
    : await (deps.marketQuoteRepository || marketQuoteRepository).buscarEstatisticas(item.instrumentCode);
  const ultimaExecucao = await repoExecucao.buscarUltimaPorColetor(item.fonteCollectorCode);

  return {
    observavel: {
      codigo: item.instrumentCode,
      nome: item.nome,
      unidade: item.unidade,
      casasDecimais: item.casasDecimais ?? 4,
      frequencia: item.frequencia,
      situacao: calcularSituacao(cotacao?.dataReferencia, item.toleranciaDias),
      cotacaoAtual: cotacao,
      mensagem: cotacao ? null : mensagem,
      cobertura: { primeiraData: estatisticas.primeiraData, ultimaData: estatisticas.ultimaData },
      totalObservacoes: estatisticas.totalObservacoes,
      // Só observáveis point-in-time: quanto das datas de publicação é estimado.
      publicacao: estatisticas.publicacao ?? null,
      // Só cards por vencimento/região: seletores de campo e de item da tela.
      ...(dimensoes ? { ...dimensoes, itemPrincipal: destaque ?? null } : {}),
      fonteDetalhe: item.fonteDetalhe ?? null,
      ultimaColeta: ultimaExecucao
        ? {
            status: ultimaExecucao.status,
            iniciadoEm: ultimaExecucao.started_at,
            finalizadoEm: ultimaExecucao.finished_at
          }
        : null
    }
  };
}

// Histórico pela origem certa: `observation` (point-in-time) ou `market_quote`.
// Código fora do catálogo segue o caminho antigo (devolve vazio), como antes.
async function obterHistoricoObservavel(codigo, filtros, deps = {}) {
  const item = buscarNoCatalogo(codigo);
  if (item && ehObservation(item)) {
    return observationDataService.obterHistorico(item, filtros, deps);
  }
  return marketDataService.obterHistorico(codigo, filtros, deps);
}

module.exports = { listarObservaveis, obterDetalheObservavel, obterHistoricoObservavel, buscarNoCatalogo };
