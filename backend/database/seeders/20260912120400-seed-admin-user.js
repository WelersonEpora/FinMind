"use strict";

const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");

// Idempotente e sem senha default: exige ADMIN_EMAIL/ADMIN_PASSWORD no
// ambiente (ver .env.example) e falha alto e claro se ausentes, em vez de
// gravar uma senha conhecida no banco. Rodar de novo com o mesmo e-mail
// atualiza (upsert) em vez de duplicar. Papel de plataforma "admin" direto
// na coluna `role` (sem tabela de papéis à parte - ver migration
// 20260913100000-simplify-user-role-to-column.js e, para o rename
// owner->admin, 20260919110000-rename-platform-roles.js).
// Seeder usa SQL cru (não passa por user.service/user.repository), então
// replica aqui a regra "todo usuário tem um espaço pessoal com vínculo
// owner" (ADR 0007). Idempotente: o índice único em
// workspace.personal_user_id garante um só espaço pessoal por usuário.
// Nome copiado de propósito - seeder é histórico, não importa código da app.
const PERSONAL_WORKSPACE_NAME = "Espaço pessoal";

// Mesma normalização do user.service (e-mail sempre gravado em minúsculas). "user" vai entre aspas pelo
// quoteIdentifier: é palavra reservada no PostgreSQL (ADR 0026); no MariaDB vira crase.
function normalizarEmail(email) {
  return email ? email.trim().toLowerCase() : email;
}

async function ensurePersonalWorkspace(queryInterface, userId, now) {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT id FROM workspace WHERE personal_user_id = :userId LIMIT 1",
    { replacements: { userId }, type: queryInterface.sequelize.QueryTypes.SELECT }
  );
  if (existing) return;

  const workspaceId = randomUUID();
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.bulkInsert(
      "workspace",
      [{ id: workspaceId, name: PERSONAL_WORKSPACE_NAME, personal_user_id: userId, created_at: now, updated_at: now }],
      { transaction }
    );
    await queryInterface.bulkInsert(
      "workspace_member",
      [{ id: randomUUID(), workspace_id: workspaceId, user_id: userId, role: "owner", created_at: now, updated_at: now }],
      { transaction }
    );
  });
}

module.exports = {
  async up(queryInterface) {
    const email = normalizarEmail(process.env.ADMIN_EMAIL);
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error(
        "ADMIN_EMAIL e ADMIN_PASSWORD precisam estar definidos no ambiente para criar o usuário administrador inicial."
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    const [existingUser] = await queryInterface.sequelize.query(
      `SELECT id FROM ${queryInterface.quoteIdentifier("user")} WHERE email = :email LIMIT 1`,
      { replacements: { email }, type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (existingUser) {
      await queryInterface.bulkUpdate(
        "user",
        { password_hash: passwordHash, role: "admin", active: true, updated_at: now },
        { id: existingUser.id }
      );
      await ensurePersonalWorkspace(queryInterface, existingUser.id, now);
      return;
    }

    const userId = randomUUID();
    await queryInterface.bulkInsert("user", [
      {
        id: userId,
        email,
        password_hash: passwordHash,
        name: "Administrador",
        role: "admin",
        active: true,
        created_at: now,
        updated_at: now
      }
    ]);
    await ensurePersonalWorkspace(queryInterface, userId, now);
  },

  async down(queryInterface) {
    const email = normalizarEmail(process.env.ADMIN_EMAIL);
    if (!email) return;

    // Vínculos e espaço pessoal têm FK para user (sem CASCADE) - saem antes.
    const [user] = await queryInterface.sequelize.query(`SELECT id FROM ${queryInterface.quoteIdentifier("user")} WHERE email = :email LIMIT 1`, {
      replacements: { email },
      type: queryInterface.sequelize.QueryTypes.SELECT
    });
    if (user) {
      await queryInterface.bulkDelete("workspace_member", { user_id: user.id });
      await queryInterface.bulkDelete("workspace", { personal_user_id: user.id });
    }
    await queryInterface.bulkDelete("user", { email });
  }
};
