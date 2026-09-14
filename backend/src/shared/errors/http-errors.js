"use strict";

const AppError = require("./app-error");

class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado.", details = null) {
    super(message, 404, "NOT_FOUND", details);
  }
}

class ValidationError extends AppError {
  constructor(message = "Dados inválidos.", details = null) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

class ConflictError extends AppError {
  constructor(message = "Conflito de dados.", details = null) {
    super(message, 409, "CONFLICT", details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Não autorizado.", details = null) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Acesso negado.", details = null) {
    super(message, 403, "FORBIDDEN", details);
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = "Muitas requisições. Tente novamente mais tarde.", details = null) {
    super(message, 429, "TOO_MANY_REQUESTS", details);
  }
}

class NotConfiguredError extends AppError {
  constructor(message = "Funcionalidade ainda não configurada.", details = null) {
    super(message, 503, "NOT_CONFIGURED", details);
  }
}

// Falha de comunicação com uma fonte de dados externa (rede, timeout, HTTP
// 5xx/406, corpo de resposta em formato inesperado) - distinta de um dado
// individual inválido dentro de um lote, que não aborta a coleta inteira
// (ver collectors/base/collector-runner.js).
class UpstreamServiceError extends AppError {
  constructor(message = "Falha ao comunicar com um serviço externo.", details = null) {
    super(message, 502, "UPSTREAM_ERROR", details);
  }
}

module.exports = {
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
  NotConfiguredError,
  UpstreamServiceError
};
