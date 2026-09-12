"use strict";

const { UnauthorizedError } = require("../errors");
const { verify } = require("../utils/jwt");
const { COOKIE_NAME } = require("../utils/session-cookie");

function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return next(new UnauthorizedError("Sessão ausente. Faça login novamente."));
  }

  try {
    req.user = verify(token);
    return next();
  } catch (_err) {
    return next(new UnauthorizedError("Sessão inválida ou expirada. Faça login novamente."));
  }
}

module.exports = requireAuth;
