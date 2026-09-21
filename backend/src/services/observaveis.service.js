"use strict";

const marketDataService = require("./market-data.service");
const observationDataService = require("./observation-data.service");
const marketQuoteRepository = require("../repositories/market-quote.repository");
const collectionExecutionRepository = require("../repositories/collection-execution.repository");
const { NotFoundError } = require("../shared/errors");

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
      const { cotacao, vencimentoPrincipal } = await obterCotacaoAtualDoItem(item, deps);
      // Futuro por vencimento: o valor em destaque é o de UM vencimento - a lista
      // diz qual (ex.: "R$/saca (CCMX26)") em vez de sugerir uma série contínua.
      const unidade = cotacao?.unidade ?? item.unidade;
      return {
        codigo: item.instrumentCode,
        nome: item.nome,
        fonte: cotacao?.fonte ?? item.fonte ?? null,
        valor: cotacao?.valor ?? null,
        unidade: vencimentoPrincipal ? `${unidade} (${vencimentoPrincipal.ticker})` : unidade,
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

  const { cotacao, mensagem, vencimentoPrincipal } = await obterCotacaoAtualDoItem(item, deps);
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
      // Só futuros por vencimento: seletores de campo e de vencimento da tela.
      ...(dimensoes ? { ...dimensoes, vencimentoPrincipal: vencimentoPrincipal?.ticker ?? null } : {}),
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

module.exports = { listarObservaveis, obterDetalheObservavel, obterHistoricoObservavel };
