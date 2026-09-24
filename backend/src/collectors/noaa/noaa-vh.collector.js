"use strict";

const { URLSearchParams } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { somarDias, fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// NOAA STAR - Vegetation Health (VH) POR CULTURA: índices semanais de saúde da vegetação calculados só sobre a área
// de UMA cultura (máscara MapSPAM 2010), por país e por estado/província. É o indicador PRONTO do efeito do clima
// sobre a lavoura (não o tempo em si): VCI (umidade/verdor), TCI (estresse térmico) e VHI (a média dos dois, 0-100;
// a NOAA trata < 40 como estresse). Fator do milho "Clima e safra" do FEL 1. ADR 0025.
//
// VERIFICADO POR CHAMADA REAL em 2026-09-24:
//   - Endpoint em texto por trás da página "VH Time Series by administrative regions for specific crop"
//     (`get_TS_admin.php`, parâmetros tirados do JavaScript da própria página). Sem chave; `robots.txt` não restringe
//     `/smcd/emb/vci/VH/`. Resposta: HTML com um cabeçalho ("Mean data for BRA ... for area with 'MAIZ'") e um
//     `<pre>` com "ano,semana, SMN,SMT,VCI,TCI, VHI" por linha; semana sem dado (futura ou buraco de satélite) = -1.
//   - Série desde 1982 (Brasil/milho: 2.339 semanas até a 38/2026, 64 sem dado: 1984-85, 1994-95, 2003-05).
//   - Semana N = dias do ano 7(N-1)+1 a 7N (guia do usuário: PERIOD 17 de 2013 = dias 113 a 119); 52 semanas por ano.
//     A página considera disponível, no dia D do ano, a semana floor((D-1)/7): a semana sai no dia seguinte ao fim.
//     Em 24/09/2026 a última era a 38 (17 a 23/09).
//   - Conferência com secas conhecidas: EUA 2012, semanas 26-34, VHI 33-39 (2014, safra recorde: 64); Mato Grosso
//     2021 (quebra da safrinha), semanas 18-22, VHI 30-39.
//
// observed_at = último dia da semana (dia do ano 7N). published_at ESTIMADO (lag_rule): fim do dia (UTC) seguinte ao
// fim da semana, a regra da própria página; o serviço limita ao collected_at (ADR 0008).
//
// A NOAA reprocessa a série (versão "GC_Current"; há uma experimental "WF2025"), e o SMN/SMT é suavizado: uma semana
// recente pode mudar depois. A coleta relê o ano corrente e o anterior; mudança vira versão nova com collected_at.
// O histórico é a versão reprocessada de hoje (vintage real só daqui para frente). SMN (NDVI suavizado) e SMT
// (temperatura de brilho) são insumos brutos dos índices e não são coletados.

const URL_TS = "https://www.star.nesdis.noaa.gov/smcd/emb/vci/VH/get_TS_admin.php";
const SOURCE_CODE = "NOAA_STAR_VH";
const VERSAO_VH = "GC_Current";
const PRIMEIRO_ANO = 1981; // a página pede desde 1981; o dado começa em 1982
const TIMEOUT_BACKFILL_MS = 10 * 60 * 1000;

// Índices coletados, na ordem das colunas da fonte (year,week, SMN,SMT,VCI,TCI, VHI).
const INDICES = [
  { campo: "VCI", coluna: 4, nome: "Vegetation Condition Index" },
  { campo: "TCI", coluna: 5, nome: "Temperature Condition Index" },
  { campo: "VHI", coluna: 6, nome: "Vegetation Health Index" }
];

// Regiões por cultura. `provinceId` 0 = país inteiro; os ids de estado são os de `getProvinceNames.php` da NOAA.
// Faixas globais (modo "Global" da página, no lugar do país): W65 = mundo de 55°S a 65°N (a mais larga; cobre todo o
// milho), WNH = Hemisfério Norte (0 a 65°N), WSH = Hemisfério Sul (40°S a 0). A média global é ponderada pela área
// da cultura e dilui choques regionais (EUA 2012: VHI 33-35; mundo: ~44).
// Milho: mundo e hemisférios, os países de referência do card do WASDE (maiores produtores/exportadores) + Ucrânia
// (exportador), as 5 maiores UFs de milho da Conab e os 5 maiores estados de milho dos EUA (Corn Belt).
const CULTURAS = {
  milho: {
    codigo: "noaa-vh-milho",
    tagCropland: "MAIZ",
    nome: "milho",
    prefixoSerie: "NOAA_VH.MILHO",
    regioes: [
      { codigo: "MUNDO", pais: "W65", provinceId: 0, nome: "Global: 55S~65N" },
      { codigo: "HEMISFERIO_NORTE", pais: "WNH", provinceId: 0, nome: "Northern Hemisphere: 0~65N" },
      { codigo: "HEMISFERIO_SUL", pais: "WSH", provinceId: 0, nome: "Southern Hemisphere: 40S~0" },
      { codigo: "EUA", pais: "USA", provinceId: 0, nome: "United States" },
      { codigo: "BRASIL", pais: "BRA", provinceId: 0, nome: "Brazil" },
      { codigo: "ARGENTINA", pais: "ARG", provinceId: 0, nome: "Argentina" },
      { codigo: "CHINA", pais: "CHN", provinceId: 0, nome: "China" },
      { codigo: "UCRANIA", pais: "UKR", provinceId: 0, nome: "Ukraine" },
      { codigo: "BR_MT", pais: "BRA", provinceId: 11, nome: "Mato Grosso" },
      { codigo: "BR_PR", pais: "BRA", provinceId: 16, nome: "Paraná" },
      { codigo: "BR_GO", pais: "BRA", provinceId: 9, nome: "Goiás" },
      { codigo: "BR_MS", pais: "BRA", provinceId: 12, nome: "Mato Grosso do Sul" },
      { codigo: "BR_MG", pais: "BRA", provinceId: 13, nome: "Minas Gerais" },
      { codigo: "EUA_IA", pais: "USA", provinceId: 16, nome: "Iowa" },
      { codigo: "EUA_IL", pais: "USA", provinceId: 14, nome: "Illinois" },
      { codigo: "EUA_NE", pais: "USA", provinceId: 28, nome: "Nebraska" },
      { codigo: "EUA_MN", pais: "USA", provinceId: 24, nome: "Minnesota" },
      { codigo: "EUA_IN", pais: "USA", provinceId: 15, nome: "Indiana" }
    ]
  }
};

function urlSerie(cultura, regiao, anoInicial, anoFinal) {
  const params = new URLSearchParams({
    provinceID: String(regiao.provinceId),
    country: regiao.pais,
    adminVHversion: VERSAO_VH,
    yearlyTag: "Weekly",
    type: "Mean",
    TagCropland: cultura.tagCropland,
    year1: String(anoInicial),
    year2: String(anoFinal)
  });
  return `${URL_TS}?${params}`;
}

// Semana N do ano -> último dia (dia do ano 7N). null fora de 1..52.
function fimDaSemana(ano, semana) {
  if (!Number.isInteger(ano) || !Number.isInteger(semana) || semana < 1 || semana > 52) return null;
  return somarDias(`${ano}-01-01`, 7 * semana - 1);
}

// Texto da resposta -> { cabecalho, linhas: [[ano, semana, SMN, SMT, VCI, TCI, VHI]] }. Confere que a resposta é da
// região e da cultura pedidas (a página devolve 200 com tabela vazia para parâmetro errado).
function lerResposta(texto, cultura, regiao) {
  const limpo = String(texto).replace(/<[^>]*>/g, "\n");
  // País (ISO3, "BRA") ou faixa global ("W65", "WNH").
  const cabecalho = /Mean data for ([A-Z0-9]{3})\b[^\n]*/.exec(limpo);
  if (!cabecalho || cabecalho[1] !== regiao.pais) {
    throw new UpstreamServiceError(`Resposta da NOAA VH sem o cabeçalho esperado para ${regiao.pais} (${regiao.codigo}).`);
  }
  if (!limpo.includes(`area with '${cultura.tagCropland}'`)) {
    throw new UpstreamServiceError(`Resposta da NOAA VH não é da cultura ${cultura.tagCropland} (${regiao.codigo}).`);
  }
  if (regiao.provinceId !== 0 && !new RegExp(`Province= ${regiao.provinceId}:`).test(limpo)) {
    throw new UpstreamServiceError(`Resposta da NOAA VH não é da província ${regiao.provinceId} de ${regiao.pais} (${regiao.codigo}).`);
  }
  if (!/year,week,\s*SMN,SMT,VCI,TCI,\s*VHI/.test(limpo)) {
    throw new UpstreamServiceError(`Resposta da NOAA VH sem as colunas esperadas (${regiao.codigo}).`);
  }
  const linhas = [];
  for (const linha of limpo.split("\n")) {
    if (!/^\s*\d{4},/.test(linha)) continue;
    linhas.push(linha.split(",").map((c) => c.trim()).filter((c, i, arr) => !(c === "" && i === arr.length - 1)));
  }
  return linhas;
}

// ---------------------------------------------------------------- download

async function baixarRegioes(cultura, { anoInicial, anoFinal, signal }) {
  const respostas = [];
  for (const regiao of cultura.regioes) {
    const texto = await baixar(urlSerie(cultura, regiao, anoInicial, anoFinal), { signal });
    respostas.push({ regiao: regiao.codigo, texto });
  }
  return { respostas };
}

// ---------------------------------------------------------------- fábrica por cultura

function criarColetorVh(chaveCultura) {
  const cultura = CULTURAS[chaveCultura];
  if (!cultura) throw new Error(`Cultura "${chaveCultura}" não configurada para a NOAA VH.`);

  function parse(rawData) {
    if (!rawData || !Array.isArray(rawData.respostas)) {
      throw new UpstreamServiceError("Resposta da NOAA VH em formato inesperado (esperava uma resposta por região).");
    }
    const itens = [];
    for (const { regiao: codigoRegiao, texto } of rawData.respostas) {
      const regiao = cultura.regioes.find((r) => r.codigo === codigoRegiao);
      for (const colunas of lerResposta(texto, cultura, regiao)) {
        // Semana sem dado (futura ou buraco de satélite): a fonte preenche tudo com -1. Não é um item.
        if (INDICES.every((i) => Number(colunas[i.coluna]) === -1)) continue;
        for (const indice of INDICES) itens.push({ regiao, indice, ano: colunas[0], semana: colunas[1], valor: colunas[indice.coluna] });
      }
    }
    return itens;
  }

  function normalize(itens) {
    const validos = [];
    const invalidos = [];
    for (const { regiao, indice, ano, semana, valor } of itens) {
      const item = { regiao: regiao.codigo, indice: indice.campo, ano, semana, valor };
      const fim = fimDaSemana(Number(ano), Number(semana));
      if (!fim) {
        invalidos.push({ item, motivo: `Ano/semana fora do esperado: ${ano}/${semana} (semanas 1 a 52).` });
        continue;
      }
      const value = String(valor).trim() === "" ? NaN : Number(valor);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        invalidos.push({ item, motivo: `Valor fora da escala 0-100: "${valor}".` });
        continue;
      }
      validos.push({
        series_code: `${cultura.prefixoSerie}.${regiao.codigo}.${indice.campo}`,
        observed_at: fim,
        value,
        unit: "índice 0-100",
        source_code: SOURCE_CODE,
        published_at: fimDoDiaUtc(somarDias(fim, 1)),
        published_at_is_estimated: true,
        published_at_basis: "lag_rule",
        metadata: {
          fonte: "NOAA STAR - Vegetation Health por cultura",
          indice: indice.nome,
          cultura: cultura.tagCropland,
          pais: regiao.pais,
          provinceId: regiao.provinceId,
          regiao: regiao.nome,
          ano: Number(ano),
          semana: Number(semana),
          versaoVh: VERSAO_VH,
          regraPublicacao: "dia_seguinte_ao_fim_da_semana"
        }
      });
    }
    return { validos, invalidos };
  }

  return {
    codigo: cultura.codigo,
    get timeoutMs() {
      return env.collectors.sourceTimeoutMs;
    },
    get tentativasRetry() {
      return env.collectors.retryTentativas;
    },
    // Coleta diária: o ano corrente e o anterior (a NOAA pode revisar semanas recentes). O histórico desde 1982 é o
    // backfill (`downloadIntervalo`).
    download: ({ signal } = {}) => {
      const anoFinal = new Date().getUTCFullYear();
      return baixarRegioes(cultura, { anoInicial: anoFinal - 1, anoFinal, signal });
    },
    downloadIntervalo: ({ anoInicial = PRIMEIRO_ANO, anoFinal = new Date().getUTCFullYear(), signal } = {}) =>
      baixarRegioes(cultura, { anoInicial, anoFinal, signal }),
    parse,
    normalize,
    persist: persistirObservacoes,
    cultura,
    TIMEOUT_BACKFILL_MS
  };
}

module.exports = { criarColetorVh, fimDaSemana, lerResposta, urlSerie, CULTURAS, INDICES, SOURCE_CODE, PRIMEIRO_ANO };
