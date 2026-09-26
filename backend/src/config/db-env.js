"use strict";

// Conexão com o banco, lida do ambiente. Durante a migração para PostgreSQL (ADR 0026) os dois bancos
// convivem: DB_DIALECT escolhe qual usar (`mysql`, o padrão, ou `postgres`) e cada um tem as próprias
// variáveis (MARIADB_* ou POSTGRES_*). Depois da virada, o ramo do MariaDB sai.
// Usado pelo servidor (config/env.js) e pelo sequelize-cli (sequelize.config.js, .sequelizerc).
const DIALETOS = {
  mysql: { prefixo: "MARIADB", portaPadrao: 3306 },
  postgres: { prefixo: "POSTGRES", portaPadrao: 5432 }
};

function lerConfigBanco(ambiente = process.env) {
  const dialect = ambiente.DB_DIALECT || "mysql";
  const dialeto = DIALETOS[dialect];
  if (!dialeto) {
    throw new Error(`DB_DIALECT inválido: "${dialect}" (use "mysql" ou "postgres").`);
  }

  const chave = (nome) => `${dialeto.prefixo}_${nome}`;
  return {
    dialect,
    host: ambiente[chave("HOST")],
    port: Number(ambiente[chave("PORT")] || dialeto.portaPadrao),
    database: ambiente[chave("DATABASE")],
    username: ambiente[chave("USER")],
    password: ambiente[chave("PASSWORD")],
    // Variáveis que o servidor exige para subir (config/env.js).
    chavesObrigatorias: ["HOST", "PORT", "DATABASE", "USER", "PASSWORD"].map(chave)
  };
}

module.exports = { lerConfigBanco };
