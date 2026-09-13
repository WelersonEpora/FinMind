"use strict";

const userRepository = require("../repositories/user.repository");
const password = require("../shared/utils/password");
const { toSafeUser } = require("./auth.service");
const { User } = require("../models");
const { ValidationError, ConflictError, NotFoundError } = require("../shared/errors");

const VALID_ROLES = Object.values(User.ROLE);

function assertValidRole(role) {
  if (!VALID_ROLES.includes(role)) {
    throw new ValidationError(`"role" deve ser um entre: ${VALID_ROLES.join(", ")}.`);
  }
}

async function assertEmailAvailable(repo, normalizedEmail, currentEmail) {
  if (normalizedEmail === currentEmail) return;
  const existing = await repo.findByEmail(normalizedEmail);
  if (existing) {
    throw new ConflictError("Já existe um usuário com este e-mail.");
  }
}

// Nunca deixar o sistema sem nenhum owner ativo - mesma checagem do
// Personal-Assistant (services/membro.service.js).
async function assertKeepsAnActiveOwner(repo, user, updates) {
  const roleFinal = updates.role ?? user.role;
  const activeFinal = updates.active ?? user.active;
  const wasActiveOwner = user.role === User.ROLE.OWNER && user.active;
  const staysActiveOwner = roleFinal === User.ROLE.OWNER && activeFinal;

  if (wasActiveOwner && !staysActiveOwner) {
    const otherActiveOwners = await repo.countActiveOwners(user.id);
    if (otherActiveOwners === 0) {
      throw new ValidationError("É preciso manter ao menos um owner ativo.");
    }
  }
}

function assertValidPassword(plainPassword) {
  if (plainPassword.length < 8) {
    throw new ValidationError('"password" precisa ter ao menos 8 caracteres.');
  }
}

async function listUsers(deps = {}) {
  const repo = deps.userRepository || userRepository;
  const users = await repo.findAll();
  return users.map(toSafeUser);
}

async function createUser({ name, email, password: plainPassword, role }, deps = {}) {
  const repo = deps.userRepository || userRepository;
  const pwd = deps.password || password;

  if (!name?.trim()) {
    throw new ValidationError('"name" é obrigatório.');
  }
  if (!email?.trim()) {
    throw new ValidationError('"email" é obrigatório.');
  }
  if (!plainPassword || plainPassword.length < 8) {
    throw new ValidationError('"password" precisa ter ao menos 8 caracteres.');
  }

  const finalRole = role || User.ROLE.COLABORADOR;
  assertValidRole(finalRole);

  const normalizedEmail = email.trim().toLowerCase();
  await assertEmailAvailable(repo, normalizedEmail, null);

  const user = await repo.create({
    name: name.trim(),
    email: normalizedEmail,
    password_hash: await pwd.hash(plainPassword),
    role: finalRole
  });

  return toSafeUser(user);
}

function buildFieldUpdates({ name, email }) {
  const updates = {};

  if (name !== undefined) {
    if (!name.trim()) {
      throw new ValidationError('"name" não pode ficar vazio.');
    }
    updates.name = name.trim();
  }

  if (email !== undefined) {
    if (!email.trim()) {
      throw new ValidationError('"email" não pode ficar vazio.');
    }
    updates.email = email.trim().toLowerCase();
  }

  return updates;
}

// Edição completa - só owner chama isto (ver require-role na rota): papel,
// status e dados de qualquer usuário.
async function updateUser(id, { name, email, password: plainPassword, role, active }, deps = {}) {
  const repo = deps.userRepository || userRepository;
  const pwd = deps.password || password;

  const user = await repo.findById(id);
  if (!user) {
    throw new NotFoundError("Usuário não encontrado.");
  }

  const updates = buildFieldUpdates({ name, email });

  if (updates.email) {
    await assertEmailAvailable(repo, updates.email, user.email);
  }

  if (role !== undefined) {
    assertValidRole(role);
    updates.role = role;
  }

  if (active !== undefined) {
    updates.active = Boolean(active);
  }

  if (plainPassword) {
    assertValidPassword(plainPassword);
    updates.password_hash = await pwd.hash(plainPassword);
  }

  await assertKeepsAnActiveOwner(repo, user, updates);

  await repo.update(user, updates);
  return toSafeUser(await repo.findById(id));
}

// Autoatendimento - qualquer usuário autenticado chama isto sobre si mesmo
// (ver rota /users/me). Só nome e senha - nunca papel, status ou e-mail,
// pra ninguém conseguir se promover ou reativar a própria conta por aqui.
async function updateOwnProfile(id, { name, password: plainPassword }, deps = {}) {
  const repo = deps.userRepository || userRepository;
  const pwd = deps.password || password;

  const user = await repo.findById(id);
  if (!user) {
    throw new NotFoundError("Usuário não encontrado.");
  }

  const updates = buildFieldUpdates({ name, email: undefined });

  if (plainPassword) {
    assertValidPassword(plainPassword);
    updates.password_hash = await pwd.hash(plainPassword);
  }

  await repo.update(user, updates);
  return toSafeUser(await repo.findById(id));
}

module.exports = { listUsers, createUser, updateUser, updateOwnProfile };
