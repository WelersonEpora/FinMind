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
// gratuita esgota a cota (429), continua com 5xx depois das tentativas locais ou fica sem responder até o fim da janela
// dela (GEMINI_TIMEOUT_MS). No AgroMind, o tier gratuito levou 503 em 6 de 6 execuções de um dia enquanto a mesma
// chamada com a chave paga passava na hora: o Google tira a prioridade do gratuito sob carga. Outros erros (chave
// inválida, rede) não gastam a chave paga. Com uma só chave configurada, usa essa.
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

// Uma requisição com uma chave. O timeout é o que resta da janela da chave; o `signal` de fora (o do coletor) também
// a interrompe.
async function chamar({ apiKey, corpo, signal, timeoutMs }, { config, fetchFn }) {
  const sinais = [AbortSignal.timeout(timeoutMs), signal].filter(Boolean);
  let resposta;
  try {
    resposta = await fetchFn(`${URL_BASE}/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: "POST",
      signal: AbortSignal.any(sinais),
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: corpo
    });
  } catch (err) {
    if (err.name === "TimeoutError") {
      const erro = new UpstreamServiceError(`Gemini não respondeu em ${config.timeoutMs} ms.`);
      erro.semResposta = true;
      throw erro;
    }
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

// Como a tentativa terminou, para o registro: o status HTTP, "sem resposta" (a janela acabou) ou o erro.
function resultadoDaTentativa(erro) {
  if (!erro) return "ok";
  if (erro.semResposta) return "sem resposta";
  if (erro.statusGemini) return `status ${erro.statusGemini}`;
  return "erro";
}

// As tentativas com UMA chave, dentro de uma janela de `config.timeoutMs` para todas elas: num 5xx, repete com a mesma
// chave enquanto sobrar janela. Em 2026-10-07 a gratuita segurou a conexão por 200 s e respondeu 503 ("high demand"),
// enquanto a paga respondia em 108 s: sem a janela, as repetições da gratuita consumiam o teto do coletor. Cada
// tentativa entra em `tentativas` ({ chave, resultado, segundos }).
async function chamarComRetry({ chave, apiKey, corpo, signal }, contexto, tentativas) {
  const limite = contexto.agora() + contexto.config.timeoutMs;
  for (let tentativa = 0; ; tentativa += 1) {
    const inicio = contexto.agora();
    try {
      const json = await chamar({ apiKey, corpo, signal, timeoutMs: Math.max(1, limite - inicio) }, contexto);
      tentativas.push({ chave, resultado: "ok", segundos: (contexto.agora() - inicio) / 1000 });
      return json;
    } catch (erro) {
      tentativas.push({ chave, resultado: resultadoDaTentativa(erro), segundos: (contexto.agora() - inicio) / 1000 });
      const espera = ESPERAS_ERRO_TRANSITORIO_MS[tentativa];
      const sobra = limite - contexto.agora() - (espera ?? 0);
      if (!eTransitorio(erro) || espera === undefined || sobra <= 0) throw erro;
      await contexto.esperar(espera);
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

// A gratuita passa a vez para a paga na cota esgotada (429), no 5xx que persiste e na janela que acaba sem resposta (o
// gratuito sob carga demora e depois recusa). Outros erros (chave inválida, rede) não gastam a paga.
function passaParaAPaga(erro) {
  return erro.statusGemini === 429 || eTransitorio(erro) || erro.semResposta === true;
}

function descreverTentativas(tentativas) {
  return tentativas.map((t) => `${t.chave}: ${t.resultado} em ${t.segundos.toFixed(1)} s`).join("; ");
}

// Uma chamada com as duas chaves (a gratuita primeiro, a paga como reserva): o JSON da resposta, a chave que respondeu
// e as tentativas.
async function chamarComChaves(corpo, { signal }, deps) {
  const config = deps.gemini || env.gemini;
  const contexto = { config, fetchFn: deps.fetch || fetch, esperar: deps.esperar || esperarPadrao, agora: deps.agora || Date.now };
  const chaves = chavesEmOrdem(config);
  if (chaves.length === 0) {
    throw new NotConfiguredError("GEMINI_API_KEY_FREE e GEMINI_API_KEY não definidas: o Gemini está desligado.");
  }

  const tentativas = [];
  let chaveUsada = chaves[0];
  let json;
  try {
    json = await chamarComRetry({ ...chaveUsada, corpo, signal }, contexto, tentativas);
  } catch (erro) {
    if (chaves.length === 1 || !passaParaAPaga(erro)) {
      erro.message = `${erro.message} Tentativas: ${descreverTentativas(tentativas)}.`;
      throw erro;
    }
    chaveUsada = chaves[1];
    try {
      json = await chamarComRetry({ ...chaveUsada, corpo, signal }, contexto, tentativas);
    } catch (erroPaga) {
      // As duas falharam: a mensagem diz o que cada tentativa respondeu (no registro da execução, sem isso, não dá
      // para saber se a paga chegou a ser tentada).
      const falha = new UpstreamServiceError(
        `As duas chaves falharam. Tentativas: ${descreverTentativas(tentativas)}. Última: ${erroPaga.message}`
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
    chave: chaveUsada.chave,
    tentativas
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
