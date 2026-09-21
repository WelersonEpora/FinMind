"use strict";

const env = require("../../config/env");

const COOKIE_NAME = "finmind_session";

// SameSite=Lax (não Strict) para não quebrar navegação vinda de link
// externo; combinado com a ausência de CORS habilitado na API (ver
// docs/decisoes-tecnicas.md), isso já é suficiente para barrar CSRF numa
// API JSON-only sem precisar de um token CSRF separado.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    maxAge: env.sessionMaxAgeMs
  };
}

module.exports = { COOKIE_NAME, cookieOptions };
