"use strict";

// Consulta de leitura no banco do servidor (ADR 0107), pelo túnel SSH aberto pelo usuário. Só para análise: o papel
// `finmind_leitura` só tem SELECT nas tabelas de mercado, e a sessão abre em modo somente leitura.
//
// Credenciais em `.env.servidor` na raiz do repositório (fora do git):
//   SERVIDOR_PG_HOST=127.0.0.1
//   SERVIDOR_PG_PORT=15432
//   SERVIDOR_PG_DATABASE=finmind
//   SERVIDOR_PG_USER=finmind_leitura
//   SERVIDOR_PG_PASSWORD=...
//
// Uso: node scripts/consulta-servidor.js "select ..."   (ou o SQL pela entrada padrão)
//      --json: as linhas em JSON (padrão: tabela)

const fs = require("node:fs");
const path = require("node:path");
const { Client, types } = require("pg");

// DATEONLY (oid 1082) como texto "aaaa-mm-dd", sem virar Date no fuso local.
types.setTypeParser(1082, (valor) => valor);

function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) throw new Error(`Sem ${arquivo} (ver ADR 0107).`);
  const env = {};
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const sql = args.filter((a) => a !== "--json").join(" ").trim() || fs.readFileSync(0, "utf8").trim();
  if (!sql) throw new Error("Informe o SQL.");

  const env = lerEnv(path.resolve(__dirname, "../../.env.servidor"));
  const client = new Client({
    host: env.SERVIDOR_PG_HOST || "127.0.0.1",
    port: Number(env.SERVIDOR_PG_PORT || 15432),
    database: env.SERVIDOR_PG_DATABASE || "finmind",
    user: env.SERVIDOR_PG_USER || "finmind_leitura",
    password: env.SERVIDOR_PG_PASSWORD,
    connectionTimeoutMillis: 10000
  });
  await client.connect();
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const { rows } = await client.query(sql);
    if (json) console.log(JSON.stringify(rows, null, 2));
    else console.table(rows);
  } finally {
    await client.end();
  }
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
