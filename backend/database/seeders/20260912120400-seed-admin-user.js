"use strict";

const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");

// Idempotente e sem senha default: exige ADMIN_EMAIL/ADMIN_PASSWORD no
// ambiente (ver .env.example) e falha alto e claro se ausentes, em vez de
// gravar uma senha conhecida no banco. Rodar de novo com o mesmo e-mail
// atualiza (upsert) em vez de duplicar.
module.exports = {
  async up(queryInterface) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error(
        "ADMIN_EMAIL e ADMIN_PASSWORD precisam estar definidos no ambiente para criar o usuário administrador inicial."
      );
    }

    const [adminRole] = await queryInterface.sequelize.query(
      "SELECT id FROM role WHERE name = 'admin' LIMIT 1",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (!adminRole) {
      throw new Error("Papel 'admin' não encontrado - rode o seeder de roles antes.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    const [existingUser] = await queryInterface.sequelize.query(
      "SELECT id FROM user WHERE email = :email LIMIT 1",
      { replacements: { email }, type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (existingUser) {
      await queryInterface.bulkUpdate(
        "user",
        { password_hash: passwordHash, role_id: adminRole.id, active: true, updated_at: now },
        { id: existingUser.id }
      );
      return;
    }

    await queryInterface.bulkInsert("user", [
      {
        id: randomUUID(),
        email,
        password_hash: passwordHash,
        name: "Administrador",
        role_id: adminRole.id,
        active: true,
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface) {
    const email = process.env.ADMIN_EMAIL;
    if (email) {
      await queryInterface.bulkDelete("user", { email });
    }
  }
};
