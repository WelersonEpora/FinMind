"use strict";

const { URL } = require("node:url");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");

// Partes comuns dos coletores do IMEA (Instituto Mato-Grossense de Economia Agropecuária). ADR 0018.
//
// A API `api1.imea.com.br/api` NÃO é documentada: foi descoberta lendo o JavaScript público do site
// (`config.js` e as páginas de indicador e de relatórios), como no AgroMind. É pública, sem chave nem login.

const API_BASE = "https://api1.imea.com.br/api";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
// Id da cadeia do milho na API do IMEA (`config.js`: ALGODAO 1, BOI 2, MILHO 3, SOJA 4, LEITE 7, SUINO 8).
const CADEIA_MILHO = 3;

async function buscar(url, { signal, fetchFn = fetch } = {}) {
  let response;
  try {
    response = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
  }
  if (!response.ok) {
    throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status} (${new URL(url).pathname}).`);
  }
  return response;
}

function semAcento(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// "Médio-Norte" -> MEDIO_NORTE, "Campo Novo do Parecis" -> CAMPO_NOVO_DO_PARECIS, "1. SEMENTES" -> 1_SEMENTES.
// Os códigos de série não têm ponto (o repositório acha o item pela posição dos pontos).
function slug(texto) {
  return semAcento(String(texto ?? "").trim())
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// A fonte informa só a DATA em que publicou (sem fuso nem hora confiável). `published_at` é o fim desse dia em
// UTC: limite conservador, nunca antecipa o que se sabia. Se a coleta roda no próprio dia da publicação, o fim
// do dia ainda está no futuro e o serviço point-in-time rejeitaria um `published_at` real futuro: nesse caso vale
// o instante da coleta (o valor já estava em mãos).
function publicadoEm(dataIso, agora = new Date()) {
  const fimDoDia = fimDoDiaUtc(dataIso);
  return fimDoDia.getTime() > agora.getTime() ? agora : fimDoDia;
}

module.exports = { API_BASE, USER_AGENT, CADEIA_MILHO, buscar, slug, semAcento, publicadoEm };
