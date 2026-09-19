"use strict";

// Cria um usuário real - não existe endpoint público de cadastro de
// propósito (só um admin autenticado cria usuários pela tela /usuarios).
// Este script cobre o bootstrap (primeiro admin) e qualquer provisionamento
// sem precisar da UI, reaproveitando a mesma lógica de user.service.js
// (sem duplicar regra entre CLI e API).
//
// Uso:
//   node scripts/create-user.js --name="Fulano" --email="fulano@exemplo.com" --password="..." [--role=admin|user]
//
//   (em produção, dentro do container:
//    docker compose exec backend node scripts/create-user.js --name=... --email=... --password=... --role=admin)

const { sequelize } = require("../src/models");
const userService = require("../src/services/user.service");

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const { name, email, password, role } = parseArgs();

  if (!name || !email || !password) {
    console.error('Uso: node scripts/create-user.js --name="..." --email="..." --password="..." [--role=admin|user]');
    process.exitCode = 1;
    return;
  }

  const user = await userService.createUser({ name, email, password, role });
  console.log(`Usuário criado: ${user.id} <${user.email}> (role: ${user.role})`);
}

main()
  .catch((err) => {
    console.error("Falha ao criar usuário:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
