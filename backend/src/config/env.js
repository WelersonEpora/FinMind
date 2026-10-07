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
  },
  // Gemini (ADR 0047): a leitura diária de eventos (com busca na web) e a de tendência do petróleo (sem busca, ADR
  // 0052). Duas chaves, como no AgroMind: a
  // gratuita é tentada primeiro e a paga só entra quando a gratuita esgota a cota (429) ou falha com 5xx persistente.
  // Com uma só das duas, usa essa; sem nenhuma, o coletor não é registrado. O timeout é por chamada: a chamada com
  // busca leva de 30 s a 2 min (medido no AgroMind).
  gemini: {
    apiKeyFree: process.env.GEMINI_API_KEY_FREE || "",
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || 240000)
  },
  // Leitura diária de geopolítica (ADR 0047): uma por dia, a primeira que der certo; as execuções seguintes do cron pulam
  // a chamada. GEOPOLITICA_REFAZER=1, só no comando (não no .env), força uma nova leitura que substitui a do dia:
  //   GEOPOLITICA_REFAZER=1 npm run collect -- --coletor=geopolitica
  geopolitica: {
    refazer: process.env.GEOPOLITICA_REFAZER === "1"
  },
  // Leitura diária de tendência dos quatro ativos (ADRs 0052, 0054, 0058 e 0062): a mesma regra, uma por ativo e dia. Para
  // trocar a de hoje (todas; --coletor=cafe-analise, por exemplo, para uma só):
  //   ANALISE_DIARIA_REFAZER=1 npm run collect -- --coletor=analise
  analiseDiaria: {
    refazer: process.env.ANALISE_DIARIA_REFAZER === "1"
  }
};
