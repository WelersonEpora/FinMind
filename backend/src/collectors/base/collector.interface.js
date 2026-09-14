"use strict";

/**
 * Contrato que todo coletor de dados do FinMind deve implementar. O
 * primeiro coletor real (cotação do dólar via API SGS do Banco Central,
 * ver collectors/bcb/bcb-usd-brl.collector.js) preenche este contrato -
 * novos ativos/fontes além dele continuam dependendo das definições do
 * especialista David (ver docs/pendente-especialista-david.md).
 *
 * Um coletor concreto é um objeto com o formato:
 *   {
 *     codigo: string,                        // identificador único do coletor
 *     timeoutMs: number,                      // timeout da fase de download
 *     tentativasRetry: number,                // tentativas de retry (só download)
 *     download: async ({ signal }) => rawData,        // busca os dados brutos na fonte
 *     parse: (rawData) => rawItems[],                  // extrai a lista de itens brutos
 *     normalize: (rawItems) => { validos, invalidos }, // mapeia pro modelo canônico + valida
 *     persist: async (validos, { execucaoId }, deps) => { criados, atualizados, ignorados }
 *   }
 *
 * `collector-runner.js` é quem orquestra essas fases (retry/timeout no
 * download, contagem de válidos/inválidos, registro de execução). Este
 * arquivo só documenta o contrato e mantém o registro dos coletores
 * disponíveis.
 */

/** @type {Array<object>} */
const registeredCollectors = [];

function registerCollector(collector) {
  if (registeredCollectors.some((existing) => existing.codigo === collector.codigo)) {
    throw new Error(`Coletor "${collector.codigo}" já está registrado.`);
  }
  registeredCollectors.push(collector);
}

function listCollectors() {
  return registeredCollectors.slice();
}

module.exports = { registerCollector, listCollectors };
