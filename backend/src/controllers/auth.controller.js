"use strict";

const authService = require("../services/auth.service");
const { ValidationError } = require("../shared/errors");
const { COOKIE_NAME, cookieOptions } = require("../shared/utils/session-cookie");

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      throw new ValidationError("Informe e-mail e senha.");
    }

    const { token, user } = await authService.login(email, password);

    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

function logout(_req, res) {
  res.clearCookie(COOKIE_NAME);
  return res.status(204).send();
}

async function me(req, res, next) {
  try {
    const user = await authService.getCurrentUser(req.user.sub);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

module.exports = { login, logout, me };
