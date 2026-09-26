"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { CollectionExecution } = require("../models");
const collectionExecutionRepository = require("./collection-execution.repository");

afterEach(() => mock.restoreAll());

test("listar: filtro 'coletor' busca por PARTE do nome, sem distinção de maiúsculas (iLike), não o código exato", async () => {
  const findAndCountAll = mock.method(CollectionExecution, "findAndCountAll", async () => ({ rows: [], count: 0 }));

  await collectionExecutionRepository.listar({ coletor: "imea", pagina: 1, tamanhoPagina: 20 });

  const { where } = findAndCountAll.mock.calls[0].arguments[0];
  assert.deepEqual(where.collector_code, { [Op.iLike]: "%imea%" });
});

test("listar: sem filtro de coletor, a cláusula where não menciona collector_code", async () => {
  const findAndCountAll = mock.method(CollectionExecution, "findAndCountAll", async () => ({ rows: [], count: 0 }));

  await collectionExecutionRepository.listar({ pagina: 1, tamanhoPagina: 20 });

  const { where } = findAndCountAll.mock.calls[0].arguments[0];
  assert.equal("collector_code" in where, false);
});
