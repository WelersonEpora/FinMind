"use strict";

const { NotConfiguredError } = require("../shared/errors");

/**
 * Contrato do futuro motor analítico do FinMind.
 *
 * `runAnalysis(preparedData)` deve receber dados já coletados e preparados
 * e devolver um resultado estruturado - a forma exata de `preparedData` e
 * do resultado depende das regras e cálculos que o especialista David
 * ainda vai definir (ver docs/pendente-especialista-david.md).
 *
 * Deliberadamente não gera nenhum sinal de compra/venda nem número de
 * mercado: enquanto as regras não existirem, qualquer chamada falha de
 * forma explícita em vez de simular um resultado.
 *
 * @param {unknown} _preparedData
 * @returns {Promise<never>}
 */
async function runAnalysis(_preparedData) {
  throw new NotConfiguredError(
    "Motor analítico ainda não configurado - aguardando regras e cálculos do especialista de mercado."
  );
}

module.exports = { runAnalysis };
