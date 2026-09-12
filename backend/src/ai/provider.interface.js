"use strict";

/**
 * Contrato que todo futuro provedor de IA do FinMind deve implementar.
 *
 * Um provedor concreto é um objeto com o formato:
 *   {
 *     nome: string,
 *     // `input` é um payload estruturado (dados preparados + contexto),
 *     // nunca texto livre não rastreável. `output` deve ser estruturado
 *     // também, para permitir auditoria e avaliação da qualidade da IA.
 *     generate: async (input) => output,
 *   }
 *
 * Camada de abstração isolada de propósito (ver ADR conceitual do
 * AgroMind sobre isolar a IA) - nenhum outro módulo do FinMind deve
 * depender diretamente de um SDK de IA específico, só deste contrato.
 * Uma resposta de IA nunca deve, por si só, disparar uma ordem ou sinal
 * operacional - isso é responsabilidade de uma camada de decisão
 * separada, ainda não definida.
 */
module.exports = {};
