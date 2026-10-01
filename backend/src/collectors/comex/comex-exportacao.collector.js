"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { paraIso, somarDias, fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes } = require("../base/persist-observations");
const { codigoDoPaisComex } = require("../../shared/utils/comex-pais");

// Comex Stat (MDIC) - exportação brasileira mensal de um produto (um NCM), via a API de dados
// (`POST /general`), pública e sem chave. Um coletor por produto (`criarColetorComexExportacao`):
// milho (ADR 0013) e café verde (ADR 0028).
//
// VERIFICADO POR CHAMADA REAL em 2026-09-21 para o milho (ver o ADR 0013):
//   - NCM 10059010 ("milho em grão, exceto para semeadura") tem dado de 2005 a
//     2026 com valores plausíveis (2005: 1,06 Mt; 2010: 10,7 Mt; 2012: 19,8 Mt;
//     2024: 39,7 Mt). Antes de 2005 NÃO está validado: em 2000 o mesmo NCM devolve
//     só 21 t, sinal de que o código mudou - por isso a cobertura começa em 2005.
//   - Café (2026-09-28, ADR 0028): NCM 09011110 ("café não torrado, não descafeinado, em
//     grão") tem dado plausível desde 1997, o 1º ano do Comex Stat (1997: 14,5 milhões de sacas;
//     2000: 16,1; 2005: 22,5; 2024: 46,1 - o recorde conhecido).
//   - Rate limit real: HTTP 429 "tente novamente em 10 segundos", visto até com
//     11 s entre chamadas, e em rajada longa (depois de ~16 anos seguidos as
//     próprias tentativas contam). Aqui: pausa de 13 s entre anos e, no 429,
//     espera crescente (20 s, 40 s, 60 s...) com até 5 tentativas.
//   - Pedir vários anos de uma vez SEM detalhe mensal devolve valor errado
//     (achado do AgroMind); por isso uma chamada por ano, sempre com monthDetail.
//   - A fonte NÃO informa se revisa meses já publicados: a coleta diária relê o ano
//     corrente e o anterior, e uma revisão vira uma nova versão (append-only).
//
// Só EXPORTAÇÃO: é o que o relatório FEL 1 descreve. Duas séries mensais por mês:
//   COMEX.<PRODUTO>.EXPORT.KG       (metricKG, kg)
//   COMEX.<PRODUTO>.EXPORT.FOB_USD  (metricFOB, US$)
// observed_at = primeiro dia do mês (a fonte é mensal); o mês fica em metadata.
//
// POR PAÍS DE DESTINO (`porPais`, milho desde 2026-10-01, ADR 0034): a mesma consulta com `details: ["country"]`.
// Duas séries por (mês, país): COMEX.<PRODUTO>.EXPORT_DESTINO.<CODIGO_PAIS>.KG e .FOB_USD, com o código de 3 dígitos
// da tabela de países da própria API (a resposta só traz o nome, trocado pelo código em `comex-pais.js`). Mês sem
// exportação para um país não tem linha: é ausência, não zero. Verificado em 2026-10-01: a soma dos países é igual ao
// total do mês em 48 de 48 valores (2012 e 2025, kg e US$).
//
// published_at: a fonte não informa. ESTIMADO como o dia 15 do mês seguinte
// (conservador: a divulgação costuma sair antes, então isto nunca antecipa o que
// se sabia). O serviço point-in-time o limita a collected_at.

const URL_API = "https://api-comexstat.mdic.gov.br/general";
const SOURCE_CODE = "MDIC_COMEXSTAT";

// Um produto = um NCM. `anoInicial` = o 1º ano com dado validado para o NCM.
const PRODUTOS = {
  milho: { codigo: "comex-milho-exportacao", ncm: "10059010", prefixoSerie: "COMEX.MILHO", anoInicial: 2005 },
  cafe: { codigo: "comex-cafe-exportacao", ncm: "09011110", prefixoSerie: "COMEX.CAFE", anoInicial: 1997 },
  "milho-destino": {
    codigo: "comex-milho-exportacao-destino",
    ncm: "10059010",
    prefixoSerie: "COMEX.MILHO.EXPORT_DESTINO",
    anoInicial: 2005,
    porPais: true
  }
};
const PAUSA_MS = 13_000;
// Visto no backfill real (2026-09-21): 16 anos seguidos com 13 s de pausa passaram e
// depois o 429 veio 3 vezes seguidas mesmo esperando 13 s - as próprias tentativas
// contam no limite. Por isso a espera no 429 CRESCE (20 s, 40 s, 60 s...).
const ESPERA_429_BASE_MS = 20_000;
const MAX_TENTATIVAS_429 = 5;
const TIMEOUT_MS = 120_000;
const DIA_PUBLICACAO_ESTIMADA = 15;

const SERIES = [
  { campo: "metricKG", sufixo: "EXPORT.KG", sufixoPais: "KG", unit: "kg" },
  { campo: "metricFOB", sufixo: "EXPORT.FOB_USD", sufixoPais: "FOB_USD", unit: "USD" }
];

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function corpoDaConsulta(ncm, ano, porPais = false) {
  return JSON.stringify({
    flow: "export",
    monthDetail: true,
    period: { from: `${ano}-01`, to: `${ano}-12` },
    filters: [{ filter: "ncm", values: [ncm] }],
    details: porPais ? ["country"] : [],
    metrics: ["metricFOB", "metricKG"]
  });
}

// Um ano. Em 429, espera e tenta de novo (até MAX_TENTATIVAS_429); qualquer outro
// erro HTTP ou de formato falha a execução inteira.
async function consultarAno(ncm, ano, { signal, fetchFn = fetch, esperar = aguardar, porPais = false } = {}) {
  for (let tentativa = 1; ; tentativa += 1) {
    let response;
    try {
      response = await fetchFn(URL_API, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", "user-agent": "FinMind/0.1 (coleta de dados de mercado)" },
        body: corpoDaConsulta(ncm, ano, porPais)
      });
    } catch (err) {
      throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(URL_API).host}: ${err.message}`);
    }

    if (response.status === 429 && tentativa < MAX_TENTATIVAS_429) {
      await esperar(ESPERA_429_BASE_MS * tentativa);
      continue;
    }
    if (!response.ok) {
      throw new UpstreamServiceError(`${new URL(URL_API).host} respondeu com status ${response.status} (ano ${ano}).`);
    }

    const corpo = await response.json();
    if (corpo?.success !== true || !Array.isArray(corpo.data?.list)) {
      throw new UpstreamServiceError(`Resposta do Comex Stat em formato inesperado (ano ${ano}).`);
    }
    return corpo.data.list;
  }
}

// Anos em sequência, com a pausa exigida pelo rate limit entre as chamadas.
async function baixarAnos(ncm, anos, opcoes = {}) {
  const esperar = opcoes.esperar || aguardar;
  const linhas = [];

  for (const [i, ano] of anos.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    linhas.push(...(await consultarAno(ncm, ano, opcoes)));
  }
  return linhas;
}

function intervaloDeAnos(anoInicial, anoFinal) {
  const anos = [];
  for (let ano = anoInicial; ano <= anoFinal; ano += 1) anos.push(ano);
  return anos;
}

function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do Comex Stat em formato inesperado (esperava uma lista).");
  }
  return rawData;
}

// Dia 15 do mês seguinte ao mês de referência, fim do dia em UTC.
function publicadoEm(ano, mes) {
  const primeiroDoMesSeguinte = paraIso(new Date(Date.UTC(ano, mes, 1)));
  return fimDoDiaUtc(somarDias(primeiroDoMesSeguinte, DIA_PUBLICACAO_ESTIMADA - 1));
}

function normalizar(produto, rawItems) {
  const validos = [];
  const invalidos = [];

  for (const r of rawItems) {
    const ano = Number(r?.year);
    const mes = Number(r?.monthNumber);

    if (!/^\d{4}$/.test(String(r?.year)) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      invalidos.push({ item: r, motivo: `Ano/mês inesperado: year="${r?.year}", monthNumber="${r?.monthNumber}".` });
      continue;
    }

    const observedAt = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const publishedAt = publicadoEm(ano, mes);

    let codigoPais = null;
    if (produto.porPais) {
      codigoPais = codigoDoPaisComex(r?.country);
      if (!codigoPais) {
        invalidos.push({ item: r, motivo: `País sem código na tabela do Comex Stat (comex-pais.js): "${r?.country}".` });
        continue;
      }
    }

    for (const serie of SERIES) {
      const valor = Number(r[serie.campo]);
      if (r[serie.campo] === undefined || r[serie.campo] === null || !Number.isFinite(valor) || valor < 0) {
        invalidos.push({ item: r, motivo: `${serie.campo} inválido: "${r[serie.campo]}".` });
        continue;
      }

      validos.push({
        series_code: codigoPais ? `${produto.prefixoSerie}.${codigoPais}.${serie.sufixoPais}` : `${produto.prefixoSerie}.${serie.sufixo}`,
        observed_at: observedAt,
        value: valor,
        unit: serie.unit,
        source_code: SOURCE_CODE,
        published_at: publishedAt,
        published_at_is_estimated: true,
        published_at_basis: "lag_rule",
        metadata: {
          fonte: "Comex Stat (MDIC)",
          ncm: produto.ncm,
          fluxo: "export",
          periodo: `${ano}-${String(mes).padStart(2, "0")}`,
          ...(codigoPais && { paisDestino: r.country, codigoPais }),
          regraPublicacao: "dia_15_do_mes_seguinte"
        }
      });
    }
  }

  return { validos, invalidos };
}

function produtoComex(chave) {
  const produto = PRODUTOS[chave];
  if (!produto) throw new Error(`Produto do Comex Stat desconhecido: ${chave} (conhecidos: ${Object.keys(PRODUTOS).join(", ")}).`);
  return produto;
}

// Coletor de um produto ("milho", "cafe", "milho-destino").
function criarColetorComexExportacao(chave) {
  const produto = produtoComex(chave);

  return {
    codigo: produto.codigo,
    produto,
    timeoutMs: TIMEOUT_MS,
    get tentativasRetry() {
      return env.collectors.retryTentativas;
    },
    // Coleta diária: o ano corrente e o anterior (pega meses novos, a virada de ano e
    // qualquer revisão tardia do ano passado).
    download({ signal }) {
      const anoAtual = new Date().getUTCFullYear();
      return baixarAnos(produto.ncm, [anoAtual - 1, anoAtual], { signal, porPais: produto.porPais });
    },
    // Backfill: de anoInicial (padrão: o início validado do NCM) até anoFinal.
    downloadIntervalo({ anoInicial = produto.anoInicial, anoFinal = new Date().getUTCFullYear(), signal }) {
      return baixarAnos(produto.ncm, intervaloDeAnos(anoInicial, anoFinal), { signal, porPais: produto.porPais });
    },
    parse,
    normalize: (rawItems) => normalizar(produto, rawItems),
    persist: persistirObservacoes,
    consultarAno: (ano, opcoes) => consultarAno(produto.ncm, ano, { porPais: produto.porPais, ...opcoes }),
    baixarAnos: (anos, opcoes) => baixarAnos(produto.ncm, anos, { porPais: produto.porPais, ...opcoes })
  };
}

module.exports = {
  criarColetorComexExportacao,
  PRODUTOS,
  intervaloDeAnos,
  publicadoEm,
  PAUSA_MS,
  ESPERA_429_BASE_MS,
  MAX_TENTATIVAS_429
};
