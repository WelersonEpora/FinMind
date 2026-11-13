"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("./configuracao-ia.service");
const { cifrar } = require("../shared/utils/cifra");

const MESTRE = "segredo-mestre-de-teste";

function ambiente({ segredoMestre = MESTRE, statusTeste = 200 } = {}) {
  const linhas = new Map();
  const pedidosTeste = [];
  const deps = {
    segredoMestre,
    logger: { warn() {} },
    systemSettingRepository: {
      obter: async (chave) => linhas.get(chave) ?? null,
      gravar: async (chave, value) => linhas.set(chave, { key: chave, value, updated_at: "2026-11-13T10:00:00Z" }),
      remover: async (chave) => linhas.delete(chave)
    },
    userRepository: { findById: async (id) => (id === "u1" ? { name: "Admin" } : null) },
    fetch: async (url, opcoes) => {
      pedidosTeste.push(opcoes.headers["x-goog-api-key"]);
      return { ok: statusTeste === 200, status: statusTeste };
    }
  };
  return { deps, linhas, pedidosTeste };
}

test("salvar testa a chave no Gemini, guarda cifrada e a situação só mostra o final", async () => {
  const { deps, linhas, pedidosTeste } = ambiente();
  const situacao = await service.salvarChave("paga", "  AIzaChavePaga1234 ", "u1", deps);

  assert.deepEqual(pedidosTeste, ["AIzaChavePaga1234"]);
  assert.ok(!linhas.get("gemini.api_key").value.includes("AIzaChavePaga1234"));
  assert.deepEqual(situacao.chaves.paga, { configurada: true, final: "1234", atualizadaEm: "2026-11-13T10:00:00Z", atualizadaPor: "Admin" });
  assert.deepEqual(situacao.chaves.gratuita, { configurada: false });
  assert.equal(JSON.stringify(situacao).includes("AIzaChavePaga1234"), false);
});

test("a configuração do provedor traz as chaves decifradas do banco", async () => {
  const { deps } = ambiente();
  await service.salvarChave("gratuita", "chave-gratuita", "u1", deps);
  await service.salvarChave("paga", "chave-paga", "u1", deps);
  const config = await service.obterConfigGemini(deps);
  assert.deepEqual([config.apiKeyFree, config.apiKey], ["chave-gratuita", "chave-paga"]);
  assert.ok(config.model && config.timeoutMs);
});

test("sem chave no banco não há chave, nem do .env", async () => {
  const { deps } = ambiente();
  const config = await service.obterConfigGemini(deps);
  assert.deepEqual([config.apiKeyFree, config.apiKey], ["", ""]);
  assert.equal(await service.temChave(deps), false);
});

test("chave cifrada com outro segredo mestre não abre: fica como sem chave", async () => {
  const { deps, linhas } = ambiente();
  linhas.set("gemini.api_key", { value: JSON.stringify({ cifrado: cifrar("chave", "outro-mestre"), final: "have" }) });
  const config = await service.obterConfigGemini(deps);
  assert.equal(config.apiKey, "");
});

test("chave recusada pelo Gemini não é gravada", async () => {
  const { deps, linhas } = ambiente({ statusTeste: 400 });
  await assert.rejects(service.salvarChave("paga", "chave-ruim", "u1", deps), { code: "VALIDATION_ERROR" });
  assert.equal(linhas.size, 0);
});

test("sem CONFIG_ENCRYPTION_KEY a chave não é gravada", async () => {
  const { deps, pedidosTeste } = ambiente({ segredoMestre: "" });
  await assert.rejects(service.salvarChave("paga", "chave", "u1", deps), { code: "NOT_CONFIGURED" });
  assert.equal(pedidosTeste.length, 0);
});

test("tipo desconhecido e chave vazia são recusados", async () => {
  const { deps } = ambiente();
  await assert.rejects(service.salvarChave("outra", "chave", "u1", deps), { code: "VALIDATION_ERROR" });
  await assert.rejects(service.salvarChave("paga", "   ", "u1", deps), { code: "VALIDATION_ERROR" });
});

test("remover tira a chave", async () => {
  const { deps } = ambiente();
  await service.salvarChave("paga", "chave-paga", "u1", deps);
  const situacao = await service.removerChave("paga", deps);
  assert.equal(situacao.chaves.paga.configurada, false);
});
