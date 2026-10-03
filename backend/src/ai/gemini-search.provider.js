"use strict";

const env = require("../config/env");
const { NotConfiguredError, UpstreamServiceError } = require("../shared/errors");

// Primeiro provedor real de IA do FinMind (ADR 0047): o Gemini com busca na web (Google Search grounding), pela API
// REST, sem SDK. Usado pela leitura diária de eventos (`pesquisarNaWeb`) e pela leitura diária de tendência do
// petróleo (`gerarJson`, ADR 0052). Mesmo padrão do AgroMind (ADRs 0026 e 0027 de lá): com a busca, UMA chamada,
// resposta em TEXTO com rótulos fixos e nada de saída estruturada (JSON) junto - lá, o JSON com a busca desligava o
// grounding sem erro ou vazava o raciocínio do modelo para dentro das strings. Sem a busca, o JSON não tem esse problema.
//
// DUAS CHAVES (também como no AgroMind, ADR 0024 de lá): a gratuita é tentada primeiro; a paga só entra quando a
// gratuita esgota a cota (429) ou continua com 5xx depois das tentativas locais. No AgroMind, o tier gratuito levou
// 503 em 6 de 6 execuções de um dia enquanto a mesma chamada com a chave paga passava na hora: o Google tira a
// prioridade do gratuito sob carga. Outros erros (chave inválida, rede, timeout) não gastam a chave paga. Com uma só
// chave configurada, usa essa.
//
// Devolve a resposta como veio: quem interpreta o texto é o parser do coletor. A IA nunca decide nada aqui (ver
// README desta pasta).

const URL_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Tentativas com a MESMA chave num 5xx (sobrecarga momentânea), com estas esperas entre elas.
const ESPERAS_ERRO_TRANSITORIO_MS = [2000, 5000];

function esperarPadrao(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function eTransitorio(erro) {
  return erro.statusGemini >= 500 && erro.statusGemini < 600;
}

// Só o texto da resposta: partes marcadas como raciocínio ("thought") ficam de fora.
function extrairTexto(candidato) {
  const partes = candidato?.content?.parts || [];
  return partes
    .filter((parte) => !parte.thought && typeof parte.text === "string")
    .map((parte) => parte.text)
    .join("");
}

// Uma requisição com uma chave. O timeout é desta chamada; o `signal` de fora (o do coletor) também a interrompe.
async function chamar({ apiKey, corpo, signal }, { config, fetchFn }) {
  const sinais = [AbortSignal.timeout(config.timeoutMs), signal].filter(Boolean);
  let resposta;
  try {
    resposta = await fetchFn(`${URL_BASE}/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: "POST",
      signal: AbortSignal.any(sinais),
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: corpo
    });
  } catch (err) {
    if (err.name === "TimeoutError") throw new UpstreamServiceError(`Gemini não respondeu em ${config.timeoutMs} ms.`);
    throw err;
  }
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    const erro = new UpstreamServiceError(`Gemini respondeu com status ${resposta.status}: ${texto.slice(0, 300)}`);
    erro.statusGemini = resposta.status;
    throw erro;
  }
  return resposta.json();
}

async function chamarComRetry(entrada, contexto) {
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      return await chamar(entrada, contexto);
    } catch (erro) {
      if (!eTransitorio(erro) || tentativa >= ESPERAS_ERRO_TRANSITORIO_MS.length) throw erro;
      await contexto.esperar(ESPERAS_ERRO_TRANSITORIO_MS[tentativa]);
    }
  }
}

// Ordem das chaves: a gratuita primeiro, a paga como reserva. [{ chave: "gratuita"|"paga", apiKey }].
function chavesEmOrdem(config) {
  return [
    config.apiKeyFree && { chave: "gratuita", apiKey: config.apiKeyFree },
    config.apiKey && { chave: "paga", apiKey: config.apiKey }
  ].filter(Boolean);
}

// Uma chamada com as duas chaves (a gratuita primeiro, a paga como reserva): o JSON da resposta e a chave que respondeu.
async function chamarComChaves(corpo, { signal }, deps) {
  const config = deps.gemini || env.gemini;
  const contexto = { config, fetchFn: deps.fetch || fetch, esperar: deps.esperar || esperarPadrao };
  const chaves = chavesEmOrdem(config);
  if (chaves.length === 0) {
    throw new NotConfiguredError("GEMINI_API_KEY_FREE e GEMINI_API_KEY não definidas: o Gemini está desligado.");
  }

  let chaveUsada = chaves[0];
  let json;
  try {
    json = await chamarComRetry({ apiKey: chaveUsada.apiKey, corpo, signal }, contexto);
  } catch (erro) {
    const podeUsarAPaga = chaves.length > 1 && (erro.statusGemini === 429 || eTransitorio(erro));
    if (!podeUsarAPaga) throw erro;
    chaveUsada = chaves[1];
    try {
      json = await chamarComRetry({ apiKey: chaveUsada.apiKey, corpo, signal }, contexto);
    } catch (erroPaga) {
      // As duas falharam: a mensagem diz o que cada chave respondeu (no registro da execução, sem isso, não dá para
      // saber se a paga chegou a ser tentada).
      const falha = new UpstreamServiceError(
        `Chave gratuita: status ${erro.statusGemini}. Chave paga: ${erroPaga.statusGemini ? `status ${erroPaga.statusGemini}` : "erro"} - ${erroPaga.message}`
      );
      falha.statusGemini = erroPaga.statusGemini;
      throw falha;
    }
  }

  const candidato = json.candidates?.[0];
  const texto = extrairTexto(candidato);
  if (!texto.trim()) {
    throw new UpstreamServiceError(`Gemini devolveu uma resposta vazia (finishReason: ${candidato?.finishReason ?? "?"}).`);
  }
  return {
    texto,
    grounding: candidato.groundingMetadata ?? null,
    modelo: json.modelVersion || config.model,
    tokens: json.usageMetadata?.totalTokenCount ?? null,
    chave: chaveUsada.chave
  };
}

function corpoDaChamada({ systemInstruction, prompt }, extra) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...extra
  });
}

// Com a busca na web: a leitura diária de eventos (ADR 0047).
async function pesquisarNaWeb({ systemInstruction, prompt, signal }, deps = {}) {
  return chamarComChaves(corpoDaChamada({ systemInstruction, prompt }, { tools: [{ google_search: {} }] }), { signal }, deps);
}

// SEM busca e com a resposta em JSON: a leitura diária de tendência do petróleo (ADR 0052), que só interpreta a BASE
// que recebe. Devolve o texto como veio (sem `grounding`): quem lê e valida o JSON é o coletor.
async function gerarJson({ systemInstruction, prompt, signal }, deps = {}) {
  const corpo = corpoDaChamada({ systemInstruction, prompt }, { generationConfig: { responseMimeType: "application/json" } });
  const resposta = await chamarComChaves(corpo, { signal }, deps);
  delete resposta.grounding;
  return resposta;
}

module.exports = { nome: "gemini", pesquisarNaWeb, gerarJson, extrairTexto };
