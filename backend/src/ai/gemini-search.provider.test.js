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

const CONFIG = { apiKeyFree: "chave-gratuita", apiKey: "chave-paga", model: "gemini-flash-latest", timeoutMs: 60000 };
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

test("carregarPrompt: o prompt dos eventos de mercado tem versão, instrução fixa e todos os placeholders preenchidos", () => {
  const { versao, instrucaoDoSistema, prompt } = carregarPrompt("geopolitica-diaria.md", {
    data_referencia: "2026-10-01",
    ativos: "MILHO e CAFÉ",
    piso: "- MILHO: x",
    fontes_confiaveis: "- A",
    tipos: "- T",
    fatores: "- F",
    sugestoes_busca: "- C",
    eventos_recentes: "- 05/10 (MILHO): R"
  });
  assert.equal(versao, "geopolitica-diaria@14");
  assert.match(prompt, /Eventos já registrados nos últimos dias \(não repita; só um desdobramento novo\):\n- 05\/10 \(MILHO\): R/);
  assert.doesNotMatch(instrucaoDoSistema, /\{\{/);
  // A instrução é a mesma para as duas chamadas: o exemplo de formato e a seção EVENTOS; os ativos vêm do prompt.
  assert.match(instrucaoDoSistema, /^PETRÓLEO$/m);
  assert.match(instrucaoDoSistema, /^EVENTOS$/m);
  assert.match(instrucaoDoSistema, /ATIVOS DESTA CHAMADA/);
  assert.match(prompt, /Ativos desta chamada: MILHO e CAFÉ/);
  assert.doesNotMatch(prompt, /\{\{/);
  assert.throws(() => carregarPrompt("geopolitica-diaria.md", { data_referencia: "x" }), /falta o valor/);
});

test("chaves: as duas falham - a mensagem diz o que cada uma respondeu", async () => {
  const { fetchFn, chaves } = fetchEmSequencia([429, 429]);
  await assert.rejects(pesquisar(fetchFn), /As duas chaves falharam\. Tentativas: gratuita: status 429 em 0\.0 s; paga: status 429 em 0\.0 s/);
  assert.deepEqual(chaves, ["chave-gratuita", "chave-paga"]);
});

// Relógio falso: cada chamada ao fetch consome `ms` do passo dela; as esperas entre tentativas também avançam o relógio.
function relogioFalso(passos) {
  let agora = 0;
  const chaves = [];
  const deps = {
    fetch: async (_url, opcoes) => {
      chaves.push(opcoes.headers["x-goog-api-key"]);
      const { ms, status } = passos[chaves.length - 1];
      agora += ms;
      if (status === "timeout") {
        const erro = new Error("timeout");
        erro.name = "TimeoutError";
        throw erro;
      }
      return respostaHttp(status, status === 200 ? RESPOSTA_OK : { error: { code: status } });
    },
    gemini: CONFIG,
    agora: () => agora,
    esperar: async (ms) => {
      agora += ms;
    }
  };
  return { deps, chaves };
}

test("chaves (2026-10-07): a gratuita sem resposta até o fim da janela passa a vez para a paga; as tentativas ficam registradas", async () => {
  const { deps, chaves } = relogioFalso([
    { ms: 60000, status: "timeout" },
    { ms: 54000, status: 200 }
  ]);
  const resposta = await provedor.gerarJson({ systemInstruction: "s", prompt: "p" }, deps);
  assert.deepEqual(chaves, ["chave-gratuita", "chave-paga"]);
  assert.equal(resposta.chave, "paga");
  assert.deepEqual(resposta.tentativas, [
    { chave: "gratuita", resultado: "sem resposta", segundos: 60 },
    { chave: "paga", resultado: "ok", segundos: 54 }
  ]);
});

test("chaves (2026-10-07): o 5xx só se repete na mesma chave enquanto sobra janela; depois vai para a paga", async () => {
  // A gratuita segura 50 s e responde 503: depois da 1ª espera (2 s) sobram 8 s da janela de 60 s, e ela tenta de
  // novo; na 2ª, a janela acabou e a vez passa para a paga, sem a 3ª tentativa.
  const { deps, chaves } = relogioFalso([
    { ms: 50000, status: 503 },
    { ms: 8000, status: 503 },
    { ms: 1000, status: 200 }
  ]);
  const resposta = await provedor.gerarJson({ systemInstruction: "s", prompt: "p" }, deps);
  assert.deepEqual(chaves, ["chave-gratuita", "chave-gratuita", "chave-paga"]);
  assert.deepEqual(
    resposta.tentativas.map((t) => t.resultado),
    ["status 503", "status 503", "ok"]
  );
});

test("chaves: só uma chave e ela fica sem resposta - o erro diz as tentativas", async () => {
  const { deps } = relogioFalso([{ ms: 60000, status: "timeout" }]);
  await assert.rejects(
    provedor.gerarJson({ systemInstruction: "s", prompt: "p" }, { ...deps, gemini: { ...CONFIG, apiKey: "" } }),
    /não respondeu em 60000 ms\. Tentativas: gratuita: sem resposta em 60\.0 s\./
  );
});

test("gerarJson (ADR 0052): sem busca, com a resposta em JSON; mesma ordem de chaves; sem grounding", async () => {
  const corpos = [];
  const { fetchFn, chaves } = fetchEmSequencia([429, 200]);
  const resposta = await provedor.gerarJson(
    { systemInstruction: "s", prompt: "p" },
    {
      fetch: async (url, opcoes) => {
        corpos.push(JSON.parse(opcoes.body));
        return fetchFn(url, opcoes);
      },
      gemini: CONFIG,
      esperar: SEM_ESPERA
    }
  );
  assert.equal(corpos[0].tools, undefined);
  assert.deepEqual(corpos[0].generationConfig, { responseMimeType: "application/json" });
  assert.deepEqual(chaves, ["chave-gratuita", "chave-paga"]);
  assert.equal(resposta.chave, "paga");
  assert.equal(resposta.modelo, "gemini-2.5-flash");
  assert.equal("grounding" in resposta, false);
});
