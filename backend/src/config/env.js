const path = require("path");
const dotenv = require("dotenv");
const { lerConfigBanco } = require("./db-env");

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

const banco = lerConfigBanco();
const requiredKeys = [...banco.chavesObrigatorias, "JWT_SECRET"];

requiredKeys.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

// Duração da sessão (sem refresh token: ao expirar, o usuário entra de novo -
// docs/decisoes-tecnicas.md). Uma constante só alimenta o JWT e o cookie, para
// os dois nunca divergirem (antes o cookie tinha 8h fixas e ignorava
// JWT_EXPIRES_IN). Não é configurável por variável de ambiente de propósito.
const SESSION_HOURS = 12;

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  appPort: Number(process.env.APP_PORT || 3000),
  db: {
    dialect: banco.dialect,
    host: banco.host,
    port: banco.port,
    database: banco.database,
    username: banco.username,
    password: banco.password
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: `${SESSION_HOURS}h`
  },
  sessionMaxAgeMs: SESSION_HOURS * 60 * 60 * 1000,
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
