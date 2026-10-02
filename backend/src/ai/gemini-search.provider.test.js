"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const provedor = require("./gemini-search.provider");
const { carregarPrompt } = require("./carregar-prompt");

const CONFIG = { apiKeyFree: "chave-gratuita", apiKey: "chave-paga", model: "gemini-flash-latest", timeoutMs: 1000 };
const SEM_ESPERA = async () => {};

const RESPOSTA_OK = {
  modelVersion: "gemini-2.5-flash",
  candidates: [{ content: { parts: [{ text: "OURO\nNível: NORMAL" }] } }]
};

// fetch falso que responde, em ordem, um status por chamada e registra a chave usada em cada uma.
function fetchEmSequencia(statuses) {
  const chaves = [];
  const fetchFn = async (_url, opcoes) => {
    chaves.push(opcoes.headers["x-goog-api-key"]);
    const status = statuses[chaves.length - 1];
    return respostaHttp(status, status === 200 ? RESPOSTA_OK : { error: { code: status } });
  };
  return { fetchFn, chaves };
}

async function pesquisar(fetchFn, config = CONFIG) {
  return provedor.pesquisarNaWeb({ systemInstruction: "s", prompt: "p" }, { fetch: fetchFn, gemini: config, esperar: SEM_ESPERA });
}

function respostaHttp(status, corpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
    text: async () => JSON.stringify(corpo)
  };
}

test("pesquisarNaWeb: uma chamada com a busca do Google ligada e sem saída estruturada; devolve texto, grounding e tokens", async () => {
  const chamadas = [];
  const fetchFalso = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return respostaHttp(200, {
      modelVersion: "gemini-2.5-flash",
      usageMetadata: { totalTokenCount: 4321 },
      candidates: [
        {
          content: { parts: [{ text: "pensando...", thought: true }, { text: "OURO\n" }, { text: "Nível: NORMAL" }] },
          groundingMetadata: { webSearchQueries: ["site:reuters.com gold"] }
        }
      ]
    });
  };

  const resultado = await provedor.pesquisarNaWeb({ systemInstruction: "sis", prompt: "p" }, { fetch: fetchFalso, gemini: CONFIG });

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
  assert.equal(chamadas[0].opcoes.headers["x-goog-api-key"], "chave-gratuita");
  assert.equal(resultado.chave, "gratuita");
  const corpo = JSON.parse(chamadas[0].opcoes.body);
  assert.deepEqual(corpo.tools, [{ google_search: {} }]);
  assert.equal(corpo.generationConfig, undefined);
  assert.equal(corpo.systemInstruction.parts[0].text, "sis");

  assert.equal(resultado.texto, "OURO\nNível: NORMAL");
  assert.deepEqual(resultado.grounding, { webSearchQueries: ["site:reuters.com gold"] });
  assert.equal(resultado.modelo, "gemini-2.5-flash");
  assert.equal(resultado.tokens, 4321);
});

test("chaves: a gratuita esgota a cota (429) e a mesma chamada é refeita com a paga", async () => {
  const { fetchFn, chaves } = fetchEmSequencia([429, 200]);
  const resultado = await pesquisar(fetchFn);
  assert.deepEqual(chaves, ["chave-gratuita", "chave-paga"]);
  assert.equal(resultado.chave, "paga");
});

test("chaves: 5xx repete 3 vezes na gratuita antes de passar para a paga; um 5xx passageiro não gasta a paga", async () => {
  const persistente = fetchEmSequencia([503, 503, 503, 200]);
  assert.equal((await pesquisar(persistente.fetchFn)).chave, "paga");
  assert.deepEqual(persistente.chaves, ["chave-gratuita", "chave-gratuita", "chave-gratuita", "chave-paga"]);

  const passageiro = fetchEmSequencia([503, 200]);
  assert.equal((await pesquisar(passageiro.fetchFn)).chave, "gratuita");
  assert.deepEqual(passageiro.chaves, ["chave-gratuita", "chave-gratuita"]);
});

test("chaves: outro erro (ex.: chave inválida) não gasta a paga; sem a gratuita vai direto na paga", async () => {
  const invalida = fetchEmSequencia([400]);
  await assert.rejects(pesquisar(invalida.fetchFn), /status 400/);
  assert.deepEqual(invalida.chaves, ["chave-gratuita"]);

  const soPaga = fetchEmSequencia([200]);
  assert.equal((await pesquisar(soPaga.fetchFn, { ...CONFIG, apiKeyFree: "" })).chave, "paga");
  assert.deepEqual(soPaga.chaves, ["chave-paga"]);

  // Só a gratuita: o 429 aparece, não há para onde cair.
  const soGratuita = fetchEmSequencia([429]);
  await assert.rejects(pesquisar(soGratuita.fetchFn, { ...CONFIG, apiKey: "" }), /status 429/);
});

test("pesquisarNaWeb: resposta vazia e nenhuma chave viram erro explícito", async () => {
  await assert.rejects(
    pesquisar(async () => respostaHttp(200, { candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] })),
    /resposta vazia \(finishReason: SAFETY\)/
  );
  await assert.rejects(pesquisar(async () => respostaHttp(200, RESPOSTA_OK), { ...CONFIG, apiKeyFree: "", apiKey: "" }), /GEMINI_API_KEY_FREE e GEMINI_API_KEY/);
});

test("carregarPrompt: o prompt da geopolítica tem versão, instrução fixa e todos os placeholders preenchidos", () => {
  const { versao, instrucaoDoSistema, prompt } = carregarPrompt("geopolitica-diaria.md", {
    data_referencia: "2026-10-01",
    fontes_confiaveis: "- A",
    sugestoes_busca: "- C"
  });
  assert.equal(versao, "geopolitica-diaria@6");
  assert.doesNotMatch(instrucaoDoSistema, /\{\{/);
  assert.match(instrucaoDoSistema, /^OURO$/m);
  assert.match(instrucaoDoSistema, /^PETRÓLEO$/m);
  assert.doesNotMatch(prompt, /\{\{/);
  assert.throws(() => carregarPrompt("geopolitica-diaria.md", { data_referencia: "x" }), /falta o valor/);
});

test("chaves: as duas falham - a mensagem diz o que cada uma respondeu", async () => {
  const { fetchFn, chaves } = fetchEmSequencia([429, 429]);
  await assert.rejects(pesquisar(fetchFn), /Chave gratuita: status 429\. Chave paga: status 429/);
  assert.deepEqual(chaves, ["chave-gratuita", "chave-paga"]);
});
