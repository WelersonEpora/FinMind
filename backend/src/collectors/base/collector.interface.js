"use strict";

/**
 * Contrato que todo futuro coletor de dados do FinMind deve implementar.
 * Nenhum coletor real existe ainda - depende de quais mercados, ativos e
 * fontes o especialista David definir (ver docs/pendente-especialista-david.md).
 *
 * Um coletor concreto é um objeto com o formato:
 *   {
 *     codigo: string,                 // identificador único do coletor
 *     fetch: async () => rawData,     // busca os dados brutos na fonte
 *     parse: (rawData) => normalized, // normaliza pro modelo canônico do FinMind
 *     persist: async (normalized) => void, // grava os dados normalizados
 *   }
 *
 * Este arquivo só documenta o contrato e mantém o registro (vazio) dos
 * coletores disponíveis - não há lógica de coleta implementada.
 */

/** @type {Array<{codigo: string, fetch: Function, parse: Function, persist: Function}>} */
const registeredCollectors = [];

function listCollectors() {
  return registeredCollectors.slice();
}

module.exports = { listCollectors };
