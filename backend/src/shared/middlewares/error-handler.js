"use strict";

const { ValidationError: SequelizeValidationError, UniqueConstraintError, DatabaseError } = require("sequelize");
const { AppError } = require("../errors");
const logger = require("../logger");

function errorHandler(err, req, res, _next) {
  const log = req.log || logger;

  if (err instanceof AppError) {
    log.warn({ err }, err.message);
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
  }

  if (err instanceof UniqueConstraintError) {
    log.warn({ err }, "Violação de unicidade");
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Já existe um registro com esses mesmos dados.",
        details: null
      }
    });
  }

  if (err instanceof SequelizeValidationError) {
    log.warn({ err }, "Erro de validação do Sequelize");
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos.",
        details: err.errors.map((item) => ({ field: item.path, message: item.message }))
      }
    });
  }

  if (err instanceof DatabaseError) {
    log.warn({ err }, "Erro de banco de dados");
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Um ou mais valores enviados têm formato inválido.",
        details: null
      }
    });
  }

  log.error({ err }, "Erro inesperado");
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Erro interno do servidor.",
      details: null
    }
  });
}

module.exports = errorHandler;
