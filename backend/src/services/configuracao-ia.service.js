"use strict";

const env = require("../config/env");
const systemSettingRepository = require("../repositories/system-setting.repository");
const userRepository = require("../repositories/user.repository");
const { cifrar, decifrar } = require("../shared/utils/cifra");
const { NotConfiguredError, ValidationError, UpstreamServiceError } = require("../shared/errors");
const logger = require("../shared/logger");

// As chaves do Gemini da plataforma (ADR 0156): cadastradas pelo admin na tela Configuração, uma gratuita e uma paga,
// guardadas cifradas em `system_setting`. O BANCO É A ÚNICA FONTE: o .env não é mais lido para as chaves (só uma vez,
// pelo script de importação, scripts/importar-chaves-gemini.js); o modelo, o timeout e os preços continuam no .env.
// Quem paga a IA é o dono da chave: a cobrança é do Google, pelo projeto da chave, sem nada no código.
//
// A chave nunca sai da API: a situação mostra só se está cadastrada, os 4 últimos caracteres, quando e por quem.

const TIPOS = {
  gratuita: { chave: "gemini.api_key_free", descricao: "Chave gratuita do Gemini (tentada primeiro), cifrada." },
  paga: { chave: "gemini.api_key", descricao: "Chave paga do Gemini (reserva; a única da recomendação das carteiras), cifrada." }
};

const URL_MODELOS = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";
const TIMEOUT_TESTE_MS = 15000;

function tipoValido(tipo) {
  if (!TIPOS[tipo]) throw new ValidationError(`Tipo de chave desconhecido: "${tipo}". Use "gratuita" ou "paga".`);
  return TIPOS[tipo];
}

function lerRegistro(linha) {
  if (!linha?.value) return null;
  try {
    return JSON.parse(linha.value);
  } catch {
    return null;
  }
}

// A chave em claro de um tipo, ou "" (sem cadastro, ou sem como decifrar: o mestre faltando ou trocado).
async function chaveEmClaro(tipo, deps) {
  const repo = deps.systemSettingRepository || systemSettingRepository;
  const segredo = deps.segredoMestre ?? env.configEncryptionKey;
  const registro = lerRegistro(await repo.obter(TIPOS[tipo].chave));
  if (!registro?.cifrado) return "";
  try {
    return decifrar(registro.cifrado, segredo);
  } catch (erro) {
    (deps.logger || logger).warn({ err: erro, tipo }, "Chave do Gemini cadastrada, mas não foi possível decifrá-la (CONFIG_ENCRYPTION_KEY ausente ou trocada): cadastre-a de novo.");
    return "";
  }
}

// A configuração do Gemini para o provedor: o modelo e o timeout do .env, as chaves do banco.
async function obterConfigGemini(deps = {}) {
  const [apiKeyFree, apiKey] = await Promise.all([chaveEmClaro("gratuita", deps), chaveEmClaro("paga", deps)]);
  return { ...env.gemini, apiKeyFree, apiKey };
}

async function situacaoDoTipo(tipo, deps) {
  const repo = deps.systemSettingRepository || systemSettingRepository;
  const users = deps.userRepository || userRepository;
  const linha = await repo.obter(TIPOS[tipo].chave);
  const registro = lerRegistro(linha);
  if (!registro?.cifrado) return { configurada: false };
  const usuario = registro.atualizadoPor ? await users.findById(registro.atualizadoPor) : null;
  return {
    configurada: true,
    final: registro.final ?? null,
    atualizadaEm: linha.updated_at ?? null,
    atualizadaPor: usuario ? usuario.name || usuario.email : null
  };
}

// Para a tela (só admin): a situação de cada chave, sem a chave.
async function obterSituacao(deps = {}) {
  const [gratuita, paga] = await Promise.all([situacaoDoTipo("gratuita", deps), situacaoDoTipo("paga", deps)]);
  return { cifraDisponivel: Boolean(deps.segredoMestre ?? env.configEncryptionKey), chaves: { gratuita, paga } };
}

// Há ao menos uma chave cadastrada (o status dos módulos).
async function temChave(deps = {}) {
  const repo = deps.systemSettingRepository || systemSettingRepository;
  const linhas = await Promise.all(Object.values(TIPOS).map((t) => repo.obter(t.chave)));
  return linhas.some((linha) => lerRegistro(linha)?.cifrado);
}

// Uma chamada barata (a lista de modelos, sem gerar nada) para saber se o Google aceita a chave antes de gravá-la.
async function testarChave(apiKey, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  let resposta;
  try {
    resposta = await fetchFn(URL_MODELOS, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(TIMEOUT_TESTE_MS) });
  } catch (erro) {
    throw new UpstreamServiceError(`Não foi possível falar com o Gemini para testar a chave: ${erro.message}`);
  }
  if (resposta.ok) return;
  if ([400, 401, 403].includes(resposta.status)) {
    throw new ValidationError("O Gemini recusou a chave. Confira se ela foi copiada inteira do Google AI Studio.");
  }
  throw new UpstreamServiceError(`O Gemini respondeu com status ${resposta.status} ao testar a chave. Tente de novo em instantes.`);
}

function normalizarChave(apiKey) {
  const chave = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!chave) throw new ValidationError('"apiKey" é obrigatória.');
  if (chave.length > 200 || /\s/.test(chave)) throw new ValidationError('"apiKey" não parece uma chave do Gemini.');
  return chave;
}

// Grava (ou troca) a chave de um tipo, cifrada, depois de o Google aceitá-la (`testar: false` só na importação).
async function salvarChave(tipo, apiKey, usuarioId, deps = {}) {
  const { chave, descricao } = tipoValido(tipo);
  const valor = normalizarChave(apiKey);
  const segredo = deps.segredoMestre ?? env.configEncryptionKey;
  if (!segredo) {
    throw new NotConfiguredError("CONFIG_ENCRYPTION_KEY não definida no servidor: sem ela, a chave não pode ser guardada cifrada.");
  }
  if (deps.testar !== false) await testarChave(valor, deps);
  const registro = { cifrado: cifrar(valor, segredo), final: valor.slice(-4), atualizadoPor: usuarioId ?? null };
  await (deps.systemSettingRepository || systemSettingRepository).gravar(chave, JSON.stringify(registro), descricao);
  return obterSituacao(deps);
}

async function removerChave(tipo, deps = {}) {
  const { chave } = tipoValido(tipo);
  await (deps.systemSettingRepository || systemSettingRepository).remover(chave);
  return obterSituacao(deps);
}

module.exports = { TIPOS, obterConfigGemini, obterSituacao, temChave, testarChave, salvarChave, removerChave };
