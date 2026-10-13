"use strict";

// Isolamento das carteiras entre espaços (ADR 0007, §6; ADR 0127) contra o Postgres REAL - OPT-IN.
//
// `npm test` NÃO abre conexão com o banco (CLAUDE.md). Este arquivo só roda com FINMIND_TEST_DB=1 e o banco migrado:
//   FINMIND_TEST_DB=1 node --test src/repositories/carteira.integration.test.js
// No CI ele roda num passo próprio, contra um Postgres de serviço (.github/workflows/ci.yml).
//
// Prova o que os fakes não provam: que o WHERE workspace_id existe no SQL, e que o banco recusa um filho ligado à
// carteira de outro espaço (FK composta) e a exclusão de um espaço com carteira (RESTRICT). Tudo numa transação que
// sofre ROLLBACK no final; cada recusa esperada roda num savepoint, para não abortar a transação.

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const habilitado = process.env.FINMIND_TEST_DB === "1";
const opcoes = { skip: habilitado ? false : "defina FINMIND_TEST_DB=1 para rodar contra o banco" };

let db;
let repositorio;
let transaction;
let espacoA;
let espacoB;
let usuario;
let carteiraA;

// Uma recusa do banco num savepoint: a transação de fora continua usável.
async function recusado(fn, nomeDoErro) {
  await assert.rejects(() => db.sequelize.transaction({ transaction }, (savepoint) => fn(savepoint)), (erro) => erro.name === nomeDoErro);
}

const PARAMETROS = { modelo: "cartilha-1.0", conta: "B3", ativos: {}, carteira: {}, execucao: {} };

before(async () => {
  if (!habilitado) return;
  db = require("../models");
  repositorio = require("./carteira.repository");
  transaction = await db.sequelize.transaction();
  usuario = await db.User.create(
    { id: randomUUID(), email: `isolamento-${randomUUID()}@teste.local`, password_hash: "x", name: "Teste de isolamento", role: "user", active: true },
    { transaction }
  );
  espacoA = await db.Workspace.create({ id: randomUUID(), name: "Espaço A (teste)" }, { transaction });
  espacoB = await db.Workspace.create({ id: randomUUID(), name: "Espaço B (teste)" }, { transaction });
  carteiraA = await repositorio.forWorkspace(espacoA.id).criarComTrilhas(
    {
      carteira: { nome: "Conta B3 (teste)", conta: "B3", moeda: "BRL", capital_inicial: 10000, data_inicio: "2026-10-14" },
      parametros: PARAMETROS,
      motivo: "teste",
      autorUserId: usuario.id
    },
    { transaction }
  );
});

after(async () => {
  if (!habilitado) return;
  await transaction.rollback();
  await db.sequelize.close();
});

test("a criação grava a versão 1 e as seis trilhas, no espaço da carteira", opcoes, async () => {
  const doA = repositorio.forWorkspace(espacoA.id);
  const versoes = await doA.listarVersoes(carteiraA.id, { transaction });
  assert.deepEqual(versoes.map((v) => [v.versao, v.tipo, v.vigente_desde]), [[1, "INICIAL", "2026-10-14"]]);
  const trilhas = await doA.listarTrilhas(carteiraA.id, { transaction });
  assert.deepEqual(trilhas.map((t) => t.tipo).sort(), ["CAIXA", "COMPRAR_E_SEGURAR", "DETERMINISTICA", "IA", "OPERADOR", "PERSISTENCIA"]);
  assert.ok(trilhas.every((t) => t.workspace_id === espacoA.id));
});

test("outro espaço não enxerga a carteira: buscar, listar, versões e trilhas vêm vazios", opcoes, async () => {
  const doB = repositorio.forWorkspace(espacoB.id);
  assert.equal(await doB.buscar(carteiraA.id, { transaction }), null);
  assert.equal(await doB.buscarPorNome("Conta B3 (teste)", { transaction }), null);
  assert.deepEqual(await doB.listar({ transaction }), []);
  assert.deepEqual(await doB.listarVersoes(carteiraA.id, { transaction }), []);
  assert.deepEqual(await doB.listarTrilhas(carteiraA.id, { transaction }), []);
  assert.ok(await repositorio.forWorkspace(espacoA.id).buscar(carteiraA.id, { transaction }));
});

test("o banco recusa uma versão do espaço B ligada à carteira do espaço A (FK composta)", opcoes, async () => {
  // Pelo repositório de B: ele não vê as versões de A e tenta a versão 1, que já existe (a chave única recusa antes).
  await recusado(
    (t) => repositorio.forWorkspace(espacoB.id).registrarVersao({ carteiraId: carteiraA.id, tipo: "AJUSTE", vigenteDesde: "2026-10-15", parametros: PARAMETROS, motivo: "invasão", autorUserId: usuario.id }, { transaction: t }),
    "SequelizeUniqueConstraintError"
  );
  // Direto, com um número livre: a FK composta (workspace_id, carteira_id) recusa.
  await recusado(
    (t) => db.CarteiraParametrosVersao.create({ id: randomUUID(), workspace_id: espacoB.id, carteira_id: carteiraA.id, versao: 99, tipo: "AJUSTE", vigente_desde: "2026-10-15", parametros: PARAMETROS, motivo: "invasão", autor_user_id: usuario.id }, { transaction: t }),
    "SequelizeForeignKeyConstraintError"
  );
});

test("o banco recusa apagar o espaço que tem carteira (RESTRICT)", opcoes, async () => {
  await recusado((t) => db.Workspace.destroy({ where: { id: espacoA.id }, transaction: t }), "SequelizeForeignKeyConstraintError");
  assert.ok(await repositorio.forWorkspace(espacoA.id).buscar(carteiraA.id, { transaction }));
});

test("as restrições do banco: moeda da conta, capital positivo, tipo de trilha", opcoes, async () => {
  const base = { nome: "x", conta: "B3", moeda: "BRL", capital_inicial: 10000, data_inicio: "2026-10-14", situacao: "ATIVA", criada_por: usuario.id };
  const criar = (extra) => (t) => db.Carteira.create({ ...base, id: randomUUID(), workspace_id: espacoB.id, nome: randomUUID(), ...extra }, { transaction: t });
  await recusado(criar({ moeda: "USD" }), "SequelizeDatabaseError");
  await recusado(criar({ capital_inicial: 0 }), "SequelizeDatabaseError");
  await recusado(
    (t) => db.CarteiraTrilha.create({ id: randomUUID(), workspace_id: espacoA.id, carteira_id: carteiraA.id, tipo: "IA", calculada: true }, { transaction: t }),
    "SequelizeDatabaseError"
  );
});

test("versões novas numeram em sequência; a rotina lista só os pares (espaço, carteira)", opcoes, async () => {
  const doA = repositorio.forWorkspace(espacoA.id);
  const v2 = await doA.registrarVersao({ carteiraId: carteiraA.id, tipo: "AJUSTE", vigenteDesde: "2026-10-15", parametros: PARAMETROS, motivo: "teste", autorUserId: usuario.id }, { transaction });
  assert.equal(v2.versao, 2);
  const pares = await repositorio.listarAtivasParaRotina({ transaction });
  assert.ok(pares.some((p) => p.workspace_id === espacoA.id && p.id === carteiraA.id));
  assert.deepEqual(Object.keys(pares[0]).sort(), ["id", "workspace_id"]);
});

test("o repositório exige o espaço", opcoes, () => {
  assert.throws(() => repositorio.forWorkspace(null), /espaço é obrigatório/);
});

test("rodada: o espaço B não enxerga a rodada de A, e o banco recusa uma intenção de B na rodada de A", opcoes, async () => {
  const rodadas = require("./carteira-rodada.repository");
  const doA = rodadas.forWorkspace(espacoA.id);
  const [trilhaA] = await repositorio.forWorkspace(espacoA.id).listarTrilhas(carteiraA.id, { transaction });
  const rodada = await doA.criarRodada(
    {
      carteiraId: carteiraA.id,
      data: "2026-10-14",
      decisao: "DECIDIDA",
      leituras: [{ ativo: "MILHO", situacao: "AUSENTE" }],
      intencoes: [{ trilha_id: trilhaA.id, ativo: "MILHO", acao: "NAO_ENTRAR", prioridade: 1, origem: "REGRA", resultado: "SEM_ORDEM" }]
    },
    { transaction }
  );
  assert.equal((await doA.listarPendentes(carteiraA.id, { transaction })).length, 1);
  const doB = rodadas.forWorkspace(espacoB.id);
  assert.equal(await doB.buscarRodada(carteiraA.id, "2026-10-14", { transaction }), null);
  assert.deepEqual(await doB.listarPendentes(carteiraA.id, { transaction }), []);
  assert.deepEqual(await doB.ordensCriadas(rodada.id, { transaction }), []);
  await recusado(
    (t) => db.CarteiraIntencao.create({ id: randomUUID(), workspace_id: espacoB.id, rodada_id: rodada.id, trilha_id: trilhaA.id, ativo: "CAFE", acao: "NAO_ENTRAR", prioridade: 1, origem: "REGRA", resultado: "SEM_ORDEM" }, { transaction: t }),
    "SequelizeForeignKeyConstraintError"
  );
  // Uma rodada por carteira e dia.
  await recusado((t) => doA.criarRodada({ carteiraId: carteiraA.id, data: "2026-10-14", decisao: "SEM_DECISAO" }, { transaction: t }), "SequelizeUniqueConstraintError");
});

test("leitura das telas: o espaço B não enxerga rodadas, posições, ordens nem patrimônio de A, mesmo com os ids", opcoes, async () => {
  const rodadas = require("./carteira-rodada.repository");
  const trilhas = (await repositorio.forWorkspace(espacoA.id).listarTrilhas(carteiraA.id, { transaction })).map((t) => t.id);
  const doA = rodadas.forWorkspace(espacoA.id);
  const doB = rodadas.forWorkspace(espacoB.id);
  assert.ok((await doA.listarRodadas(carteiraA.id, { transaction })).length >= 1);
  await db.CarteiraPatrimonioDiario.create({ id: randomUUID(), workspace_id: espacoA.id, trilha_id: trilhas[0], data: "2026-10-14", patrimonio: 10001 }, { transaction });
  assert.equal((await doA.seriesPatrimonio(trilhas, { transaction })).length, 1);
  assert.deepEqual(await doB.listarRodadas(carteiraA.id, { transaction }), []);
  assert.deepEqual(await doB.listarPosicoes(trilhas, { transaction }), []);
  assert.deepEqual(await doB.listarOrdens(trilhas, { transaction }), []);
  assert.deepEqual(await doB.seriesPatrimonio(trilhas, { transaction }), []);
});

test("recomendação: gravada com a rodada; o espaço B não a enxerga; o banco recusa uma de B na rodada de A", opcoes, async () => {
  const rodadas = require("./carteira-rodada.repository");
  const doA = rodadas.forWorkspace(espacoA.id);
  const doB = rodadas.forWorkspace(espacoB.id);
  const registro = { tipo: "PRINCIPAL", situacao: "FALHA", motivo_falha: "SEM_LEITURAS", respostas: [], tentativas: [] };
  const rodada = await doA.criarRodada({ carteiraId: carteiraA.id, data: "2026-10-15", decisao: "DECIDIDA", recomendacoes: [registro] }, { transaction });
  const [rec] = await doA.listarRecomendacoes(carteiraA.id, { transaction });
  assert.deepEqual([rec.data, rec.tipo, rec.rodada_id], ["2026-10-15", "PRINCIPAL", rodada.id]);
  assert.ok(await doA.buscarRecomendacao(carteiraA.id, rec.id, { transaction }));
  assert.deepEqual(await doB.listarRecomendacoes(carteiraA.id, { transaction }), []);
  assert.equal(await doB.buscarRecomendacao(carteiraA.id, rec.id, { transaction }), null);
  assert.equal(await doB.existeReplicaEntre(carteiraA.id, "2026-10-12", "2026-10-18", { transaction }), false);
  await recusado(
    (t) => db.CarteiraRecomendacao.create({ ...registro, id: randomUUID(), workspace_id: espacoB.id, rodada_id: rodada.id, data: "2026-10-15", tipo: "REPLICA" }, { transaction: t }),
    "SequelizeForeignKeyConstraintError"
  );
  // VALIDA exige as recomendações.
  await recusado(
    (t) => doA.criarRodada({ carteiraId: carteiraA.id, data: "2026-10-16", decisao: "DECIDIDA", recomendacoes: [{ ...registro, situacao: "VALIDA" }] }, { transaction: t }),
    "SequelizeDatabaseError"
  );
});
