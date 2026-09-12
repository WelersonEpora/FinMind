const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

const requiredKeys = [
  "MARIADB_HOST",
  "MARIADB_PORT",
  "MARIADB_DATABASE",
  "MARIADB_USER",
  "MARIADB_PASSWORD",
  "JWT_SECRET"
];

requiredKeys.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  appPort: Number(process.env.APP_PORT || 3000),
  db: {
    host: process.env.MARIADB_HOST,
    port: Number(process.env.MARIADB_PORT || 3306),
    database: process.env.MARIADB_DATABASE,
    username: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "8h"
  },
  // Cookie de sessão só é marcado Secure em produção (precisa de HTTPS) -
  // em dev local (http://localhost) o navegador descartaria um cookie
  // Secure e o login pareceria "quebrado" sem motivo aparente.
  cookieSecure: (process.env.NODE_ENV || "development") === "production"
};
