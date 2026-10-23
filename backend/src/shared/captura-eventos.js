"use strict";

// O teste de captura dos eventos (ADR 0144; análise do café de 2026-10-19, item E2): o que define o teste, explícito e
// versionado aqui. Decisão do usuário (Welerson) em 2026-10-23, sobre a aprovação do Comitê de 2026-10-22 ("a lista de
// eventos é obrigatória para o critério de captura de 80%"). Vale para os três ativos que usam o módulo de eventos dos
// agrícolas (ADR 0130): milho, café e soja.

const VERSAO = 1;

// O critério: num período de 30 dias, a leitura captura pelo menos 80% dos eventos de referência relevantes.
const META_PCT = 80;
const PERIODO_DIAS = 30;
// Capturado: o fato aparece num evento aceito de uma leitura do ativo do dia do evento até 2 dias úteis depois (a
// leitura roda de madrugada: o que sai à tarde entra na do dia seguinte). Dias úteis de segunda a sexta, sem feriados.
const DIAS_UTEIS_CAPTURA = 2;

// Gatilho de movimento do preço: o retorno do dia no vencimento mais negociado do futuro da B3, dividido pelo desvio
// dos 60 retornos anteriores; |z| de 2 ou mais vira candidato. O retorno só vale dentro de um contrato (com o ajuste
// dele no pregão anterior): a troca de vencimento não vira movimento.
const PRECO = Object.freeze({ zMinimo: 2, janelaRetornos: 60 });

const ORIGENS = Object.freeze({
  CALENDARIO: "Publicação de relatório",
  PRECO: "Movimento do preço",
  SECUNDARIA: "Alerta de fonte secundária",
  MANUAL: "Adicionado à mão"
});

// Por ativo: o futuro da B3 do gatilho de preço e os relatórios do calendário, pelo `source_code` da observation (o dia
// de publicação de cada um, sem as séries diárias e semanais, que não são relatório). A Federação de Cafeteiros não é
// coletada: entra à mão (MANUAL), se for o caso.
const ATIVOS = Object.freeze({
  MILHO: {
    futuro: "B3.CCM",
    relatorios: [
      { fonte: "USDA_WASDE", nome: "USDA: WASDE (oferta e demanda mundial)" },
      { fonte: "CONAB_LEVANTAMENTO_SAFRAS", nome: "Conab: levantamento da safra de grãos" },
      { fonte: "USDA_NASS_AREA", nome: "USDA: área plantada (Prospective Plantings ou Acreage)" },
      { fonte: "USDA_NASS_GRAIN_STOCKS", nome: "USDA: estoques trimestrais (Grain Stocks)" },
      { fonte: "IMEA_MILHO_BALANCO", nome: "IMEA: balanço de oferta e demanda do milho de MT" },
      { fonte: "IMEA_MILHO_SAFRA", nome: "IMEA: estimativa da safra de milho de MT" }
    ]
  },
  CAFE: {
    futuro: "B3.ICF",
    relatorios: [
      { fonte: "CONAB_LEVANTAMENTO_CAFE", nome: "Conab: levantamento da safra de café" },
      { fonte: "USDA_FAS_PSD", nome: "USDA FAS: balanço do café (PSD)" },
      { fonte: "ICO_CMR", nome: "ICO: relatório mensal do mercado de café" },
      { fonte: "ECF_STOCKS", nome: "ECF: estoques de café nos portos europeus" },
      { fonte: "NOAA_CPC", nome: "NOAA CPC: El Niño e La Niña (ONI e RONI)" }
    ]
  },
  SOJA: {
    futuro: "B3.SJC",
    relatorios: [
      { fonte: "USDA_WASDE_SOJA", nome: "USDA: WASDE (oferta e demanda mundial)" },
      { fonte: "CONAB_LEVANTAMENTO_SAFRAS_SOJA", nome: "Conab: levantamento da safra de grãos" },
      { fonte: "USDA_NASS_AREA_SOJA", nome: "USDA: área plantada (Prospective Plantings ou Acreage)" },
      { fonte: "USDA_NASS_GRAIN_STOCKS_SOJA", nome: "USDA: estoques trimestrais (Grain Stocks)" }
    ]
  }
});

const CODIGOS_ATIVO = Object.freeze(Object.keys(ATIVOS));

module.exports = { VERSAO, META_PCT, PERIODO_DIAS, DIAS_UTEIS_CAPTURA, PRECO, ORIGENS, ATIVOS, CODIGOS_ATIVO };
