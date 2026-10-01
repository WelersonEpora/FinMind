"use strict";

const marketDataService = require("./market-data.service");
const observationDataService = require("./observation-data.service");
const marketQuoteRepository = require("../repositories/market-quote.repository");
const collectionExecutionRepository = require("../repositories/collection-execution.repository");
const { NotFoundError } = require("../shared/errors");
const { ITENS_CUSTO } = require("../collectors/imea/imea-custo-itens");

// Destinos marcados de início no card de exportação de milho por destino (ADR 0034): os 5 maiores de 2025 em volume
// (Irã, Egito, Vietnã, Arábia Saudita e China, nesta ordem, no banco de dev em 2026-10-01).
const ITENS_PADRAO_MILHO_DESTINO = ["372", "240", "858", "053", "160"];

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

// Fonte do card de safra do IMEA (milho de Mato Grosso, ADR 0018).
const FONTE_IMEA = "IMEA - Instituto Mato-Grossense de Economia Agropecuária";

// Partes comuns dos 2 cards de custo de produção do milho (planilhas XLSX do IMEA, uma linha por item, em R$/ha).
// Séries `IMEA.CUSTO.MILHO.<PERIODO>.<ITEM_REGIAO>.<ITEM>` (ver o parser). Um card por período (mês x safra
// consolidada), porque as duas frequências não cabem no mesmo seletor/gráfico. Dentro do card mensal, o Mensal e o
// Ponderado da fonte (que trazem o MESMO mês com valores diferentes, sem explicação) convivem como itens distintos
// do mesmo seletor - não são cards separados: aplicado o mesmo critério do WASDE (só separar em cards por
// incompatibilidade real - lá, unidade; aqui, frequência -, nunca por "vieram de arquivos diferentes").
const CAMPOS_CUSTO_IMEA = ITENS_CUSTO.map(({ codigo, nome, unidade }) => ({ codigo, nome, unidade, casasDecimais: unidade === "R$/US$" ? 4 : 2 }));

const BASE_CUSTO_IMEA = {
  origem: "observation",
  unidade: "R$/ha",
  casasDecimais: 2,
  fonte: "IMEA - Custo de produção do milho",
  fonteCollectorCode: "imea-custo-milho",
  campoPrincipal: "CT",
  campos: CAMPOS_CUSTO_IMEA
};

// Item `<TIPO>_<TECNOLOGIA>_<LOCAL>` (Mensal e Ponderado lado a lado no mesmo seletor).
const PORREGIAO_CUSTO_MES = {
  prefixoSerie: "IMEA.CUSTO.MILHO.MES",
  campoReferencia: "CT",
  itemPrincipal: "PONDERADO_ALTA_MATO_GROSSO",
  itensPadrao: ["PONDERADO_ALTA_MATO_GROSSO", "MENSAL_ALTA_MATO_GROSSO", "PONDERADO_MEDIA_MATO_GROSSO", "MENSAL_MEDIA_MATO_GROSSO"],
  descritor: "imea-custo"
};

// Item `<TECNOLOGIA>_<LOCAL>` (só existe no Ponderado; sem ambiguidade de tipo, sem precisar dele no item).
const PORREGIAO_CUSTO_SAFRA = {
  prefixoSerie: "IMEA.CUSTO.MILHO.SAFRA",
  campoReferencia: "CT",
  itemPrincipal: "ALTA_MATO_GROSSO",
  itensPadrao: ["ALTA_MATO_GROSSO", "MEDIA_MATO_GROSSO"],
  descritor: "imea-custo"
};

const FONTE_DETALHE_CUSTO_IMEA = {
  formatoOrigem: "XLSX (4 planilhas do catálogo de arquivos do site do IMEA: Mensal e Ponderado, em alta e média tecnologia)",
  urlOficial: "https://www.imea.com.br/imea-site/relatorios-mercado"
};

const ESCOPO_CUSTO_IMEA =
  "só o milho de Mato Grosso, com todas as linhas de custo de cada planilha (R$/ha), a produtividade modal (sc/ha) e o dólar que o IMEA usou, para Mato Grosso e para os municípios que têm aba (o Índice de algumas planilhas lista abas que não existem: Nova Mutum no Mensal de alta tecnologia, Querência e Paranatinga no Mensal de média). O IMEA não explica, no arquivo, a diferença entre \"Mensal\" e \"Ponderado\" (o valor do mesmo mês difere): os dois convivem como itens distintos do mesmo seletor, sem tentar reconciliar. O catálogo do IMEA só guarda a versão atual de cada planilha, então o vintage começa em 15/09/2026, e o valor de um mês anterior dentro do arquivo entra com a data de publicação do arquivo. Na aba de Tangará da Serra do Ponderado de média tecnologia, duas colunas estão rotuladas \"2025/26\" (uma deveria ser 2024/25): as duas ficam de fora, por não haver como saber qual é qual. Custo de outras culturas e o preço do milho do IMEA não fazem parte deste card.";

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
  // --- Focus (BCB): expectativas de mercado de IPCA, Selic e câmbio por ano-calendário (ADR 0022) ---
  // Escopo estrito do FEL 1 (ouro em R$: "Focus impacta Selic, IPCA e BRL"). Séries
  // `BCB_FOCUS.ANUAL.<ANO>.<CAMPO>`: o item é o ano-alvo, o eixo do tempo é a data da pesquisa do boletim.
  {
    instrumentCode: "FOCUS_EXPECTATIVAS",
    origem: "observation",
    nome: "Expectativas de mercado - Focus (BCB)",
    unidade: "%",
    casasDecimais: 2,
    frequencia: "SEMANAL",
    // Boletim com a pesquisa de sexta, publicado na segunda (terça/quarta em feriado): até ~11 dias sem ponto novo.
    toleranciaDias: 12,
    fonte: "BCB - Focus (Relatório de Mercado)",
    fonteCollectorCode: "bcb-focus",
    porAnoReferencia: { prefixoSerie: "BCB_FOCUS.ANUAL", campoReferencia: "IPCA" },
    campoPrincipal: "IPCA",
    campos: [
      { codigo: "IPCA", nome: "IPCA (variação no ano)", unidade: "%", casasDecimais: 2 },
      { codigo: "SELIC", nome: "Selic (fim de ano)", unidade: "% a.a.", casasDecimais: 2 },
      { codigo: "CAMBIO", nome: "Câmbio (fim de ano)", unidade: "R$/US$", casasDecimais: 2 }
    ],
    fonteDetalhe: {
      descricao:
        "Mediana das expectativas do mercado (Focus - Relatório de Mercado do Banco Central) para o IPCA do ano, a Selic de fim de ano e o câmbio (R$/US$) de fim de ano, para o ano corrente e os seguintes. É a opinião dos participantes da pesquisa, não um dado realizado nem uma projeção do FinMind.",
      metodologia:
        "Um ponto por boletim semanal: a pesquisa do último dia útil da semana (normalmente sexta), que é o número do boletim, na base dos últimos 30 dias. O BCB calcula a estatística todo dia útil, mas publica a semana inteira de uma vez, no primeiro dia útil da semana seguinte: a data de disponibilidade é ESTIMADA como o fim desse dia, tirado das próprias datas de pesquisa da fonte (feriado desloca para terça ou quarta). Na semana mais recente, antes de a fonte ter o dia seguinte, vale o momento da coleta. O dia da observação é a data da pesquisa; o ano esperado é o item. Conferido contra o PDF do boletim (2015 e 2026): iguais. Licença: ODbL (Portal de Dados Abertos do BCB).",
      escopo:
        "só IPCA, Selic e câmbio do endpoint anual, mediana, base de 30 dias, desde 2000. Não coletados, por estarem fora do que o relatório FEL 1 pede: PIB e os demais indicadores, expectativas mensais e trimestrais, Selic por reunião do Copom, inflação 12/24 meses, ranking Top 5, média, desvio e base de 5 dias úteis. Os dias de pesquisa entre um boletim e outro também não (nunca foram o valor vigente).",
      formatoOrigem: "JSON (API OData Olinda do BCB, ExpectativasMercadoAnuais)",
      urlOficial: "https://dadosabertos.bcb.gov.br/dataset/expectativas-mercado"
    }
  },
  // --- Reservas internacionais brasileiras (BCB, SGS 13621), a outra metade da linha "Relatório Focus e Reservas" do FEL 1 (ADR 0023) ---
  {
    instrumentCode: "RESERVAS_INTERNACIONAIS_BCB",
    origem: "observation",
    nome: "Reservas internacionais (BCB)",
    unidade: "US$ milhões",
    casasDecimais: 0,
    frequencia: "DIARIA",
    // O valor de D sai no dia útil seguinte: na segunda de manhã, o último ponto ainda é o de quinta (~4 dias).
    toleranciaDias: 5,
    fonte: "BCB - SGS (série 13621)",
    fonteCollectorCode: "bcb-reservas-internacionais",
    series: [{ modalidade: "total", seriesCode: "BCB_SGS.RESERVAS_INTERNACIONAIS" }],
    modalidadePrincipal: "total",
    fonteDetalhe: {
      descricao:
        "Reservas internacionais brasileiras, total, em milhões de dólares: os ativos externos prontamente disponíveis e controlados pelo Banco Central do Brasil (série 13621 do SGS, \"Reservas internacionais - Total - diária\").",
      metodologia:
        "Um valor por dia útil, desde 01/09/1998. A série mensal oficial (\"Total - mensal\", SGS 3546) é o fim de mês desta diária (32 de 32 meses iguais na conferência), por isso não é coletada à parte. A fonte não informa quando publica: o valor de um dia aparece no dia útil seguinte, e a data de disponibilidade é ESTIMADA como o fim desse dia, tirado da própria série (feriado desloca). No ponto mais recente, antes de a série ter o dia seguinte, vale o momento da coleta. Revisões não foram medidas; se ocorrerem, entram como versão nova. Licença: ODbL (Portal de Dados Abertos do BCB).",
      escopo:
        "só o total. Não coletados: o conceito liquidez (SGS 13982, que inclui linhas com recompra e empréstimos em moeda estrangeira), a série mensal (1971 em diante) e a composição das reservas (ouro, moedas, títulos).",
      formatoOrigem: "JSON (API do SGS, api.bcb.gov.br)",
      urlOficial: "https://dadosabertos.bcb.gov.br/dataset/13621-reservas-internacionais---conceito-caixa---total---diaria"
    }
  },
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
    nome: "Índices do dólar (Fed)",
    unidade: "índice",
    casasDecimais: 4,
    frequencia: "DIARIA",
    // Série diária, mas divulgada semanalmente (Fed H.10, segundas): a última
    // observação pode ter até ~9 dias, e na segunda de manhã (antes do lote da
    // semana) chega a ~10,5.
    toleranciaDias: 12,
    fonte: "FRED - Federal Reserve (H.10)",
    fonteCollectorCode: ["fred-dtwexbgs", "fred-dtwexafegs"],
    series: [
      { modalidade: "amplo", seriesCode: "FRED.DTWEXBGS" },
      { modalidade: "economias_avancadas", seriesCode: "FRED.DTWEXAFEGS" }
    ],
    modalidadePrincipal: "amplo",
    fonteDetalhe: {
      descricao:
        "Dois índices do dólar do Fed, base jan/2006 = 100: contra uma cesta ampla de 26 moedas (DTWEXBGS) e contra as economias avançadas (DTWEXAFEGS: euro, iene, libra, dólar canadense, franco suíço, dólar australiano e coroa sueca), mais próximo da cesta do DXY. Nenhum dos dois é o DXY (índice da ICE, licenciado): as moedas da cesta do DXY estão no card \"Câmbio - moedas da cesta do DXY (Fed)\".",
      metodologia:
        "Os valores são diários, mas o Fed os divulga em lote semanal (segundas-feiras). A disponibilidade é ESTIMADA como a segunda-feira seguinte à data observada. Os dois índices são revisados depois da primeira divulgação (ALFRED): a coleta guarda o valor atual, e uma revisão vista depois entra como versão nova. Licença: séries do Board of Governors do Fed (domínio público, citação pedida). Uso atual: pesquisa interna, sem exibir a terceiros (ADRs 0009 e 0033).",
      formatoOrigem: "API REST do FRED (reserva: CSV público)",
      urlOficial: "https://fred.stlouisfed.org/series/DTWEXAFEGS"
    }
  },
  // --- FMI - ouro nas reservas dos bancos centrais, mensal (fator do ouro "Demanda de bancos centrais", ADR 0036) ---
  // Séries `IMF.IRFCL.OURO.<PAIS>.<CAMPO>`, com o código de país do FMI (ISO alfa-3): os países são descobertos no banco;
  // vêm marcados os maiores compradores recentes e o destaque do card é a China.
  {
    instrumentCode: "OURO_BANCOS_CENTRAIS_FMI",
    origem: "observation",
    nome: "Ouro nas reservas dos bancos centrais (FMI)",
    unidade: "mi oz troy",
    casasDecimais: 3,
    frequencia: "MENSAL",
    // Cada país reporta no seu ritmo, até ~2 meses depois do mês: o último ponto fica até ~90 dias sem sucessor.
    toleranciaDias: 95,
    fonte: "FMI - International Reserves and Foreign Currency Liquidity (IRFCL)",
    fonteCollectorCode: "fmi-irfcl-ouro",
    porRegiao: {
      prefixoSerie: "IMF.IRFCL.OURO",
      campoReferencia: "VOLUME_MI_OZT",
      itemPrincipal: "CHN",
      itensPadrao: ["CHN", "POL", "IND", "TUR", "KAZ"],
      descritor: "fmi-pais"
    },
    campoPrincipal: "VOLUME_MI_OZT",
    campos: [
      { codigo: "VOLUME_MI_OZT", nome: "Volume (milhões de onças troy)", unidade: "mi oz troy", casasDecimais: 3 },
      { codigo: "VALOR_MI_USD", nome: "Valor (US$ milhões)", unidade: "mi USD", casasDecimais: 0 }
    ],
    fonteDetalhe: {
      descricao:
        "Ouro nas reservas oficiais de cada banco central, por mês, como reportado ao FMI no IRFCL (o \"Reserves Data Template\"): o volume em milhões de onças troy e o valor em US$ milhões (a escala que o FMI declara em cada série). 88 países e 2 agregados (área do euro e BCE), desde dez/1999. É a base de onde o World Gold Council compila as compras de ouro dos bancos centrais. O FinMind não soma países nem calcula compras.",
      metodologia:
        "Um valor por mês (o dia da observação é o 1º do mês). A fonte não informa quando publicou nem guarda versões: a data de disponibilidade é a da coleta (o histórico só vale para leituras a partir da 1ª coleta), e uma revisão vista depois vira versão nova. Conferência de unidade: o valor em US$ dividido pelo volume tem de ficar perto do preço implícito mediano dos países no mês; fora de 3 vezes para cima ou para baixo, o mês é gravado como publicado e marcado. Em 2026-10-01 isso pegou o volume em unidade errada do Brasil (1.000× maior desde mar/2026), de Angola (1.000× desde out/2020) e do Chile (aparentemente em quilos desde fev/2026), e o valor contábil (não de mercado) dos EUA, Arábia Saudita, Singapura e Coreia do Sul. Licença: uso livre com a citação \"Source: International Monetary Fund, International Reserves and Foreign Currency Liquidity\", sem alterar o dado (ADR 0036).",
      escopo: "só o ouro das reservas, setor das autoridades monetárias. Não coletados: as demais linhas do IRFCL (moedas, DES, posição no FMI) e o ouro fora das reservas.",
      formatoOrigem: "JSON (API SDMX 3.0 do FMI, sem chave)",
      urlOficial: "https://data.imf.org"
    }
  },
  // --- World Gold Council - ouro em ETFs (semanal) e oferta e demanda (trimestral), ADR 0037 (licença: risco aceito) ---
  // Séries `WGC.ETF.<REGIAO>.<CAMPO>`: uma região por item, toneladas ou US$ milhões no seletor de métrica.
  {
    instrumentCode: "OURO_ETFS_WGC",
    origem: "observation",
    nome: "Ouro em ETFs por região (World Gold Council)",
    unidade: "t",
    casasDecimais: 2,
    frequencia: "SEMANAL",
    // Semana encerrada na sexta; o WGC atualiza com alguns dias de atraso: até ~2 semanas sem ponto novo.
    toleranciaDias: 16,
    fonte: "World Gold Council (Goldhub) - uso interno, licença não comercial",
    fonteCollectorCode: "wgc-etf-ouro",
    porRegiao: {
      prefixoSerie: "WGC.ETF",
      campoReferencia: "TONELADAS",
      itemPrincipal: "AMERICA_DO_NORTE",
      itensPadrao: ["AMERICA_DO_NORTE", "EUROPA", "ASIA", "OUTROS"],
      descritor: "wgc-regiao"
    },
    campoPrincipal: "TONELADAS",
    campos: [
      { codigo: "TONELADAS", nome: "Estoque (toneladas)", unidade: "t", casasDecimais: 2 },
      { codigo: "MI_USD", nome: "Patrimônio (US$ milhões)", unidade: "mi USD", casasDecimais: 0 }
    ],
    fonteDetalhe: {
      descricao:
        "Ouro guardado pelos ETFs de ouro físico, por região (América do Norte, Europa, Ásia e outras), semana a semana desde fev/2003: o estoque em toneladas e o patrimônio em US$ milhões, como o World Gold Council compila. É a única fonte gratuita do total mundial dos ETFs; a variação do estoque é o fluxo, que o FinMind não calcula.",
      metodologia:
        "Um valor por semana (sexta-feira). A fonte não informa quando publicou e revisa os números (o endpoint se chama \"revised\"): a data de disponibilidade é a da coleta (o histórico só vale para leituras a partir da 1ª coleta), e uma revisão vista depois vira versão nova. O valor em US$ é publicado em unidades e gravado em milhões (só a escala).",
      escopo: "USO INTERNO, COM RISCO ACEITO (ADR 0037). Os termos do World Gold Council permitem só uso pessoal e não comercial e proíbem redistribuir sem permissão escrita. O FinMind coleta para uso interno, por decisão do usuário em 2026-10-01: antes de qualquer uso comercial ou exibição a terceiros, é preciso pedir permissão ao WGC. A fonte é a API interna dos gráficos do Goldhub, sem documentação nem contrato: pode mudar ou fechar sem aviso.",
      formatoOrigem: "JSON (API interna dos gráficos do Goldhub, sem login e sem documentação)",
      urlOficial: "https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows"
    }
  },
  // Séries `WGC.OFERTA_DEMANDA.<CAMPO>`: uma por linha do balanço, todas em toneladas, uma por vez no seletor.
  {
    instrumentCode: "OURO_OFERTA_DEMANDA_WGC",
    origem: "observation",
    nome: "Ouro - oferta e demanda trimestral (World Gold Council)",
    unidade: "t",
    casasDecimais: 1,
    frequencia: "TRIMESTRAL",
    // O trimestre é datado no 1º dia e sai ~1 mês depois do fim (Gold Demand Trends): do 1º dia de um trimestre até a
    // publicação do seguinte são ~7 meses (2º tri, 01/04, até o 3º, fim de outubro).
    toleranciaDias: 220,
    fonte: "World Gold Council (Goldhub), dados da Metals Focus - uso interno, licença não comercial",
    fonteCollectorCode: "wgc-oferta-demanda-ouro",
    porCampo: { prefixoSerie: "WGC.OFERTA_DEMANDA" },
    campoPrincipal: "BANCOS_CENTRAIS",
    campos: [
      { codigo: "BANCOS_CENTRAIS", nome: "Demanda - bancos centrais", unidade: "t", casasDecimais: 1 },
      { codigo: "ETFS", nome: "Demanda - ETFs (fluxo)", unidade: "t", casasDecimais: 1 },
      { codigo: "BARRAS_E_MOEDAS", nome: "Demanda - barras e moedas", unidade: "t", casasDecimais: 1 },
      { codigo: "BARRAS", nome: "Demanda - barras", unidade: "t", casasDecimais: 1 },
      { codigo: "MOEDAS_OFICIAIS", nome: "Demanda - moedas oficiais", unidade: "t", casasDecimais: 1 },
      { codigo: "MEDALHAS", nome: "Demanda - medalhas", unidade: "t", casasDecimais: 1 },
      { codigo: "INVESTIMENTO", nome: "Demanda - investimento (barras, moedas e ETFs)", unidade: "t", casasDecimais: 1 },
      { codigo: "JOALHERIA_CONSUMO", nome: "Demanda - joalheria (consumo)", unidade: "t", casasDecimais: 1 },
      { codigo: "JOALHERIA_ESTOQUE", nome: "Demanda - joalheria (estoque)", unidade: "t", casasDecimais: 1 },
      { codigo: "JOALHERIA_FABRICACAO", nome: "Demanda - joalheria (fabricação)", unidade: "t", casasDecimais: 1 },
      { codigo: "TECNOLOGIA", nome: "Demanda - tecnologia", unidade: "t", casasDecimais: 1 },
      { codigo: "TECNOLOGIA_ELETRONICA", nome: "Demanda - eletrônica", unidade: "t", casasDecimais: 1 },
      { codigo: "TECNOLOGIA_OUTROS_INDUSTRIAIS", nome: "Demanda - outros usos industriais", unidade: "t", casasDecimais: 1 },
      { codigo: "TECNOLOGIA_ODONTOLOGIA", nome: "Demanda - odontologia", unidade: "t", casasDecimais: 1 },
      { codigo: "PRODUCAO_MINAS", nome: "Oferta - produção das minas", unidade: "t", casasDecimais: 1 },
      { codigo: "RECICLAGEM", nome: "Oferta - reciclagem", unidade: "t", casasDecimais: 1 },
      { codigo: "HEDGE_PRODUTORES", nome: "Oferta - hedge líquido dos produtores", unidade: "t", casasDecimais: 1 }
    ],
    fonteDetalhe: {
      descricao:
        "Balanço trimestral do ouro desde o 1º tri/2010, em toneladas, como o World Gold Council publica no Gold Demand Trends (dados da Metals Focus): a demanda por setor (bancos centrais, ETFs, barras e moedas, joalheria, tecnologia) e a oferta (produção das minas, reciclagem, hedge). A demanda dos bancos centrais inclui a estimativa do WGC para as compras não declaradas, por isso difere da soma dos países do FMI.",
      metodologia:
        "Um valor por trimestre (o dia da observação é o 1º dia do trimestre). A fonte não informa quando publicou e revisa os trimestres nas edições seguintes: a data de disponibilidade é a da coleta (o histórico só vale para leituras a partir da 1ª coleta), e uma revisão vista depois vira versão nova. O preço do ouro que vem junto não é gravado (já coletado da LBMA).",
      escopo: "USO INTERNO, COM RISCO ACEITO (ADR 0037). Os termos do World Gold Council permitem só uso pessoal e não comercial e proíbem redistribuir sem permissão escrita. O FinMind coleta para uso interno, por decisão do usuário em 2026-10-01: antes de qualquer uso comercial ou exibição a terceiros, é preciso pedir permissão ao WGC. A fonte é a API interna dos gráficos do Goldhub, sem documentação nem contrato: pode mudar ou fechar sem aviso.",
      formatoOrigem: "JSON (API interna dos gráficos do Goldhub, sem login e sem documentação)",
      urlOficial: "https://www.gold.org/goldhub/data/gold-supply-and-demand-statistics"
    }
  },
  // --- Ouro, fontes do ADR 0033: as moedas da cesta do DXY, a meta do Fed e o CPI ---
  // Séries `FRED.<ID>` (uma por moeda): cada cotação tem a sua unidade, uma por vez no seletor de métrica.
  {
    instrumentCode: "CAMBIO_DXY_FED",
    origem: "observation",
    nome: "Câmbio - moedas da cesta do DXY (Fed)",
    unidade: "US$/EUR",
    casasDecimais: 4,
    frequencia: "DIARIA",
    // Mesma divulgação semanal do H.10 que os índices do dólar.
    toleranciaDias: 12,
    fonte: "FRED - Federal Reserve (H.10)",
    fonteCollectorCode: ["fred-dexuseu", "fred-dexjpus", "fred-dexusuk", "fred-dexcaus", "fred-dexsdus", "fred-dexszus"],
    porCampo: { prefixoSerie: "FRED" },
    campoPrincipal: "DEXUSEU",
    campos: [
      { codigo: "DEXUSEU", nome: "Euro (US$ por euro)", unidade: "US$/EUR", casasDecimais: 4 },
      { codigo: "DEXJPUS", nome: "Iene (ienes por US$)", unidade: "JPY/US$", casasDecimais: 2 },
      { codigo: "DEXUSUK", nome: "Libra esterlina (US$ por libra)", unidade: "US$/GBP", casasDecimais: 4 },
      { codigo: "DEXCAUS", nome: "Dólar canadense (CAD por US$)", unidade: "CAD/US$", casasDecimais: 4 },
      { codigo: "DEXSDUS", nome: "Coroa sueca (coroas por US$)", unidade: "SEK/US$", casasDecimais: 4 },
      { codigo: "DEXSZUS", nome: "Franco suíço (francos por US$)", unidade: "CHF/US$", casasDecimais: 4 }
    ],
    fonteDetalhe: {
      descricao:
        "As 6 moedas da cesta do DXY, cotadas contra o dólar ao meio-dia de Nova York (Fed H.10), como publicadas: cada uma na convenção do Fed (o euro e a libra em US$ por unidade; as demais em unidades por US$). O DXY é um índice da ICE, licenciado e não coletado; estas são as cotações de que ele é feito. Remontar o índice é um cálculo e não é feito aqui.",
      metodologia:
        "Um valor por dia útil, divulgado em lote semanal (segundas-feiras): a disponibilidade é ESTIMADA como a segunda-feira seguinte à data observada. As cotações praticamente não são revisadas (1 ou 2 datas em 20 anos, no ALFRED). Licença: séries do Board of Governors do Fed, a mesma origem das já lidas (domínio público, citação pedida); a página destas não foi lida. Uso atual: pesquisa interna (ADR 0033).",
      formatoOrigem: "API REST do FRED (reserva: CSV público)",
      urlOficial: "https://www.federalreserve.gov/releases/h10/"
    }
  },
  {
    instrumentCode: "META_FED",
    origem: "observation",
    nome: "Meta de juros do Fed (FOMC)",
    unidade: "% a.a.",
    casasDecimais: 2,
    frequencia: "DIARIA",
    // Valor vigente em cada dia, atualizado pelo FRED na manhã do próprio dia; a coleta da madrugada vê a véspera.
    toleranciaDias: 4,
    fonte: "FRED - Federal Reserve (FOMC)",
    fonteCollectorCode: ["fred-dfedtaru", "fred-dfedtarl", "fred-dfedtar"],
    series: [
      { modalidade: "limite_superior", seriesCode: "FRED.DFEDTARU" },
      { modalidade: "limite_inferior", seriesCode: "FRED.DFEDTARL" },
      { modalidade: "alvo_unico", seriesCode: "FRED.DFEDTAR" }
    ],
    modalidadePrincipal: "limite_superior",
    fonteDetalhe: {
      descricao:
        "Meta da taxa de juros básica dos EUA (fed funds), definida pelo FOMC: a faixa (limites superior e inferior) desde 16/12/2008 e, antes, o alvo único (27/09/1982 a 15/12/2008, série encerrada).",
      metodologia:
        "Um valor por dia: a meta vigente naquele dia. O FOMC divulga a decisão às 14:00 ET do último dia da reunião, e o FRED atualiza a série na manhã de cada dia: a disponibilidade é ESTIMADA no próprio dia observado. A meta não é revisada. O alvo único anterior a 1994 vem de um estudo do Fed de St. Louis (Thornton, 2005), porque o FOMC não anunciava a meta. Licença: dado do Federal Reserve, a mesma origem das séries já lidas (domínio público, citação pedida); a página desta não foi lida. Uso atual: pesquisa interna (ADR 0033).",
      formatoOrigem: "API REST do FRED (reserva: CSV público)",
      urlOficial: "https://fred.stlouisfed.org/series/DFEDTARU"
    }
  },
  // Séries `FRED.<ID>` do CPI, com todas as versões do ALFRED: as três são índices, uma por vez no seletor de métrica.
  {
    instrumentCode: "CPI_EUA",
    origem: "observation",
    nome: "Inflação ao consumidor dos EUA (CPI)",
    unidade: "índice",
    casasDecimais: 3,
    frequencia: "MENSAL",
    // O CPI de um mês sai na 2ª ou 3ª semana do mês seguinte: o último mês fica até ~75 dias sem sucessor.
    toleranciaDias: 75,
    fonte: "BLS - Consumer Price Index (pelo ALFRED)",
    fonteCollectorCode: "fred-cpi",
    porCampo: { prefixoSerie: "FRED" },
    campoPrincipal: "CPIAUCSL",
    campos: [
      { codigo: "CPIAUCSL", nome: "CPI cheio, com ajuste sazonal", unidade: "índice", casasDecimais: 3 },
      { codigo: "CPILFESL", nome: "CPI núcleo (sem alimentos e energia), com ajuste sazonal", unidade: "índice", casasDecimais: 3 },
      { codigo: "CPIAUCNS", nome: "CPI cheio, sem ajuste sazonal", unidade: "índice", casasDecimais: 3 }
    ],
    fonteDetalhe: {
      descricao:
        "Índice de preços ao consumidor dos EUA (CPI-U, todas as áreas urbanas, base 1982-84 = 100), do Bureau of Labor Statistics: o cheio e o núcleo com ajuste sazonal, e o cheio sem ajuste, de onde sai a inflação de 12 meses que o BLS anuncia. Valores do índice como publicados, sem calcular a variação.",
      metodologia:
        "Um valor por mês (o dia da observação é o 1º do mês). O CPI é revisado: o ajuste sazonal é refeito todo ano para os últimos 5 anos, e houve mudanças de arredondamento no histórico. Por isso vem do ALFRED, o arquivo de versões do FRED, com cada versão na data REAL do release do BLS (as 949 datas de versão conferem com o calendário de releases do FRED); o horário não é conhecido (o BLS divulga às 8:30 ET) e vale o fim do dia. Versões desde 1972 (cheio com ajuste), 1996 (núcleo) e 1949 (sem ajuste): os meses anteriores entram com a data da primeira versão guardada, um limite superior. O índice mudou de base em fev/1988: as versões anteriores estão em 1967 = 100. Licença: dado do BLS, governo dos EUA (página não lida). Uso atual: pesquisa interna (ADR 0033).",
      formatoOrigem: "API REST do FRED/ALFRED (com chave; sem reserva)",
      urlOficial: "https://www.bls.gov/cpi/"
    }
  },
  // Um card por contrato (o café, Coffee C da ICE, desde 2026-09-28 - ADR 0028).
  ...[
    { instrumentCode: "COT_OURO", mercado: "Ouro (COMEX)", chave: "gold", prefixo: "GOLD" },
    { instrumentCode: "COT_MILHO", mercado: "Milho (CBOT)", chave: "corn", prefixo: "CORN" },
    { instrumentCode: "COT_CAFE", mercado: "Café arábica (ICE Coffee C)", chave: "coffee", prefixo: "COFFEE" }
  ].map(({ instrumentCode, mercado, chave, prefixo }) => ({
    instrumentCode,
    origem: "observation",
    nome: `CFTC COT - ${mercado}`,
    unidade: "contratos",
    casasDecimais: 0,
    frequencia: "SEMANAL",
    // Posição de terça divulgada na sexta seguinte (15:30 ET) e coletada no sábado: o ponto mais recente fica até
    // 11 dias sem sucessor; em semana de feriado a CFTC divulga na segunda (até ~14 dias).
    toleranciaDias: 15,
    fonte: "CFTC - Commitments of Traders",
    fonteCollectorCode: `cftc-cot-${chave}`,
    series: ["open_interest", "mm_long", "mm_short"].map((modalidade) => ({
      modalidade,
      seriesCode: `CFTC.${prefixo}.${modalidade === "open_interest" ? "OPEN_INTEREST" : modalidade.toUpperCase()}`
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

  // --- Exportação brasileira mensal (Comex Stat / MDIC): milho (ADR 0013) e café verde (ADR 0028) ---
  // Dois cards por produto, um por unidade (kg e US$ não dividem o mesmo eixo). Mensal com divulgação
  // ~1 mês depois: a última observação pode ter ~70 dias antes de "atrasar".
  ...[
    {
      produto: "MILHO",
      mercadoria: "milho em grão",
      ncm: "10059010",
      fonteCollectorCode: "comex-milho-exportacao",
      cobertura: "Cobertura a partir de 2005: antes disso o código NCM muda e o mapeamento não foi feito."
    },
    {
      produto: "CAFE",
      mercadoria: "café verde (não torrado, não descafeinado, em grão)",
      ncm: "09011110",
      fonteCollectorCode: "comex-cafe-exportacao",
      cobertura: "Cobertura a partir de 1997, o primeiro ano do Comex Stat. Café solúvel, torrado e descafeinado (outros NCMs) não entram."
    }
  ].flatMap(({ produto, mercadoria, ncm, fonteCollectorCode, cobertura }) =>
    [
      {
        instrumentCode: `COMEX_${produto}_VOLUME`,
        nome: `${produto === "MILHO" ? "Milho" : "Café"} - Exportação (volume)`,
        unidade: "kg",
        seriesCode: `COMEX.${produto}.EXPORT.KG`,
        descricao: `Volume mensal de ${mercadoria} exportado pelo Brasil (NCM ${ncm}), em quilogramas, conforme o Comex Stat do MDIC.`
      },
      {
        instrumentCode: `COMEX_${produto}_VALOR`,
        nome: `${produto === "MILHO" ? "Milho" : "Café"} - Exportação (valor FOB)`,
        unidade: "US$",
        seriesCode: `COMEX.${produto}.EXPORT.FOB_USD`,
        descricao: `Valor mensal FOB do ${mercadoria} exportado pelo Brasil (NCM ${ncm}), em dólares, conforme o Comex Stat do MDIC.`
      }
    ].map((cartao) => ({ ...cartao, fonteCollectorCode, cobertura }))
  ).map(({ seriesCode, descricao, cobertura, ...cartao }) => ({
    ...cartao,
    origem: "observation",
    casasDecimais: 0,
    frequencia: "MENSAL",
    toleranciaDias: 75,
    fonte: "Comex Stat (MDIC)",
    series: [{ modalidade: "export", seriesCode }],
    modalidadePrincipal: "export",
    fonteDetalhe: {
      descricao,
      metodologia: `Um valor por mês (o dia da observação é o 1º do mês). A fonte não informa quando publicou nem se revisa meses já divulgados: a data de disponibilidade é ESTIMADA em 15 do mês seguinte, e a coleta diária relê o ano corrente e o anterior. ${cobertura} Só exportação.`,
      formatoOrigem: "JSON (API de dados do Comex Stat, sem chave)",
      urlOficial: "https://comexstat.mdic.gov.br"
    }
  })),

  // --- Comex Stat - exportação de milho por país de destino, mensal (ADR 0034) ---
  // Séries `COMEX.MILHO.EXPORT_DESTINO.<CODIGO_PAIS>.<CAMPO>`, com o código de país da tabela do Comex Stat (China = 160):
  // os países são descobertos no banco; vêm marcados os maiores destinos de 2025 e o destaque do card é a China.
  {
    instrumentCode: "EXPORTACAO_MILHO_DESTINO",
    origem: "observation",
    nome: "Exportação de milho por destino (Comex Stat)",
    unidade: "kg",
    casasDecimais: 0,
    frequencia: "MENSAL",
    toleranciaDias: 75,
    fonte: "Comex Stat (MDIC)",
    fonteCollectorCode: "comex-milho-exportacao-destino",
    porRegiao: {
      prefixoSerie: "COMEX.MILHO.EXPORT_DESTINO",
      campoReferencia: "KG",
      itemPrincipal: "160",
      itensPadrao: ITENS_PADRAO_MILHO_DESTINO,
      descritor: "comex-pais"
    },
    campoPrincipal: "KG",
    campos: [
      { codigo: "KG", nome: "Volume", unidade: "kg", casasDecimais: 0 },
      { codigo: "FOB_USD", nome: "Valor FOB", unidade: "USD", casasDecimais: 0 }
    ],
    fonteDetalhe: {
      descricao:
        "Exportação brasileira de milho em grão (NCM 10059010), por país de destino e por mês: volume (kg) e valor FOB (US$), como o Comex Stat publica. É a mesma exportação do card \"Exportação de milho\", aberta por país; a soma dos países é o total (48 de 48 valores conferidos em 2012 e 2025).",
      metodologia:
        "Um valor por mês e país (o dia da observação é o 1º do mês). A fonte não informa quando publicou nem se revisa: a data de disponibilidade é ESTIMADA em 15 do mês seguinte, e a coleta diária relê o ano corrente e o anterior. Um mês sem exportação para um país não tem ponto (não é gravado zero). Desde 2005, como o total (antes disso o NCM muda). Cada país é identificado pelo código da tabela de países do Comex Stat, não pelo nome.",
      escopo: "só exportação de milho em grão, por país de destino. Não coletados: porto, UF de origem e via de transporte.",
      formatoOrigem: "JSON (API de dados do Comex Stat, sem chave)",
      urlOficial: "https://comexstat.mdic.gov.br"
    }
  },

  // --- USDA NASS Grain Stocks - estoques trimestrais de milho dos EUA (ADR 0035) ---
  {
    instrumentCode: "ESTOQUES_MILHO_EUA_TRIMESTRAIS",
    origem: "observation",
    nome: "Estoques trimestrais de milho dos EUA (USDA Grain Stocks)",
    unidade: "mil bushels",
    casasDecimais: 0,
    frequencia: "TRIMESTRAL",
    // Um relatório por trimestre (fim de mar, jun e set; jan para o 1º de dezembro): o último estoque fica até ~4
    // meses e meio sem sucessor (1º de setembro, publicado no fim de setembro, até o de 1º de dezembro, em janeiro).
    toleranciaDias: 140,
    fonte: "USDA NASS - Grain Stocks",
    fonteCollectorCode: "usda-grain-stocks-milho",
    series: [
      { modalidade: "total", seriesCode: "USDA.GRAIN_STOCKS.CORN.TOTAL" },
      { modalidade: "na_fazenda", seriesCode: "USDA.GRAIN_STOCKS.CORN.ON_FARM" },
      { modalidade: "fora_da_fazenda", seriesCode: "USDA.GRAIN_STOCKS.CORN.OFF_FARM" }
    ],
    modalidadePrincipal: "total",
    fonteDetalhe: {
      descricao:
        "Estoques de milho em grão dos EUA em 1º de março, junho, setembro e dezembro, por posição: na fazenda, fora da fazenda (armazéns, elevadores, processadoras) e o total, em mil bushels, como o USDA NASS publica no relatório Grain Stocks. O WASDE só traz o estoque de fim de ano-safra (1º de setembro); os demais trimestres só existem aqui.",
      metodologia:
        "Um valor por trimestre (o dia da observação é a data do estoque). Cada relatório traz os trimestres do ano anterior e do corrente, com o número que o USDA tinha naquele dia: a data de publicação é a REAL do release (listagem do ESMIS, conferida com o CSV), e cada revisão vira uma versão nova (o 1º de setembro de 2025 saiu como 1.531.613 e foi revisado para 1.551.286 em janeiro de 2026). A API do QuickStats não serve para isso: guarda só o valor revisado. Edições com CSV desde 2001-06-29 (antes, só TXT/PDF). Licença: dado do governo dos EUA, não verificado juridicamente.",
      escopo: "só o milho dos EUA, total nacional. Não coletados: os estoques por estado, os outros grãos e a tabela em unidades métricas.",
      formatoOrigem: "CSV dentro do ZIP de cada edição (arquivo de publicações do USDA, ESMIS)",
      urlOficial: "https://esmis.nal.usda.gov/publication/grain-stocks"
    }
  },

  // --- EIA - etanol combustível dos EUA, semanal (fator do milho "Demanda de etanol", ADR 0024) ---
  // Séries `EIA.ETANOL.<CAMPO>`: produção e estoques têm unidades diferentes, uma por vez no seletor de métrica.
  {
    instrumentCode: "ETANOL_EUA_EIA",
    origem: "observation",
    nome: "Etanol EUA - produção e estoques (EIA)",
    unidade: "mil barris/dia",
    casasDecimais: 0,
    frequencia: "SEMANAL",
    // Semana encerrada na sexta, divulgada na quarta seguinte (quinta em semana de feriado): até ~13 dias sem ponto novo.
    toleranciaDias: 13,
    fonte: "EIA - Weekly Petroleum Status Report",
    fonteCollectorCode: "eia-etanol",
    porCampo: { prefixoSerie: "EIA.ETANOL" },
    campoPrincipal: "PRODUCAO",
    campos: [
      { codigo: "PRODUCAO", nome: "Produção", unidade: "mil barris/dia", casasDecimais: 0 },
      { codigo: "ESTOQUES", nome: "Estoques (fim da semana)", unidade: "mil barris", casasDecimais: 0 }
    ],
    fonteDetalhe: {
      descricao:
        "Produção semanal de etanol combustível nas usinas dos EUA (mil barris por dia) e estoques no fim da semana (mil barris), conforme o Weekly Petroleum Status Report da EIA. O etanol americano é feito de milho: é a medida de demanda que o relatório FEL 1 associa ao fator \"Demanda de etanol e biocombustível\".",
      metodologia:
        "Um valor por semana, encerrada na sexta, desde 04/06/2010. A EIA divulga as tabelas depois das 10:30 ET de quarta; em semana de feriado, atrasa (normalmente para quinta). A data de disponibilidade é ESTIMADA: a data alternativa do calendário oficial de feriados da EIA quando ele lista a semana (~2 anos); fora disso, quarta, ou quinta com feriado federal de segunda a quarta; sempre o fim do dia. A regra bate com 13 das 14 exceções do calendário oficial; a que não bate (Natal de 2025, divulgado 10 dias depois) vem do próprio calendário, mas no histórico antigo semanas de fim de ano podem ter data antecipada. A planilha traz só o valor atual: se a EIA revisar uma semana, a revisão entra como versão nova. Licença: dado do governo dos EUA (domínio público).",
      escopo:
        "só produção e estoques de etanol combustível dos EUA, semanais. Não coletados: consumo, importação e exportação de etanol, os dados mensais da EIA e o milho usado para etanol (este está no WASDE do USDA, não extraído).",
      formatoOrigem: "XLS (planilha histórica de cada série no site da EIA, sem chave; a API v2 exige chave)",
      urlOficial: "https://www.eia.gov/dnav/pet/pet_pnp_wprode_s1_w.htm"
    }
  },

  // --- NOAA STAR - saúde da vegetação sobre a área do milho, semanal (fator do milho "Clima e safra", ADR 0025) ---
  // Séries `NOAA_VH.MILHO.<REGIAO>.<INDICE>`: um item por país ou estado, o índice (VHI, VCI, TCI) no seletor de métrica.
  {
    instrumentCode: "NOAA_VH_MILHO",
    origem: "observation",
    nome: "Clima sobre o milho - saúde da vegetação (NOAA)",
    unidade: "índice 0-100",
    casasDecimais: 2,
    frequencia: "SEMANAL",
    // Semana divulgada no dia seguinte ao fim: até ~9 dias sem ponto novo.
    toleranciaDias: 9,
    fonte: "NOAA STAR - Vegetation Health por cultura",
    fonteCollectorCode: "noaa-vh-milho",
    porRegiao: {
      prefixoSerie: "NOAA_VH.MILHO",
      campoReferencia: "VHI",
      itemPrincipal: "BRASIL",
      itensPadrao: ["BRASIL", "EUA", "MUNDO"],
      descritor: "noaa-vh"
    },
    campoPrincipal: "VHI",
    campos: [
      { codigo: "VHI", nome: "VHI - saúde da vegetação", unidade: "índice 0-100", casasDecimais: 2 },
      { codigo: "VCI", nome: "VCI - condição da vegetação (umidade)", unidade: "índice 0-100", casasDecimais: 2 },
      { codigo: "TCI", nome: "TCI - condição térmica (calor)", unidade: "índice 0-100", casasDecimais: 2 }
    ],
    fonteDetalhe: {
      descricao:
        "Efeito do clima sobre a lavoura de milho, medido por satélite só onde há milho plantado: o VHI (saúde da vegetação, 0 a 100) é a média do VCI (verdor, ligado à umidade) e do TCI (temperatura, ligado ao calor). Abaixo de 40 a NOAA classifica como estresse. É um indicador pronto da fonte, não o tempo (chuva, temperatura) nem um cálculo do FinMind.",
      metodologia:
        "Um valor por semana e região, desde 1982. A semana N vai do dia do ano 7(N-1)+1 ao 7N (guia da NOAA); a data da observação é o último dia da semana. A NOAA disponibiliza a semana no dia seguinte ao fim (regra da própria página): a data de disponibilidade é ESTIMADA como o fim desse dia. Semanas sem dado de satélite (1984-85, 1994-95, 2003-05) ficam em branco. A NOAA reprocessa a série e suaviza os valores recentes: a coleta diária relê o ano corrente e o anterior, e uma mudança vira versão nova. O histórico é a versão reprocessada de hoje (o que se sabia em cada data só existe daqui para frente). A máscara de cultura é fixa (MapSPAM 2010) e não separa a safrinha da 1ª safra: a estação se vê pela semana do ano. Conferido contra secas conhecidas: EUA em 2012 (VHI 33-39 no verão; 64 em 2014) e Mato Grosso em 2021 (VHI 30-39 na safrinha). Licença: dado do governo dos EUA (domínio público).",
      escopo:
        "só milho, só os três índices (VHI, VCI, TCI), no mundo (55°S a 65°N) e nos hemisférios Norte (0 a 65°N) e Sul (40°S a 0), que são médias ponderadas pela área do milho e diluem choques regionais (na seca de 2012 os EUA foram a 33-35 e o mundo, a ~44), em EUA, Brasil, Argentina, China e Ucrânia, nas 5 maiores UFs de milho (MT, PR, GO, MS, MG) e nos 5 maiores estados de milho dos EUA (Iowa, Illinois, Nebraska, Minnesota, Indiana). A fonte cobre 161 países e outras culturas (soja, trigo...), não coletados; o café tem card próprio. Não coletados: o NDVI e a temperatura suavizados (insumos dos índices), a distribuição por faixa de VHI e a versão experimental WF2025. Nenhum fator: como o índice entra no preço é definição do Comitê.",
      formatoOrigem: "Texto (tabela da página \"VH Time Series by administrative regions for specific crop\" da NOAA STAR, sem chave; endpoint não documentado como API)",
      urlOficial: "https://www.star.nesdis.noaa.gov/smcd/emb/vci/VH/vh_adminMeanByCrop.php?type=Province_Weekly_MeanPlot"
    }
  },

  // --- NOAA STAR - saúde da vegetação sobre a área do café, semanal (fator do café "Clima e eventos meteorológicos", ADR 0030) ---
  // Séries `NOAA_VH.CAFE.<REGIAO>.<INDICE>`. No Brasil a máscara de arábica e a de robusta cobrem os mesmos pixels: uma
  // série só, "café"; no mundo e nos hemisférios, arábica e robusta são itens separados.
  {
    instrumentCode: "NOAA_VH_CAFE",
    origem: "observation",
    nome: "Clima sobre o café - saúde da vegetação (NOAA)",
    unidade: "índice 0-100",
    casasDecimais: 2,
    frequencia: "SEMANAL",
    toleranciaDias: 9,
    fonte: "NOAA STAR - Vegetation Health por cultura",
    fonteCollectorCode: "noaa-vh-cafe",
    porRegiao: {
      prefixoSerie: "NOAA_VH.CAFE",
      campoReferencia: "VHI",
      itemPrincipal: "BRASIL",
      itensPadrao: ["BRASIL", "BR_MG", "BR_ES", "VIETNA_ROBUSTA", "MUNDO_ARABICA", "MUNDO_ROBUSTA"],
      descritor: "noaa-vh"
    },
    campoPrincipal: "VHI",
    campos: [
      { codigo: "VHI", nome: "VHI - saúde da vegetação", unidade: "índice 0-100", casasDecimais: 2 },
      { codigo: "VCI", nome: "VCI - condição da vegetação (umidade)", unidade: "índice 0-100", casasDecimais: 2 },
      { codigo: "TCI", nome: "TCI - condição térmica (calor)", unidade: "índice 0-100", casasDecimais: 2 }
    ],
    fonteDetalhe: {
      descricao:
        "Efeito do clima sobre o cafezal, medido por satélite só onde há café plantado: o VHI (saúde da vegetação, 0 a 100) é a média do VCI (verdor, ligado à umidade) e do TCI (temperatura, ligado ao calor). Abaixo de 40 a NOAA classifica como estresse. É um indicador pronto da fonte, não o tempo (chuva, temperatura) nem um cálculo do FinMind.",
      metodologia:
        "Um valor por semana e região, desde 1982, com as mesmas regras do card do milho: semana N = dias do ano 7(N-1)+1 a 7N, data de disponibilidade ESTIMADA no dia seguinte ao fim da semana, releitura do ano corrente e do anterior, histórico reprocessado (o que se sabia em cada data só existe daqui para frente). A NOAA tem duas máscaras de café (MapSPAM 2010), arábica e robusta, mas no Brasil elas cobrem os mesmos pixels (1982-2026: diferença máxima de 0,7 ponto no Brasil e nas UFs): por isso o Brasil e as UFs têm uma série só, \"café\" (arábica e conilon juntos), e o mundo e os hemisférios, onde as duas diferem (até 10 pontos, porque o robusta é o do Vietnã e da Indonésia), têm arábica e robusta separados. Nos outros países produtores vale a máscara do tipo que domina a produção na PSD do USDA (robusta no Vietnã, na Indonésia e em Uganda; arábica na Colômbia, na Etiópia e em Honduras); na Índia as duas cobrem os mesmos pixels e a série é \"café\". O índice mostra o dano de uma geada semanas depois: não é alerta de geada. Licença: dado do governo dos EUA (domínio público).",
      escopo:
        "só café, só os três índices (VHI, VCI, TCI), no Brasil e nas 5 maiores UFs produtoras segundo a Conab (MG, SP e ES no arábica; ES, BA e RO no conilon), nos 7 maiores produtores depois do Brasil pela PSD do USDA (safra 2025, acima de 5 milhões de sacas: Vietnã, Colômbia, Indonésia, Etiópia, Uganda, Índia e Honduras, um tipo por país), e no mundo (55°S a 65°N) e nos hemisférios Norte e Sul, separados em arábica e robusta. Nenhum fator: como o índice entra no preço é definição do Comitê.",
      formatoOrigem: "Texto (tabela da página \"VH Time Series by administrative regions for specific crop\" da NOAA STAR, sem chave; endpoint não documentado como API)",
      urlOficial: "https://www.star.nesdis.noaa.gov/smcd/emb/vci/VH/vh_adminMeanByCrop.php?type=Province_Weekly_MeanPlot"
    }
  },

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
      { codigo: "ETHANOL_BYPRODUCTS", nome: "Etanol e coprodutos (desde abr/2011)", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "ETHANOL_FUEL", nome: "Etanol combustível (jan a mar/2011)", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "DOMESTIC_TOTAL", nome: "Consumo interno total", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "EXPORTS", nome: "Exportações", unidade: "milhões de bushels", casasDecimais: 0 },
      { codigo: "USE_TOTAL", nome: "Uso total", unidade: "milhões de bushels", casasDecimais: 0 }
    ],
    fonteDetalhe: {
      ...FONTE_DETALHE_WASDE_MILHO,
      escopo: `só os Estados Unidos, com as 13 métricas que o WASDE traz para o país e o milho usado para etanol (a parcela do uso industrial; o rótulo mudou em abr/2011, e as duas versões são séries separadas, ADR 0035). Os demais países estão no card "Milho por país", em toneladas. ${FIM_ESCOPO_WASDE_MILHO}`,
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

  // --- USDA NASS - área plantada de milho dos EUA: Prospective Plantings (março) e Acreage (junho), ADR 0027 ---
  // Uma série, um ponto por ano de plantio (observed_at = 1º/set, a convenção do WASDE). Cada edição reestima o ano
  // corrente e até dois anteriores: o histórico mostra a versão mais recente e o vintage fica na camada
  // point-in-time. `toleranciaDias`: o último ponto (1º/set do ano) só é sucedido pelo Prospective Plantings de
  // março seguinte, ~7 meses depois.
  {
    instrumentCode: "USDA_MILHO_AREA_PLANTADA",
    origem: "observation",
    nome: "Milho EUA - Área plantada (USDA)",
    unidade: "mil acres",
    casasDecimais: 0,
    frequencia: "ANUAL",
    toleranciaDias: 240,
    fonte: "USDA NASS - Prospective Plantings e Acreage",
    fonteCollectorCode: "usda-area-plantada-milho",
    series: [{ modalidade: "area_plantada", seriesCode: "USDA.CORN.AREA_PLANTED" }],
    modalidadePrincipal: "area_plantada",
    fonteDetalhe: {
      descricao:
        "Área plantada de milho dos Estados Unidos (todas as finalidades), em mil acres, conforme dois relatórios do USDA NASS: o Prospective Plantings (fim de março), que traz a INTENÇÃO de plantio declarada pelos produtores, e o Acreage (fim de junho), que traz a área já plantada. O WASDE só incorpora esses números semanas depois (a intenção de março só aparece no WASDE de maio).",
      metodologia:
        "Um valor por ano de plantio (o dia da observação é 1º de setembro do ano, a mesma convenção do WASDE). Cada edição traz o ano corrente e até dois anos anteriores com o valor que o USDA tinha naquele dia, e cada um vira uma versão: a data de publicação é a REAL do release (listagem do ESMIS, conferida com a data impressa no próprio CSV), às 23:59 UTC por não trazer o horário. Valores como publicados, sem conversão de unidade. O detalhe de cada ponto informa o relatório de origem e se é intenção de plantio ou área plantada.",
      escopo:
        "só a área plantada de milho, só o total dos EUA, só os dois relatórios (edições de 2001-06 em diante, as que têm CSV; antes só há TXT/PDF). As reestimativas de agosto a janeiro (Crop Production) não estão aqui: saem no mesmo dia do WASDE e estão no card \"Milho EUA (WASDE)\". Não coletados: a quebra por estado, a área colhida (no Acreage), as outras culturas e o Grain Stocks (estoques trimestrais), este reconhecido e aguardando o Comitê.",
      formatoOrigem: "CSV dentro do ZIP de cada edição no ESMIS (arquivo de publicações do USDA, página HTML, sem chave)",
      urlOficial: "https://esmis.nal.usda.gov/publication/prospective-plantings"
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

  // --- Conab - café por safra, região e UF (Boletim da Safra de Café, ADR 0029) ---
  {
    instrumentCode: "CONAB_CAFE",
    nome: "Café - safra por região e UF (Conab)",
    unidade: "mil sacas",
    casasDecimais: 1,
    origem: "observation",
    frequencia: "ANUAL",
    // O último levantamento de uma safra sai até janeiro do ano seguinte e o 1º da próxima, entre janeiro e fevereiro.
    toleranciaDias: 430,
    fonte: "Conab - Boletim da Safra de Café",
    fonteCollectorCode: "conab-cafe",
    // Séries `CONAB.CAFE.<REGIAO>.<METRICA>_<TIPO>`: as regiões (e as sub-regiões da Bahia e de Minas) são descobertas
    // no banco; vêm marcados o Brasil e as maiores UFs produtoras, e o destaque do card é o Brasil.
    porRegiao: {
      prefixoSerie: "CONAB.CAFE",
      campoReferencia: "PRODUCAO_TOTAL",
      itemPrincipal: "BRASIL",
      itensPadrao: ["BRASIL", "MG", "ES", "SP", "BA", "RO"],
      descritor: "conab"
    },
    campoPrincipal: "PRODUCAO_TOTAL",
    campos: [
      { codigo: "PRODUCAO_TOTAL", nome: "Produção - total (arábica e conilon)", unidade: "mil sacas", casasDecimais: 1 },
      { codigo: "PRODUCAO_ARABICA", nome: "Produção - arábica", unidade: "mil sacas", casasDecimais: 1 },
      { codigo: "PRODUCAO_CONILON", nome: "Produção - conilon", unidade: "mil sacas", casasDecimais: 1 },
      { codigo: "AREA_TOTAL", nome: "Área em produção - total", unidade: "ha", casasDecimais: 0 },
      { codigo: "AREA_ARABICA", nome: "Área em produção - arábica", unidade: "ha", casasDecimais: 0 },
      { codigo: "AREA_CONILON", nome: "Área em produção - conilon", unidade: "ha", casasDecimais: 0 },
      { codigo: "PRODUTIVIDADE_TOTAL", nome: "Produtividade - total", unidade: "sc/ha", casasDecimais: 1 },
      { codigo: "PRODUTIVIDADE_ARABICA", nome: "Produtividade - arábica", unidade: "sc/ha", casasDecimais: 1 },
      { codigo: "PRODUTIVIDADE_CONILON", nome: "Produtividade - conilon", unidade: "sc/ha", casasDecimais: 1 }
    ],
    fonteDetalhe: {
      descricao:
        "Café por safra (total, arábica e conilon) e por região, UF e sub-região (Bahia e Minas Gerais), conforme o Boletim da Safra de Café da Conab: área em produção, produtividade e produção, em mil sacas de 60 kg beneficiadas. Cada levantamento (cerca de 4 por safra) revisa a estimativa; uma linha por região.",
      metodologia:
        "Um valor por safra: a safra do café é o ano da colheita, e o dia da observação é 1º de janeiro desse ano (convenção). A data de publicação é a REAL, da página de cada levantamento, conferida com o mês da nota \"Estimativa em\" da própria planilha; no 1º levantamento de 2024 a página foi republicada em jan/2025, e a data ali é ESTIMADA como o fim do mês da nota (jan/2024). Cada revisão vira uma versão nova. Valores como publicados; a única conversão é a área da planilha de jan/2023, publicada em mil ha e gravada em ha (×1.000), como as demais.",
      escopo:
        "vintage desde jan/2023 (15 levantamentos: antes disso a Conab não mantém a página do levantamento). A série histórica da Conab (safras de 2001 em diante, sem as revisões), área em formação, parque cafeeiro e percentual colhido por mês não foram carregados.",
      formatoOrigem: "XLS (planilha de cada levantamento do Boletim da Safra de Café)",
      urlOficial: "https://www.gov.br/conab/pt-br/atuacao/informacoes-agropecuarias/safras/safra-de-cafe"
    }
  },

  // --- ICE Futures U.S. - estoques certificados do café "C", diário desde 2016-01-04 (ADR 0032) ---
  {
    instrumentCode: "ICE_CAFE_ESTOQUES",
    nome: "Café - estoques certificados da ICE",
    unidade: "sacas",
    casasDecimais: 0,
    origem: "observation",
    frequencia: "DIARIA",
    // Sem arquivo no fim de semana e nos feriados dos EUA.
    toleranciaDias: 5,
    fonte: "ICE Futures U.S. - Coffee \"C\" Certified Warehouse Stock Report",
    fonteCollectorCode: "ice-cafe-estoques",
    // Séries `ICE.CAFE_C.ESTOQUE.<ORIGEM>.CERTIFICADO`: as origens são descobertas no banco; o destaque é o total.
    porRegiao: {
      prefixoSerie: "ICE.CAFE_C.ESTOQUE",
      campoReferencia: "CERTIFICADO",
      itemPrincipal: "TOTAL",
      itensPadrao: ["TOTAL"],
      descritor: "ice-origem"
    },
    campoPrincipal: "CERTIFICADO",
    campos: [{ codigo: "CERTIFICADO", nome: "Sacas certificadas", unidade: "sacas", casasDecimais: 0 }],
    fonteDetalhe: {
      descricao:
        "Estoque de café arábica certificado (aprovado na classificação e apto a ser entregue contra o contrato futuro Coffee \"C\" da ICE), em sacas, por país de origem e no total, conforme o relatório diário da ICE Futures U.S. É o \"estoque certificado ICE\" do fator de estoques do café.",
      metodologia:
        "Um valor por pregão e origem, somando todos os portos de entrega. A data de publicação é a REAL, o horário em que o arquivo do dia foi publicado no site da ICE (cabeçalho Last-Modified; o relatório traz o horário de Nova York em que foi gerado, alguns minutos antes); sem ela, vale esse horário, estimado. A série não revisa: é a foto do dia. Valores como publicados; o FinMind confere que a soma das origens fecha com o total do relatório e descarta o arquivo que não fechar.",
      escopo:
        "só o bloco de sacas certificadas (por origem e total), desde 2016-01-04, o arquivo mais antigo no site. Não coletados: a quebra por porto (as colunas mudam com os anos), as sacas de transição (sujeitas a desconto a partir de 2027), a classificação do dia, as pendentes de classificação e as marcadas para reensaque. Licença: os termos de uso da ICE limitam o site a uso pessoal e não comercial e excluem a coleta por robôs; a coleta foi decidida pelo usuário, com esse risco registrado (ADR 0032): uso interno, sem redistribuição.",
      formatoOrigem: "XLS por pregão (arquivo público no site da ICE, sem chave; sem documentação)",
      urlOficial: "https://www.ice.com/report/41"
    }
  },

  // --- USDA FAS PSD - balanço do café verde por país (CSV público, ADR 0031) ---
  {
    instrumentCode: "USDA_PSD_CAFE",
    nome: "Café - balanço por país (USDA PSD)",
    unidade: "mil sacas",
    casasDecimais: 0,
    origem: "observation",
    frequencia: "ANUAL",
    // O relatório é semestral (junho e dezembro) e a safra mais nova só é aberta em junho: até ~18 meses sem safra nova.
    toleranciaDias: 560,
    fonte: "USDA FAS - PSD Online",
    fonteCollectorCode: "usda-psd-cafe",
    // Séries `USDA.PSD.CAFE.<PAIS>.<CAMPO>`, com o código de país da própria PSD (BR, VM, CO...): os países são
    // descobertos no banco; vêm marcados os maiores produtores da safra 2025 e o destaque do card é o Brasil.
    porRegiao: {
      prefixoSerie: "USDA.PSD.CAFE",
      campoReferencia: "PRODUCAO",
      itemPrincipal: "BR",
      itensPadrao: ["BR", "VM", "CO", "ID", "ET"],
      descritor: "psd"
    },
    campoPrincipal: "PRODUCAO",
    campos: [
      { codigo: "PRODUCAO", nome: "Produção", unidade: "mil sacas", casasDecimais: 0 },
      { codigo: "PRODUCAO_ARABICA", nome: "Produção - arábica", unidade: "mil sacas", casasDecimais: 0 },
      { codigo: "PRODUCAO_ROBUSTA", nome: "Produção - robusta", unidade: "mil sacas", casasDecimais: 0 },
      { codigo: "ESTOQUE_FINAL", nome: "Estoque final", unidade: "mil sacas", casasDecimais: 0 },
      { codigo: "CONSUMO", nome: "Consumo interno", unidade: "mil sacas", casasDecimais: 0 },
      { codigo: "EXPORTACAO", nome: "Exportação", unidade: "mil sacas", casasDecimais: 0 },
      { codigo: "IMPORTACAO", nome: "Importação", unidade: "mil sacas", casasDecimais: 0 }
    ],
    fonteDetalhe: {
      descricao:
        "Balanço do café verde por país e por safra, conforme a PSD (Production, Supply and Distribution) do USDA FAS: produção (total, arábica e robusta), estoque final, consumo interno, exportação e importação, em mil sacas de 60 kg (estimativa do USDA, não da Conab). As exportações e importações incluem torrado e solúvel convertidos em equivalente de café verde, como a PSD publica. Uma linha por país.",
      metodologia:
        "Um valor por safra (o dia da observação é 1º de janeiro do ano que dá nome à safra; convenção, como na Conab: a safra do café varia por país). O arquivo traz só o valor ATUAL de cada safra, com o mês da última revisão: a data de publicação é o fim desse mês, ESTIMADA (o relatório semestral sai entre os dias 18 e 25 de junho e dezembro). As safras antigas (todas até 1998 e parte de 1999 a 2003) não trazem o mês de revisão e ficam com a data da primeira coleta. Não há histórico de revisões a carregar: o vintage começa agora, e cada revisão vista numa coleta posterior vira uma versão nova. Valores como publicados, sem conversão.",
      escopo:
        "os 94 países (e a União Europeia) do arquivo de café verde da PSD, safras de 1960 em diante, 7 dos 19 atributos. Não coletados: estoque inicial, oferta e distribuição totais (identidades do balanço), a quebra do consumo e do comércio por tipo (grão, torrado, solúvel) e a outra produção. A PSD do café não traz o total mundial: a soma dos países não é feita pelo FinMind.",
      formatoOrigem: "CSV dentro de um ZIP (arquivo de download público da PSD Online, sem chave)",
      urlOficial: "https://apps.fas.usda.gov/psdonline/app/index.html#/app/downloads"
    }
  },

  // --- IMEA - milho de Mato Grosso (ADR 0018): área, produção e produtividade por safra, e custo de produção ---
  {
    instrumentCode: "IMEA_MILHO_SAFRA",
    nome: "Milho de MT por safra e região (IMEA)",
    unidade: "t",
    casasDecimais: 0,
    origem: "observation",
    frequencia: "ANUAL",
    toleranciaDias: 430,
    fonte: FONTE_IMEA,
    fonteCollectorCode: "imea-milho-safra",
    // Séries `IMEA.MILHO.<REGIAO>.<METRICA>`: as regiões são descobertas no banco; vem marcado só Mato Grosso (o estado).
    porRegiao: {
      prefixoSerie: "IMEA.MILHO",
      campoReferencia: "PRODUCAO",
      itemPrincipal: "MATO_GROSSO",
      itensPadrao: ["MATO_GROSSO"],
      descritor: "imea"
    },
    campoPrincipal: "PRODUCAO",
    campos: [
      { codigo: "PRODUCAO", nome: "Produção", unidade: "t", casasDecimais: 0 },
      { codigo: "AREA", nome: "Área", unidade: "ha", casasDecimais: 0 },
      { codigo: "PRODUTIVIDADE", nome: "Produtividade", unidade: "sc/ha", casasDecimais: 2 }
    ],
    fonteDetalhe: {
      metodologia:
        "Um valor por safra (o dia da observação é 1º de setembro do ano de início; convenção, como no WASDE e na Conab). A API do IMEA devolve só a ÚLTIMA versão de cada safra, com a data da última atualização daquele valor: essa é a data de publicação (só a data; vale o fim do dia, para não antecipar o que se sabia), e cada revisão que a API passar a mostrar vira uma versão nova. Não há histórico de revisões a carregar: o vintage começa agora. A data de uma safra antiga é a da última atualização, não a da primeira publicação. Valores como publicados, sem conversão de unidade (ha, t, sc/ha). A produtividade é a que o IMEA publica, não a produção dividida pela área.",
      formatoOrigem: "JSON (API pública e não documentada do site do IMEA, descoberta pelo JavaScript do próprio site)",
      urlOficial: "https://www.imea.com.br/imea-site/indicador-milho",
      escopo:
        "só milho, só Mato Grosso e as 7 regiões do IMEA, com área, produção e produtividade das safras 2022/23 em diante. A resposta da API traz outros indicadores da cadeia (preço, custo por item, andamento de semeadura e colheita), mas sem nome: só estes 3 foram identificados com certeza, casando os valores com o relatório de Oferta e Demanda de 31/08/2026. Os demais não são coletados. A primeira estimativa da safra 2026/27 apareceu na API em 23/09/2026 e entrou pela coleta diária, como previsto. O balanço de oferta e demanda (estoques, consumo, exportação), a intenção de plantio e as versões antigas de cada estimativa estão só nos PDFs mensais do IMEA e não foram implementados.",
      descricao:
        "Área, produção e produtividade do milho de Mato Grosso por safra, para o estado e para as 7 regiões do IMEA, conforme os indicadores do IMEA (estimativa do IMEA, não da Conab). Uma linha por região."
    }
  },
  {
    ...BASE_CUSTO_IMEA,
    instrumentCode: "IMEA_CUSTO_MILHO_MES",
    nome: "Custo do milho - por mês (IMEA)",
    frequencia: "MENSAL",
    // Publicado ~1 vez por mês (15/09/2026); o último ponto é o mês da estimativa (ago/2026, publicado em set).
    toleranciaDias: 75,
    porRegiao: PORREGIAO_CUSTO_MES,
    fonteDetalhe: {
      ...FONTE_DETALHE_CUSTO_IMEA,
      metodologia:
        "Uma coluna por mês da safra corrente, das planilhas \"Mensal\" e \"Ponderado\" (jun/jul/ago-2026 na de 15/09/2026; o mês com asterisco é estimativa e vira o metadado `estimativa`). O dia da observação é o 1º do mês. Os dois arquivos trazem o MESMO mês com valores diferentes (o IMEA não explica a diferença): cada um vira um item do seletor (\"Mato Grosso - alta tecnologia (mensal)\" vs \"(ponderado)\"), sem tentar reconciliar. A data de publicação é a do arquivo no catálogo (só a data; vale o fim do dia). Valores como publicados, sem conversão. A coluna de variação mensal, derivada, não é coletada.",
      escopo: ESCOPO_CUSTO_IMEA,
      descricao:
        "Custo de produção do milho em Mato Grosso, por item de custo (R$/ha), mês a mês, nas planilhas \"Mensal\" e \"Ponderado\" do IMEA, em alta e média tecnologia. O custo total (CT) é o item em destaque."
    }
  },
  {
    ...BASE_CUSTO_IMEA,
    instrumentCode: "IMEA_CUSTO_MILHO_SAFRA",
    nome: "Custo do milho - por safra (IMEA)",
    frequencia: "ANUAL",
    toleranciaDias: 430,
    porRegiao: PORREGIAO_CUSTO_SAFRA,
    fonteDetalhe: {
      ...FONTE_DETALHE_CUSTO_IMEA,
      metodologia:
        "As colunas \"Consolidado\" da planilha \"Ponderado\" (safras 2021/22 a 2025/26 na de 15/09/2026): um valor por safra. O dia da observação é 1º de setembro do ano de início (convenção, como no WASDE e na Conab). A data de publicação é a do arquivo no catálogo, inclusive para safras antigas (limite superior conservador: o valor aparece depois, nunca antes). Valores como publicados, sem conversão.",
      escopo: ESCOPO_CUSTO_IMEA,
      descricao:
        "Custo de produção do milho em Mato Grosso por safra consolidada, por item de custo (R$/ha), conforme a planilha \"Ponderado\" do IMEA, em alta e média tecnologia. O custo total (CT) é o item em destaque."
    }
  },

  // --- IMEA - balanço de oferta e demanda do milho de Mato Grosso, do PDF mensal (ADR 0019) ---
  // Card à parte do de safra (`IMEA_MILHO_SAFRA`): o balanço não tem quebra por região (só Mato
  // Grosso, ao contrário do card de safra, que tem as 7 regiões do IMEA) - colocar as duas coisas no
  // mesmo seletor `porRegiao` deixaria a maioria dos itens sem dado. Mesmo critério de
  // compatibilidade do WASDE/custo, só que no eixo "item" em vez de "frequência"/"unidade".
  {
    instrumentCode: "IMEA_MILHO_BALANCO",
    nome: "Milho - balanço de oferta e demanda (IMEA)",
    unidade: "milhões de t",
    casasDecimais: 2,
    origem: "observation",
    frequencia: "ANUAL",
    toleranciaDias: 430,
    fonte: FONTE_IMEA,
    fonteCollectorCode: "imea-oferta-demanda-milho",
    // Série `IMEA.MILHO.BALANCO.<CAMPO>`: UMA série por métrica, só Mato Grosso - a tela oferece só o seletor de métrica.
    porCampo: { prefixoSerie: "IMEA.MILHO.BALANCO" },
    campoPrincipal: "ESTOQUE_FINAL",
    campos: [
      { codigo: "ESTOQUE_FINAL", nome: "Estoque final", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "OFERTA", nome: "Oferta", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "ESTOQUE_INICIAL", nome: "Estoque inicial", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "PRODUCAO", nome: "Produção", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "IMPORTACAO", nome: "Importação", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "DEMANDA", nome: "Demanda", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "CONSUMO_MT", nome: "Consumo em Mato Grosso", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "CONSUMO_INTERESTADUAL", nome: "Consumo interestadual", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "EXPORTACAO", nome: "Exportação", unidade: "milhões de t", casasDecimais: 2 },
      { codigo: "AQUISICOES_PUBLICAS", nome: "Aquisições públicas", unidade: "milhões de t", casasDecimais: 2 }
    ],
    fonteDetalhe: {
      formatoOrigem: 'PDF (boletim mensal "Oferta e Demanda - Milho", do catálogo de arquivos do site do IMEA) - dado extraído do texto do PDF publicado pelo IMEA, não de uma API',
      metodologia:
        "Um valor por safra e por edição (o dia da observação é 1º de setembro do ano de início; convenção, como no WASDE/Conab/IMEA safra). Cada edição mensal do PDF reestima a safra corrente e as anteriores: a data de publicação é a REAL, do catálogo de arquivos do site (só a data; vale o fim do dia, para nunca gravar uma data no futuro do relógio), e cada revisão vira uma versão nova, o que preserva o que o mercado sabia em cada data. A tabela de balanço é lida por COORDENADA (posição x/y de cada texto do PDF), não por texto corrido: é o que torna esta fonte viável (uma tentativa anterior com extração de texto corrido desalinhava a tabela, como também acontecia no WASDE antes de mudar para a planilha). As colunas de variação percentual entre safras, que a fonte também traz, não são coletadas (não são dado, são derivadas). Valores como publicados, sem conversão de unidade.",
      escopo:
        'só Mato Grosso (o balanço da fonte não tem quebra por região, ao contrário do card de safra), com as 10 linhas que o PDF traz: Oferta, Estoque inicial, Importação, Produção, Demanda, Consumo em Mato Grosso, Consumo interestadual, Exportação, Aquisições públicas e Estoque final. "Oferta" e "Demanda" são os subtotais que a própria fonte publica (Estoque inicial + Produção + Importação, e Consumo MT + Consumo interestadual + Exportação, respectivamente) - não é um cálculo do FinMind. A métrica Produção também aparece no card de safra (`IMEA_MILHO_SAFRA`), vinda de uma rota diferente da mesma fonte (API x PDF): os dois valores não são reconciliados entre si, cada um é o que aquela rota publica. Catálogo com edições de 2014-04-14 em diante (a mais antiga disponível); o próprio catálogo também lista um PDF de metodologia (sem tabela de safra), que não é uma edição e não é coletado.',
      urlOficial: "https://www.imea.com.br/imea-site/relatorios-mercado"
    }
  },

  // --- Indicador do Milho CEPEA/ESALQ, divulgado pela B3 (ADR 0021) ---
  // O número é o da CEPEA; a ORIGEM do dado é a B3 (arquivo `Indic`), e o card diz isso.
  {
    instrumentCode: "MILHO_CEPEA_ESALQ",
    origem: "observation",
    nome: "Milho — Indicador CEPEA/ESALQ",
    unidade: "R$/saca",
    casasDecimais: 2,
    frequencia: "DIARIA",
    toleranciaDias: 4,
    fonte: "B3 - Indicadores Agropecuários (Indicador CEPEA/ESALQ)",
    fonteCollectorCode: "b3-milho-esalq",
    porCampo: { prefixoSerie: "B3.MILHO_ESALQ" },
    campoPrincipal: "AVISTA_BRL",
    campos: [
      { codigo: "AVISTA_BRL", nome: "À vista (R$)", unidade: "R$/saca", casasDecimais: 2 },
      { codigo: "AVISTA_USD", nome: "À vista (US$)", unidade: "US$/saca", casasDecimais: 2 }
    ],
    fonteDetalhe: {
      descricao:
        "Indicador do Milho CEPEA/ESALQ (saca de 60 kg, à vista, região de Campinas/SP), o preço físico de referência do mercado interno e a base de liquidação do futuro de milho da B3 (CCM). O indicador é calculado pela CEPEA; o FinMind o obtém da B3, que o divulga no arquivo público de indicadores agropecuários - não do site da CEPEA, que bloqueia coleta automatizada.",
      metodologia:
        "Um valor por dia útil, desde 08/06/2018 (antes disso o milho não consta do arquivo da B3). Conferido contra o histórico exportado do site da CEPEA: 66 de 66 datas iguais ao centavo em R$. O valor em US$ é o que a B3 divulga e pode diferir por centavos do publicado pela CEPEA (câmbio de conversão diferente). A data de publicação é ESTIMADA (fim do dia do pregão em Brasília). Licença: dado da CEPEA (CC BY-NC 4.0) divulgado pela B3; uso interno, sem exibir a terceiros (ADR 0021).",
      formatoOrigem: "TXT de largura fixa em ZIP (B3, Pesquisa por pregão - Indicadores Econômicos e Agropecuários, arquivo Indic)",
      urlOficial: "https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/boletins-diarios/pesquisa-por-pregao/pesquisa-por-pregao/"
    }
  },

  // --- Futuros agrícolas da B3 por vencimento: milho (CCM, ADR 0009) e café arábica (ICF, ADR 0028) ---
  // Dois cards por produto sobre as MESMAS séries `B3.<PRODUTO>.<TICKER>.<CAMPO>`: os campos têm
  // unidades diferentes, então a tela mostra UM campo por vez, com uma linha por
  // vencimento (nunca uma série contínua). `porVencimento` faz o serviço descobrir
  // os vencimentos no banco; por padrão só os que ainda negociam.
  ...[
    {
      simbolo: "CCM",
      titulo: "Milho B3 (CCM)",
      mercadoria: "milho",
      unidadePreco: "R$/saca",
      fonteCollectorCode: "b3-ccm-futuro",
      notaLiquidez: " O relatório FEL 1 classifica a liquidez do CCM como modesta (§8.4, §13.3) - esta é a medida real.",
      historico:
        "de 2022-03-21 a 2025-12-11, o Boletim Diário de Informações (PDF, carga histórica única, ADR 0020); a partir de 2025-06-10, o arquivo diário do Up2Data (coleta diária, janela de ~15 meses)."
    },
    {
      simbolo: "ICF",
      titulo: "Café arábica B3 (ICF)",
      mercadoria: "café arábica 4/5",
      unidadePreco: "US$/saca",
      fonteCollectorCode: "b3-icf-futuro",
      notaLiquidez: " O volume financeiro é em reais, mesmo com o contrato cotado em dólares (100 sacas de 60 kg).",
      historico:
        "de 2022-03-21 a 2025-12-11, o Boletim Diário de Informações (PDF, carga histórica única, ADR 0028); a partir de 2025-06-10, o arquivo diário do Up2Data (coleta diária, janela de ~15 meses)."
    }
  ].flatMap(({ simbolo, titulo, mercadoria, unidadePreco, fonteCollectorCode, notaLiquidez, historico }) =>
    [
      {
        instrumentCode: `${simbolo}_PRECOS`,
        nome: `${titulo} — Preços`,
        unidade: unidadePreco,
        campoPrincipal: "SETTLE",
        campos: [
          { codigo: "SETTLE", nome: "Preço de ajuste", unidade: unidadePreco, casasDecimais: 2 },
          { codigo: "LAST", nome: "Último preço", unidade: unidadePreco, casasDecimais: 2 },
          { codigo: "HIGH", nome: "Máxima do dia", unidade: unidadePreco, casasDecimais: 2 },
          { codigo: "LOW", nome: "Mínima do dia", unidade: unidadePreco, casasDecimais: 2 },
          { codigo: "AVG", nome: "Preço médio", unidade: unidadePreco, casasDecimais: 2 },
          { codigo: "OPEN", nome: "Preço de abertura", unidade: unidadePreco, casasDecimais: 2 },
          { codigo: "OSCN_PCT", nome: "Oscilação", unidade: "%", casasDecimais: 2 }
        ],
        descricao: `Preços diários de cada vencimento do futuro de ${mercadoria} da B3 (${simbolo}): preço de ajuste, último, máxima, mínima, médio, abertura e oscilação. Cada vencimento é uma linha própria - o FinMind não encadeia vencimentos em série contínua.`
      },
      {
        instrumentCode: `${simbolo}_LIQUIDEZ`,
        nome: `${titulo} — Liquidez`,
        unidade: "contratos",
        campoPrincipal: "CONTRACTS",
        campos: [
          { codigo: "CONTRACTS", nome: "Contratos negociados", unidade: "contratos", casasDecimais: 0 },
          { codigo: "TRADES", nome: "Número de negócios", unidade: "negócios", casasDecimais: 0 },
          { codigo: "VOLUME_BRL", nome: "Volume financeiro", unidade: "R$", casasDecimais: 0 },
          { codigo: "OPEN_INTEREST", nome: "Contratos em aberto", unidade: "contratos", casasDecimais: 0 }
        ],
        descricao: `Liquidez diária de cada vencimento do futuro de ${mercadoria} da B3 (${simbolo}): contratos negociados, número de negócios, volume financeiro e contratos em aberto.${notaLiquidez}`
      }
    ].map((cartao) => ({ ...cartao, simbolo, fonteCollectorCode, historico }))
  ).map(({ simbolo, historico, ...cartao }) => ({
    ...cartao,
    origem: "observation",
    porVencimento: { prefixoSerie: `B3.${simbolo}`, campoReferencia: "SETTLE" },
    casasDecimais: cartao.campos.find((c) => c.codigo === cartao.campoPrincipal).casasDecimais,
    frequencia: "DIARIA",
    toleranciaDias: 4,
    fonte: "B3 - Up2Data (negócios consolidados) e Boletim Diário (BDI)",
    fonteDetalhe: {
      descricao: cartao.descricao,
      metodologia: `Um valor por vencimento e pregão. O valor em destaque é o do vencimento mais próximo ainda em negociação (sempre identificado ao lado). Por padrão o gráfico mostra os vencimentos que negociaram no último pregão; os já vencidos ficam disponíveis para seleção. A data de publicação é ESTIMADA (fim do dia do pregão em Brasília). Histórico em duas fontes da própria B3, nas mesmas séries: ${historico} Onde as duas cobrem o mesmo pregão, vale o valor do Up2Data (o BDI arredonda o volume para inteiro). Abertura e contratos em aberto só existem no BDI: vão até 2025-12-11 (o boletim deixou de trazer a tabela por vencimento).`,
      formatoOrigem: "CSV (TradeInformationConsolidatedFile, B3 Up2Data) e PDF (BDI, capítulo de derivativos)",
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
