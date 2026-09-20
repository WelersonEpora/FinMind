"use strict";

const { URL } = require("node:url");
const pointInTimeService = require("../../services/point-in-time.service");

// `persist` comum a todo coletor que grava na camada point-in-time
// (observation, ADR 0008): delega ao serviço, que decide entre "novo",
// "mesmo valor" e "revisão" e nunca atualiza uma linha existente.
async function persistirObservacoes(validos, { execucaoId }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  return servico.registrarObservacoes(validos, { execucaoId, coletadoEm: new Date() }, deps);
}

// Download HTTP comum: erro de rede/HTTP vira UpstreamServiceError (o runner
// marca a execução como failed).
async function baixar(url, { signal, headers = {}, as = "text" }) {
  const { UpstreamServiceError } = require("../../shared/errors");
  let response;
  try {
    response = await fetch(url, { signal, headers: { "user-agent": "FinMind/0.1 (coleta de dados de mercado)", ...headers } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
  }
  if (!response.ok) {
    throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status}.`);
  }
  return as === "json" ? response.json() : response.text();
}

module.exports = { persistirObservacoes, baixar };
