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
  cookieSecure: (process.env.NODE_ENV || "development") === "production",
  // Foto de avatar - disco local (volume Docker em produção, ver
  // docker/compose.prod.yml), nunca servido como estático público - só
  // lido atrás de autenticação (ver photo-storage.js).
  photoStorageDir: process.env.PHOTO_STORAGE_DIR || "storage/photos",
  // Coleta de dados (collectors/) - opcionais, com default, nunca exigidos
  // (a API do BCB SGS é pública, sem chave).
  collectors: {
    bcbSgsTimeoutMs: Number(process.env.BCB_SGS_TIMEOUT_MS || 15000),
    retryTentativas: Number(process.env.COLLECTOR_RETRY_TENTATIVAS || 3),
    retryDelayMs: Number(process.env.COLLECTOR_RETRY_DELAY_MS || 500),
    // Fontes da camada point-in-time (FRED, LBMA, CFTC, USDA): baixam o
    // histórico inteiro de uma vez, então o timeout é maior que o do BCB.
    sourceTimeoutMs: Number(process.env.COLLECTOR_SOURCE_TIMEOUT_MS || 60000),
    // Chave gratuita do USDA NASS QuickStats (https://quickstats.nass.usda.gov/api).
    // Sem ela o coletor do Crop Progress não é registrado.
    nassApiKey: process.env.NASS_API_KEY || "",
    // Chave gratuita do FRED (https://fred.stlouisfed.org/docs/api/api_key.html).
    // Com ela o coletor do FRED usa a API REST; sem ela cai no CSV público (ADR 0012).
    // Também serve às vintages (ALFRED, ADR 0011).
    fredApiKey: process.env.FRED_API_KEY || ""
  }
};
