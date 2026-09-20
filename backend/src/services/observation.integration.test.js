"use strict";

// Verificação do SQL real do asOf() contra o MariaDB - OPT-IN.
//
// `npm test` NÃO abre conexão com o banco (regra do projeto, ver CLAUDE.md).
// Este arquivo só roda com FINMIND_TEST_DB=1 e o banco de dev migrado:
//   FINMIND_TEST_DB=1 node --test src/services/observation.integration.test.js
// Tudo acontece dentro de uma transação que sofre ROLLBACK no final - nada
// fica gravado (a tabela é append-only, então não haveria como limpar depois).

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const habilitado = process.env.FINMIND_TEST_DB === "1";
const opcoes = { skip: habilitado ? false : "defina FINMIND_TEST_DB=1 para rodar contra o MariaDB" };

const SERIE = "TESTE.PIT.REVISAVEL";
const SERIE_B = "TESTE.PIT.OUTRA";

let sequelize;
let CollectionExecution;
let transaction;
let service;
let execucaoId;

before(async () => {
  if (!habilitado) return;
  ({ sequelize, CollectionExecution } = require("../models"));
  service = require("./point-in-time.service");

  transaction = await sequelize.transaction();
  const execucao = await CollectionExecution.create(
    { collector_code: "teste-pit", trigger_type: "script", status: "running", started_at: new Date() },
    { transaction }
  );
  execucaoId = execucao.id;
});

after(async () => {
  if (!habilitado) return;
  await transaction.rollback();
  await sequelize.close();
});

const D = (iso) => new Date(iso);

async function registrar(observacoes, coletadoEm) {
  return service.registrarObservacoes(observacoes, { execucaoId, coletadoEm }, { transaction });
}

test("revisão: asOf antes da revisão → X; depois → Y", opcoes, async () => {
  // A fonte publica 10.0 em 10/03; em 15/08 revisa o MESMO período para 12.5.
  await registrar([{ series_code: SERIE, observed_at: "2026-02-01", value: 10, unit: "PCT", source_code: "TESTE", published_at: D("2026-03-10T16:00:00Z") }], D("2026-03-10T16:05:00Z"));
  const r2 = await registrar([{ series_code: SERIE, observed_at: "2026-02-01", value: 12.5, unit: "PCT", source_code: "TESTE", published_at: D("2026-08-15T16:00:00Z") }], D("2026-08-15T16:05:00Z"));
  assert.equal(r2.atualizados, 1);

  const consulta = (asOf) => service.obterAsOf({ seriesCodes: SERIE, asOf: D(asOf) }, { transaction });

  assert.deepEqual(await consulta("2026-03-09T00:00:00Z"), [], "antes da 1ª publicação: nada era conhecido");

  const antes = await consulta("2026-06-01T00:00:00Z");
  assert.equal(antes.length, 1);
  assert.equal(antes[0].value, 10, "asOf(DATA A) → X");
  assert.equal(antes[0].revisionSeq, 0);

  const depois = await consulta("2026-09-01T00:00:00Z");
  assert.equal(depois.length, 1, "uma linha por período observado, não por versão");
  assert.equal(depois[0].value, 12.5, "asOf(DATA B) → Y");
  assert.equal(depois[0].revisionSeq, 1);

  // Fronteira exata: published_at <= asOf é inclusivo.
  assert.equal((await consulta("2026-08-15T16:00:00Z"))[0].value, 12.5);
  assert.equal((await consulta("2026-08-15T15:59:59Z"))[0].value, 10);
});

test("a versão original continua no banco depois da revisão (append-only)", opcoes, async () => {
  const [linhas] = await sequelize.query("SELECT value, revision_seq FROM observation WHERE series_code = ? ORDER BY published_at", {
    replacements: [SERIE],
    transaction
  });
  assert.deepEqual(linhas.map((l) => [Number(l.value), l.revision_seq]), [[10, 0], [12.5, 1]]);
});

test("dois períodos diferentes da mesma série, com revisão só de um", opcoes, async () => {
  await registrar(
    [
      { series_code: SERIE_B, observed_at: "2026-04-01", value: 1, unit: "PCT", source_code: "TESTE", published_at: D("2026-04-05T12:00:00Z") },
      { series_code: SERIE_B, observed_at: "2026-04-02", value: 2, unit: "PCT", source_code: "TESTE", published_at: D("2026-04-06T12:00:00Z") }
    ],
    D("2026-04-06T12:30:00Z")
  );
  await registrar([{ series_code: SERIE_B, observed_at: "2026-04-01", value: 1.5, unit: "PCT", source_code: "TESTE", published_at: D("2026-05-01T12:00:00Z") }], D("2026-05-01T12:30:00Z"));

  const em = async (asOf) => (await service.obterAsOf({ seriesCodes: SERIE_B, asOf: D(asOf) }, { transaction })).map((l) => [l.observedAt, l.value]);

  assert.deepEqual(await em("2026-04-05T13:00:00Z"), [["2026-04-01", 1]], "no dia 05 só o 1º período era conhecido");
  assert.deepEqual(await em("2026-04-10T00:00:00Z"), [["2026-04-01", 1], ["2026-04-02", 2]]);
  assert.deepEqual(await em("2026-06-01T00:00:00Z"), [["2026-04-01", 1.5], ["2026-04-02", 2]]);
});

test("mesma versão não duplica na chave única (INSERT IGNORE devolve 0 linhas)", opcoes, async () => {
  const repo = require("../repositories/observation.repository");
  const versao = {
    id: require("node:crypto").randomUUID(),
    series_code: SERIE_B,
    observed_at: "2026-04-02",
    published_at: D("2026-04-06T12:00:00Z"), // mesma chave de uma versão já existente
    collected_at: D("2026-04-06T12:30:00Z"),
    value: 999,
    unit: "PCT",
    source_code: "TESTE",
    published_at_is_estimated: false,
    revision_seq: 9,
    collection_execution_id: execucaoId,
    metadata: null
  };
  assert.equal(await repo.inserirVersoes([versao], { transaction }), 0);
});

test("published_at estimado: modo padrão vê pela regra; modo estrito só depois de collected_at", opcoes, async () => {
  const SERIE_E = "TESTE.PIT.ESTIMADA";
  // Estimativa por regra: "publicado em 2026-01-10" - mas só coletado em 2026-09-01.
  await registrar(
    [{ series_code: SERIE_E, observed_at: "2026-01-09", value: 3, unit: "PCT", source_code: "TESTE", published_at: D("2026-01-10T23:59:59Z"), published_at_is_estimated: true, published_at_basis: "lag_rule" }],
    D("2026-09-01T12:00:00Z")
  );

  const em = (asOf, estrito) => service.obterAsOf({ seriesCodes: SERIE_E, asOf: D(asOf), estrito }, { transaction });

  assert.equal((await em("2026-02-01T00:00:00Z", false)).length, 1, "o mercado já podia saber");
  assert.equal((await em("2026-02-01T00:00:00Z", true)).length, 0, "o FinMind ainda não tinha coletado");
  assert.equal((await em("2026-09-02T00:00:00Z", true)).length, 1);
  assert.equal((await em("2026-02-01T00:00:00Z", false))[0].publishedAtIsEstimated, true);
});

test("sem published_at: cai em collected_at, estimado, e não duplica ao recoletar", opcoes, async () => {
  const SERIE_C = "TESTE.PIT.SEMPUB";
  const dado = [{ series_code: SERIE_C, observed_at: "2026-07-01", value: 7, unit: "PCT", source_code: "TESTE" }];
  await registrar(dado, D("2026-07-02T10:00:00Z"));
  const r = await registrar(dado, D("2026-07-09T10:00:00Z"));
  assert.equal(r.ignorados, 1);

  const linhas = await service.obterAsOf({ seriesCodes: SERIE_C, asOf: D("2026-07-03T00:00:00Z") }, { transaction });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].publishedAtIsEstimated, true);
  assert.equal(linhas[0].publishedAt.toISOString(), "2026-07-02T10:00:00.000Z");
});
