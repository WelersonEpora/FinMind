"use strict";

const { ForbiddenError } = require("../errors");

function requireRole(...allowedRoles) {
  return function checkRole(req, _res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError("Você não tem permissão para acessar este recurso."));
    }
    return next();
  };
}

module.exports = requireRole;
