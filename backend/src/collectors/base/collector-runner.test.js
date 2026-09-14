"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { executarColetor } = require("./collector-runner");

function criarRepoFake() {
  const execucoes = [];
  return {
    execucoes,
    async criar(dados) {
      const execucao = { id: `exec-${execucoes.length + 1}`, ...dados };
      execucoes.push(execucao);
      return execucao;
    },
    async atualizar(execucao, dados) {
      Object.assign(execucao, dados);
      return execucao;
    }
  };
}

const logSilencioso = {
  child: () => ({ info: () => {}, error: () => {}, warn: () => {} })
};

test("executarColetor marca a execução como success quando tudo é válido", async () => {
  const repo = criarRepoFake();
  const collector = {
    codigo: "coletor-teste",
    download: async () => [{ valor: 1 }, { valor: 2 }],
    parse: (rawData) => rawData,
    normalize: (rawItems) => ({ validos: rawItems, invalidos: [] }),
    persist: async (validos) => ({ criados: validos.length, atualizados: 0, ignorados: 0, falhas: [] })
  };

  const execucao = await executarColetor(collector, { triggerType: "manual" }, { collectionExecutionRepository: repo, logger: logSilencioso });

  assert.equal(execucao.status, "success");
  assert.equal(execucao.records_read, 2);
  assert.equal(execucao.records_created, 2);
  assert.equal(execucao.records_failed, 0);
});

test("executarColetor marca partial_success quando alguns itens são inválidos mas outros persistem", async () => {
  const repo = criarRepoFake();
  const collector = {
    codigo: "coletor-teste",
    download: async () => [{ valor: 1 }, { valor: "inválido" }],
    parse: (rawData) => rawData,
    normalize: (rawItems) => ({
      validos: rawItems.filter((i) => i.valor === 1),
      invalidos: rawItems.filter((i) => i.valor !== 1).map((item) => ({ item, motivo: "valor inválido" }))
    }),
    persist: async (validos) => ({ criados: validos.length, atualizados: 0, ignorados: 0, falhas: [] })
  };

  const execucao = await executarColetor(collector, {}, { collectionExecutionRepository: repo, logger: logSilencioso });

  assert.equal(execucao.status, "partial_success");
  assert.equal(execucao.records_created, 1);
  assert.equal(execucao.records_failed, 1);
});

test("executarColetor marca failed quando nenhum item válido persiste", async () => {
  const repo = criarRepoFake();
  const collector = {
    codigo: "coletor-teste",
    download: async () => [{ valor: "inválido" }],
    parse: (rawData) => rawData,
    normalize: (rawItems) => ({ validos: [], invalidos: rawItems.map((item) => ({ item, motivo: "valor inválido" })) }),
    persist: async () => ({ criados: 0, atualizados: 0, ignorados: 0, falhas: [] })
  };

  const execucao = await executarColetor(collector, {}, { collectionExecutionRepository: repo, logger: logSilencioso });

  assert.equal(execucao.status, "failed");
  assert.equal(execucao.records_failed, 1);
});

test("executarColetor marca failed com mensagem de erro quando o download falha", async () => {
  const repo = criarRepoFake();
  const collector = {
    codigo: "coletor-teste",
    timeoutMs: 50,
    tentativasRetry: 1,
    download: async () => {
      throw new Error("timeout de rede");
    },
    parse: (rawData) => rawData,
    normalize: (rawItems) => ({ validos: rawItems, invalidos: [] }),
    persist: async () => ({ criados: 0, atualizados: 0, ignorados: 0, falhas: [] })
  };

  const execucao = await executarColetor(collector, {}, { collectionExecutionRepository: repo, logger: logSilencioso });

  assert.equal(execucao.status, "failed");
  assert.match(execucao.error_message, /timeout de rede/);
});

test("executarColetor dá a cada tentativa de retry um AbortController próprio (uma tentativa anterior abortada não contamina as seguintes)", async () => {
  const repo = criarRepoFake();
  const sinaisRecebidos = [];
  let chamadas = 0;

  const collector = {
    codigo: "coletor-teste",
    timeoutMs: 20,
    tentativasRetry: 2,
    download: async ({ signal }) => {
      chamadas += 1;
      sinaisRecebidos.push(signal.aborted);

      if (chamadas === 1) {
        // Primeira tentativa "trava" além do timeout configurado (20ms).
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (signal.aborted) throw new Error("aborted");
      }

      return [];
    },
    parse: (rawData) => rawData,
    normalize: () => ({ validos: [], invalidos: [] }),
    persist: async () => ({ criados: 0, atualizados: 0, ignorados: 0, falhas: [] })
  };

  const execucao = await executarColetor(collector, {}, { collectionExecutionRepository: repo, logger: logSilencioso });

  assert.equal(chamadas, 2);
  // Nenhuma tentativa recebe um signal já abortado no início - se o bug do
  // AbortController compartilhado voltasse, a segunda tentativa nasceria
  // com signal.aborted === true.
  assert.deepEqual(sinaisRecebidos, [false, false]);
  assert.equal(execucao.status, "success");
});
