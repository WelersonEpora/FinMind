"use strict";

const userRepository = require("../repositories/user.repository");
const password = require("../shared/utils/password");
const jwt = require("../shared/utils/jwt");
const { UnauthorizedError } = require("../shared/errors");

function toSafeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    hasPhoto: Boolean(user.photo_path)
  };
}

async function login(email, plainPassword, deps = {}) {
  const repo = deps.userRepository || userRepository;
  const pwd = deps.password || password;
  const signer = deps.jwt || jwt;

  const user = await repo.findByEmail(email);

  if (!user || !user.active) {
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }

  const passwordMatches = await pwd.compare(plainPassword, user.password_hash);
  if (!passwordMatches) {
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }

  const safeUser = toSafeUser(user);
  // Só `sub`: o papel e o status vêm do banco a cada request (ver
  // require-auth.js), nunca do token.
  const token = signer.sign({ sub: safeUser.id });

  return { token, user: safeUser };
}

async function getCurrentUser(userId, deps = {}) {
  const repo = deps.userRepository || userRepository;
  const user = await repo.findById(userId);

  if (!user || !user.active) {
    throw new UnauthorizedError("Sessão inválida.");
  }

  return toSafeUser(user);
}

module.exports = { login, getCurrentUser, toSafeUser };
