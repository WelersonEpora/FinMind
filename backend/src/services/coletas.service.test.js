"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletasService = require("./coletas.service");
const { registerCollector } = require("../collectors/base/collector.interface");

const execucaoFake = {
  id: "exec-1",
  collector_code: "bcb-usd-brl-venda",
  trigger_type: "manual",
  status: "success",
  started_at: new Date("2026-09-12T10:00:00.000Z"),
  finished_at: new Date("2026-09-12T10:00:01.000Z"),
  duration_ms: 1000,
  records_read: 1,
  records_created: 1,
  records_updated: 0,
  records_skipped: 0,
  records_failed: 0,
  error_message: null
};

test("listarExecucoes mapeia execuções e paginação", async () => {
  const deps = {
    collectionExecutionRepository: {
      listar: async () => ({ registros: [execucaoFake], total: 1 })
    }
  };

  const resultado = await coletasService.listarExecucoes({ pagina: 1, tamanhoPagina: 20 }, deps);

  assert.equal(resultado.execucoes.length, 1);
  assert.equal(resultado.execucoes[0].coletor, "bcb-usd-brl-venda");
  assert.deepEqual(resultado.execucoes[0].registros, { lidos: 1, criados: 1, atualizados: 0, ignorados: 0, falhos: 0 });
  assert.deepEqual(resultado.paginacao, { pagina: 1, tamanhoPagina: 20, total: 1, totalPaginas: 1 });
});

test("listarExecucoes rejeita ordenarPor fora da lista permitida", async () => {
  const deps = { collectionExecutionRepository: { listar: async () => ({ registros: [], total: 0 }) } };

  await assert.rejects(() => coletasService.listarExecucoes({ ordenarPor: "coletor" }, deps), /ordenarPor/);
});

test("listarExecucoes repassa ordenarPor/ordem validados pro repository", async () => {
  let chamadaCom;
  const deps = {
    collectionExecutionRepository: {
      listar: async (args) => {
        chamadaCom = args;
        return { registros: [], total: 0 };
      }
    }
  };

  await coletasService.listarExecucoes({ ordenarPor: "duracaoMs", ordem: "asc" }, deps);

  assert.equal(chamadaCom.ordenarPor, "duracaoMs");
  assert.equal(chamadaCom.ordem, "ASC");
});

test("obterExecucao lança NotFoundError quando a execução não existe", async () => {
  const deps = { collectionExecutionRepository: { buscarPorId: async () => null } };

  await assert.rejects(() => coletasService.obterExecucao("inexistente", deps), /não encontrada/);
});

test("obterExecucao retorna a execução mapeada quando encontrada", async () => {
  const deps = { collectionExecutionRepository: { buscarPorId: async () => execucaoFake } };

  const resultado = await coletasService.obterExecucao("exec-1", deps);

  assert.equal(resultado.execucao.id, "exec-1");
  assert.equal(resultado.execucao.status, "success");
});

test("executarColetaManual roda todos os coletores registrados e retorna as execuções", async () => {
  registerCollector({
    codigo: "coletor-fake-teste",
    download: async () => [{ valor: 1 }],
    parse: (rawData) => rawData,
    normalize: (rawItems) => ({ validos: rawItems, invalidos: [] }),
    persist: async (validos) => ({ criados: validos.length, atualizados: 0, ignorados: 0, falhas: [] })
  });

  const execucoesRegistradas = [];
  const deps = {
    collectionExecutionRepository: {
      async criar(dados) {
        const execucao = { id: "exec-x", ...dados };
        execucoesRegistradas.push(execucao);
        return execucao;
      },
      async atualizar(execucao, dados) {
        Object.assign(execucao, dados);
        return execucao;
      }
    },
    logger: { child: () => ({ info: () => {}, error: () => {}, warn: () => {} }) }
  };

  const resultado = await coletasService.executarColetaManual("user-1", deps);

  assert.ok(resultado.execucoes.some((e) => e.coletor === "coletor-fake-teste"));
  assert.equal(execucoesRegistradas[0].trigger_type, "manual");
  assert.equal(execucoesRegistradas[0].triggered_by, "user-1");
});
