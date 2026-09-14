"use strict";

const { ValidationError } = require("../errors");

// Validação de paginação compartilhada entre os services que listam séries/
// execuções (market-data.service.js, coletas.service.js) - mesmos limites,
// mesma mensagem de erro.
function validarPaginacao({ pagina, tamanhoPagina }, { tamanhoPadrao = 20, tamanhoMaximo = 100 } = {}) {
  const paginaNumero = pagina === undefined ? 1 : Number(pagina);
  const tamanhoNumero = tamanhoPagina === undefined ? tamanhoPadrao : Number(tamanhoPagina);

  if (!Number.isInteger(paginaNumero) || paginaNumero < 1) {
    throw new ValidationError('"pagina" deve ser um inteiro maior ou igual a 1.');
  }
  if (!Number.isInteger(tamanhoNumero) || tamanhoNumero < 1 || tamanhoNumero > tamanhoMaximo) {
    throw new ValidationError(`"tamanhoPagina" deve ser um inteiro entre 1 e ${tamanhoMaximo}.`);
  }

  return { pagina: paginaNumero, tamanhoPagina: tamanhoNumero };
}

module.exports = { validarPaginacao };
