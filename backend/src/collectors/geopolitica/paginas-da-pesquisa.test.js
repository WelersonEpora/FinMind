"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverLinks, paginasDoTrecho } = require("./paginas-da-pesquisa");

// Formato real do grounding do Gemini (leitura de 2026-10-02, reduzido). Nenhum teste chama o Google.
function groundingReal() {
  return {
    groundingChunks: [
      { web: { title: "ukmto.org", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ukmto" } },
      { web: { title: "treasury.gov", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/tesouro" } },
      { web: { title: "apnews.com", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/quebrado" } }
    ],
    groundingSupports: [
      { segment: { text: "EVENTO 2\nTítulo: Ataque a navio petroleiro no Estreito de Ormuz" }, groundingChunkIndices: [0] },
      { segment: { text: "Ação regulatória e sanções dos EUA contra ampla rede bancária" }, groundingChunkIndices: [1, 2] },
      { segment: { text: "OURO" }, groundingChunkIndices: [0, 1, 2] }
    ]
  };
}

const DESTINOS = {
  "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ukmto":
    "https://www.ukmto.org/-/media/ukmto/products/2026101-ukmto_warning-147-26.pdf",
  "https://vertexaisearch.cloud.google.com/grounding-api-redirect/tesouro": "https://home.treasury.gov/news/press-releases/sb0644"
};

async function fetchFalso(url, opcoes) {
  assert.equal(opcoes.redirect, "manual");
  if (!DESTINOS[url]) throw new Error("rede");
  return { status: 302, headers: { get: (nome) => (nome === "location" ? DESTINOS[url] : null) } };
}

test("resolverLinks: grava a URL final de cada página; link que falha fica null", async () => {
  const grounding = await resolverLinks(groundingReal(), { fetchFn: fetchFalso });
  assert.deepEqual(
    grounding.groundingChunks.map((c) => c.web.urlFinal),
    ["https://www.ukmto.org/-/media/ukmto/products/2026101-ukmto_warning-147-26.pdf", "https://home.treasury.gov/news/press-releases/sb0644", null]
  );
  assert.equal(await resolverLinks(null, { fetchFn: fetchFalso }), null);
});

test("paginasDoTrecho: páginas que apoiam trechos do bloco; trecho curto ('OURO') não conta", async () => {
  const grounding = await resolverLinks(groundingReal(), { fetchFn: fetchFalso });
  const bloco = "EVENTO 2\nTítulo: Ataque a navio petroleiro no Estreito de Ormuz reacende riscos\nResumo: ...";
  assert.deepEqual(paginasDoTrecho(bloco, grounding), [
    { site: "ukmto.org", url: "https://www.ukmto.org/-/media/ukmto/products/2026101-ukmto_warning-147-26.pdf" }
  ]);
  // A página da AP não resolveu (null): fica de fora.
  const blocoTesouro = "EVENTO 3\nTítulo: Ação regulatória e sanções dos EUA contra ampla rede bancária paralela";
  assert.deepEqual(paginasDoTrecho(blocoTesouro, grounding).map((p) => p.site), ["treasury.gov"]);
  assert.deepEqual(paginasDoTrecho("EVENTO 9\nTítulo: outra coisa", grounding), []);
  assert.deepEqual(paginasDoTrecho("qualquer", null), []);
});
