"use strict";

// Carga única do MariaDB para o PostgreSQL (docs/adr/0026-postgresql-como-banco.md). Copia os dados, nunca
// recoleta: a `observation` guarda quando cada valor foi coletado e cada revisão da fonte, e as fontes só devolvem
// a versão de hoje.
//
// Conecta nos DOIS bancos ao mesmo tempo, independente do DB_DIALECT: lê MARIADB_* (origem) e POSTGRES_*
// (destino). O destino precisa estar com a migration de linha de base aplicada e VAZIO (o script se recusa a
// completar um banco que já tem dados). Tudo roda numa transação no destino: se algo falhar, nada fica gravado.
// No fim, confere a contagem de cada tabela e, na observation, a contagem e a soma dos valores de cada série.
//
// Uso: node scripts/migrar-mariadb-para-postgres.js
//      (em produção: docker compose exec backend node scripts/migrar-mariadb-para-postgres.js)

const { Sequelize, QueryTypes } = require("sequelize");
const { lerConfigBanco } = require("../src/config/db-env");
const logger = require("../src/shared/logger");

// Ordem das chaves estrangeiras: quem é referenciado vem antes.
const TABELAS = [
  { nome: "user", chave: "id" },
  { nome: "system_setting", chave: "key" },
  { nome: "workspace", chave: "id" },
  { nome: "workspace_member", chave: "id" },
  { nome: "collection_execution", chave: "id" },
  { nome: "market_quote", chave: "id" },
  { nome: "observation", chave: "id" }
];

const COLUNAS_BOOLEANAS = { user: ["active"], observation: ["published_at_is_estimated"] };
const COLUNAS_JSON = { collection_execution: ["metadata"], market_quote: ["metadata"], observation: ["metadata"] };

// 5.000 linhas por lote: com as 12 colunas da observation são 60.000 parâmetros, abaixo do limite de 65.535.
const TAMANHO_LOTE = 5000;

function conectar(dialect) {
  const config = lerConfigBanco({ ...process.env, DB_DIALECT: dialect });
  return new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect,
    logging: false
  });
}

// Ajusta uma linha lida do MariaDB ao tipo do PostgreSQL. Datas (Date), DATEONLY (texto) e DECIMAL (texto)
// passam como vieram.
function converterLinha(tabela, linha) {
  const convertida = { ...linha };
  for (const coluna of COLUNAS_BOOLEANAS[tabela] || []) {
    convertida[coluna] = Boolean(Number(convertida[coluna]));
  }
  for (const coluna of COLUNAS_JSON[tabela] || []) {
    const valor = convertida[coluna];
    convertida[coluna] = valor == null ? null : typeof valor === "string" ? valor : JSON.stringify(valor);
  }
  // O Postgres compara e-mail com distinção de maiúsculas: grava em minúsculas (o índice é em lower(email)).
  if (tabela === "user" && typeof convertida.email === "string") {
    convertida.email = convertida.email.trim().toLowerCase();
  }
  return convertida;
}

// E-mails que colidem ao passar para minúsculas: a carga para antes de gravar, em vez de o índice único falhar
// no meio.
function emailsDuplicados(usuarios) {
  const vistos = new Map();
  const duplicados = new Set();
  for (const { email } of usuarios) {
    const normalizado = email.trim().toLowerCase();
    if (vistos.has(normalizado)) duplicados.add(normalizado);
    vistos.set(normalizado, true);
  }
  return [...duplicados];
}

function aspas(identificador) {
  return `"${identificador.replace(/"/g, '""')}"`;
}

async function inserirLote(destino, tabela, colunas, linhas, transaction) {
  const valores = [];
  const tuplas = linhas.map((linha) => {
    const marcadores = colunas.map((coluna) => {
      valores.push(linha[coluna]);
      return `$${valores.length}`;
    });
    return `(${marcadores.join(", ")})`;
  });
  await destino.query(`INSERT INTO ${aspas(tabela)} (${colunas.map(aspas).join(", ")}) VALUES ${tuplas.join(", ")}`, {
    bind: valores,
    transaction
  });
}

// Lê a origem em páginas pela chave primária (sem OFFSET, que fica lento em tabela grande).
async function copiarTabela(origem, destino, { nome, chave }, transaction) {
  let ultimaChave = null;
  let copiadas = 0;
  let colunas = null;

  for (;;) {
    const filtro = ultimaChave === null ? "" : `WHERE \`${chave}\` > :ultimaChave`;
    const linhas = await origem.query(`SELECT * FROM \`${nome}\` ${filtro} ORDER BY \`${chave}\` LIMIT ${TAMANHO_LOTE}`, {
      replacements: { ultimaChave },
      type: QueryTypes.SELECT
    });
    if (linhas.length === 0) break;

    colunas = colunas || Object.keys(linhas[0]);
    await inserirLote(destino, nome, colunas, linhas.map((linha) => converterLinha(nome, linha)), transaction);
    copiadas += linhas.length;
    ultimaChave = linhas[linhas.length - 1][chave];
    if (nome === "observation") logger.info({ tabela: nome, copiadas }, "Copiando...");
  }
  return copiadas;
}

async function contar(banco, tabela, citar, transaction) {
  const [{ total }] = await banco.query(`SELECT COUNT(*) AS total FROM ${citar(tabela)}`, { type: QueryTypes.SELECT, transaction });
  return Number(total);
}

// Contagem e soma dos valores por série: pega linha faltando, sobrando ou com valor alterado na conversão.
async function resumoObservation(banco, transaction) {
  const linhas = await banco.query(
    "SELECT series_code, COUNT(*) AS total, SUM(value) AS soma FROM observation GROUP BY series_code ORDER BY series_code",
    { type: QueryTypes.SELECT, transaction }
  );
  return new Map(linhas.map((l) => [l.series_code, `${Number(l.total)}|${Number(l.soma).toFixed(6)}`]));
}

async function main() {
  const origem = conectar("mysql");
  const destino = conectar("postgres");

  try {
    for (const { nome } of TABELAS) {
      const jaTem = await contar(destino, nome, aspas);
      if (jaTem > 0) throw new Error(`O destino já tem dados em "${nome}" (${jaTem} linhas): a carga só roda num banco vazio.`);
    }

    const usuarios = await origem.query("SELECT email FROM `user`", { type: QueryTypes.SELECT });
    const duplicados = emailsDuplicados(usuarios);
    if (duplicados.length) throw new Error(`E-mails que colidem sem distinção de maiúsculas: ${duplicados.join(", ")}`);

    await destino.transaction(async (transaction) => {
      for (const tabela of TABELAS) {
        const copiadas = await copiarTabela(origem, destino, tabela, transaction);
        logger.info({ tabela: tabela.nome, copiadas }, "Tabela copiada");
      }

      // Seeders já aplicados na origem não rodam de novo no destino.
      await destino.query('CREATE TABLE IF NOT EXISTS sequelize_data (name VARCHAR(255) PRIMARY KEY)', { transaction });
      const seeders = await origem.query("SELECT name FROM sequelize_data", { type: QueryTypes.SELECT });
      for (const { name } of seeders) {
        await destino.query("INSERT INTO sequelize_data (name) VALUES ($1) ON CONFLICT DO NOTHING", { bind: [name], transaction });
      }

      const divergencias = [];
      for (const { nome } of TABELAS) {
        const naOrigem = await contar(origem, nome, (t) => `\`${t}\``);
        const noDestino = await contar(destino, nome, aspas, transaction);
        if (naOrigem !== noDestino) divergencias.push(`${nome}: origem ${naOrigem}, destino ${noDestino}`);
      }
      const resumoOrigem = await resumoObservation(origem);
      const resumoDestino = await resumoObservation(destino, transaction);
      for (const [serie, resumo] of resumoOrigem) {
        if (resumoDestino.get(serie) !== resumo) divergencias.push(`observation ${serie}: origem ${resumo}, destino ${resumoDestino.get(serie)}`);
      }
      if (resumoDestino.size !== resumoOrigem.size) divergencias.push(`observation: ${resumoOrigem.size} séries na origem, ${resumoDestino.size} no destino`);

      // Lançar aqui desfaz a transação inteira.
      if (divergencias.length) throw new Error(`Conferência falhou:\n${divergencias.join("\n")}`);
      logger.info({ tabelas: TABELAS.length, series: resumoOrigem.size }, "Conferência OK: contagens e somas por série iguais");
    });
  } finally {
    await origem.close();
    await destino.close();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "Carga MariaDB -> PostgreSQL falhou (nada foi gravado no destino)");
      process.exit(1);
    });
}

module.exports = { converterLinha, emailsDuplicados, TABELAS };
