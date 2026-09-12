"use strict";

const { NotFoundError } = require("../errors");

function notFoundHandler(req, _res, next) {
  next(new NotFoundError(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

module.exports = notFoundHandler;
