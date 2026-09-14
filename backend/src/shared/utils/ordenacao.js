"use strict";

const { ValidationError } = require("../errors");

// Validação de ordenação compartilhada entre os services que expõem tabelas
// paginadas/ordenáveis no frontend (histórico de cotação, execuções de
// coleta) - mesmo padrão de shared/utils/pagination.js.
function validarOrdenacao({ ordenarPor, ordem }, { camposPermitidos, padrao }) {
  const campoFinal = ordenarPor === undefined ? padrao : ordenarPor;

  if (!camposPermitidos.includes(campoFinal)) {
    throw new ValidationError(`"ordenarPor" deve ser um entre: ${camposPermitidos.join(", ")}.`);
  }

  const ordemFinal = ordem === undefined ? "DESC" : String(ordem).toUpperCase();
  if (!["ASC", "DESC"].includes(ordemFinal)) {
    throw new ValidationError('"ordem" deve ser "ASC" ou "DESC".');
  }

  return { ordenarPor: campoFinal, ordem: ordemFinal };
}

module.exports = { validarOrdenacao };
