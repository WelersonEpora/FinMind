"use strict";

// Conexão com o PostgreSQL, lida do ambiente (POSTGRES_*). ADR 0026: o FinMind usa o Postgres compartilhado
// da VM (repositório servidor02-infra), com database e usuário próprios.
// Usado pelo servidor (config/env.js) e pelo sequelize-cli (sequelize.config.js).
const CHAVES_OBRIGATORIAS = ["POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DATABASE", "POSTGRES_USER", "POSTGRES_PASSWORD"];

function lerConfigBanco(ambiente = process.env) {
  return {
    dialect: "postgres",
    host: ambiente.POSTGRES_HOST,
    port: Number(ambiente.POSTGRES_PORT || 5432),
    database: ambiente.POSTGRES_DATABASE,
    username: ambiente.POSTGRES_USER,
    password: ambiente.POSTGRES_PASSWORD,
    // Variáveis que o servidor exige para subir (config/env.js).
    chavesObrigatorias: CHAVES_OBRIGATORIAS
  };
}

module.exports = { lerConfigBanco };
