"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
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

test("obterExecucao traz os avisos da fonte do metadata (lista vazia quando não há)", async () => {
  const aviso = { item: { local: "TANGARA_DA_SERRA" }, motivo: "rótulo repetido na fonte" };
  const comAviso = await coletasService.obterExecucao("exec-1", {
    collectionExecutionRepository: { buscarPorId: async () => ({ ...execucaoFake, metadata: { invalidos: [], avisos: [aviso] } }) }
  });
  assert.deepEqual(comAviso.execucao.avisos, [aviso]);

  const semAviso = await coletasService.obterExecucao("exec-1", { collectionExecutionRepository: { buscarPorId: async () => execucaoFake } });
  assert.deepEqual(semAviso.execucao.avisos, []);
});

test("obterExecucao traz os detalhes do coletor (ex.: IA) do metadata; null quando não há", async () => {
  const detalhes = { ia: { chave: "gratuita", modelo: "gemini-3.8-flash", tokens: 7096, buscas: 4, paginasLidas: 8 } };
  const comDetalhes = await coletasService.obterExecucao("exec-1", {
    collectionExecutionRepository: { buscarPorId: async () => ({ ...execucaoFake, metadata: { invalidos: [], detalhes } }) }
  });
  assert.deepEqual(comDetalhes.execucao.detalhes, detalhes);

  const semDetalhes = await coletasService.obterExecucao("exec-1", { collectionExecutionRepository: { buscarPorId: async () => execucaoFake } });
  assert.equal(semDetalhes.execucao.detalhes, null);
});

function depsDeTeste(execucoesRegistradas, { antesDeTerminar } = {}) {
  return {
    collectionExecutionRepository: {
      async criar(dados) {
        const execucao = { id: `exec-${execucoesRegistradas.length + 1}`, ...dados };
        execucoesRegistradas.push(execucao);
        return execucao;
      },
      async atualizar(execucao, dados) {
        if (antesDeTerminar) await antesDeTerminar;
        Object.assign(execucao, dados);
        return execucao;
      }
    },
    logger: { child: () => ({ info: () => {}, error: () => {}, warn: () => {} }), error: () => {} }
  };
}

test("iniciarColetaManual responde na hora e roda os coletores em segundo plano", async () => {
  registerCollector({
    codigo: "coletor-fake-teste",
    download: async () => [{ valor: 1 }],
    parse: (rawData) => rawData,
    normalize: (rawItems) => ({ validos: rawItems, invalidos: [] }),
    persist: async (validos) => ({ criados: validos.length, atualizados: 0, ignorados: 0, falhas: [] })
  });

  let liberar;
  const antesDeTerminar = new Promise((resolve) => (liberar = resolve));
  const execucoesRegistradas = [];

  const { coleta, concluida } = coletasService.iniciarColetaManual("user-1", depsDeTeste(execucoesRegistradas, { antesDeTerminar }));

  assert.equal(coleta.status, "iniciada");
  assert.ok(coleta.coletores.includes("coletor-fake-teste"));

  liberar();
  await concluida;
  const execucao = execucoesRegistradas.find((e) => e.collector_code === "coletor-fake-teste");
  assert.equal(execucao.trigger_type, "manual");
  assert.equal(execucao.triggered_by, "user-1");
  assert.equal(execucao.status, "success");
});

test("iniciarColetaManual recusa (409) um segundo pedido enquanto a primeira coleta roda, e libera ao terminar", async () => {
  let liberar;
  const antesDeTerminar = new Promise((resolve) => (liberar = resolve));
  const execucoesRegistradas = [];

  const primeira = coletasService.iniciarColetaManual("user-1", depsDeTeste(execucoesRegistradas, { antesDeTerminar }));

  assert.throws(() => coletasService.iniciarColetaManual("user-2", depsDeTeste([])), (err) => err.statusCode === 409);

  liberar();
  await primeira.concluida;

  const segunda = coletasService.iniciarColetaManual("user-2", depsDeTeste([]));
  assert.equal(segunda.coleta.status, "iniciada");
  await segunda.concluida;
});
