"use strict";

const { UnauthorizedError } = require("../errors");
const { verify } = require("../utils/jwt");
const { COOKIE_NAME } = require("../utils/session-cookie");
const userRepository = require("../../repositories/user.repository");

// O token só prova QUEM é o usuário (`sub`); se ele ainda pode acessar e com
// qual papel de plataforma vem SEMPRE do banco, a cada request. Assim,
// desativar um usuário ou mudar o papel dele vale na hora (não em até 12h,
// quando o token expiraria) e o papel gravado em tokens antigos é ignorado.
// Custo: uma consulta por chave primária por request - sem cache de
// propósito, para não reintroduzir o atraso.
//
// Falha ao consultar o banco NÃO vira 401: um erro de infraestrutura não
// deve deslogar o usuário, só responder 500.
async function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return next(new UnauthorizedError("Sessão ausente. Faça login novamente."));
  }

  let payload;
  try {
    payload = verify(token);
  } catch (_err) {
    return next(new UnauthorizedError("Sessão inválida ou expirada. Faça login novamente."));
  }

  try {
    const user = await userRepository.findById(payload.sub);

    if (!user || !user.active) {
      return next(new UnauthorizedError("Sessão inválida ou expirada. Faça login novamente."));
    }

    req.user = { sub: user.id, role: user.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireAuth;
