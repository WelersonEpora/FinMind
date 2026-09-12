"use strict";

const { NotConfiguredError } = require("../shared/errors");

// Implementação nula do contrato em provider.interface.js - nenhuma
// chamada paga a um provedor de IA acontece nesta fase. Existe só para
// que o resto do sistema (dashboard, status) possa referenciar "a IA"
// sem acoplar a nenhum SDK real ainda, e para deixar claro que a
// integração está desligada por padrão (fail-closed), não simulada.
const nullProvider = {
  nome: "none",
  async generate(_input) {
    throw new NotConfiguredError(
      "Nenhum provedor de IA configurado ainda - aguardando definição de como avaliar a saída da IA."
    );
  }
};

module.exports = nullProvider;
