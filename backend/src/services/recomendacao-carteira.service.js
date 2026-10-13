"use strict";

const crypto = require("node:crypto");
const env = require("../config/env");
const geminiSearch = require("../ai/gemini-search.provider");
const { carregarPrompt } = require("../ai/carregar-prompt");
const geopoliticaService = require("./geopolitica.service");
const { modeloFixadoValido, montarEntrada, textoDaEntrada, validarRecomendacao, contrariasALeitura, somarUso, custoUsd } = require("../carteiras/recomendacao");

// A RECOMENDAÇÃO diária da IA de uma carteira (ADR 0127, §4): uma chamada por carteira e dia, na decisão da rodada,
// depois das leituras. Entrada: as leituras congeladas e os eventos dos últimos 7 dias (só dado global; nenhum estado
// de trilha nem dado da carteira vai ao prompt). Só a chave PAGA e o modelo FIXADO (GEMINI_MODEL_RECOMENDACAO): um
// `modelVersion` devolvido diferente do pedido conta como resposta inválida. Duas respostas inválidas, o Gemini fora ou
// o modelo não configurado -> FALHA, e a trilha IA fica no fallback "manter" (carteiras/recomendacao.js::intencoesDaIa).
//
// Devolve o registro pronto para a tabela `carteira_recomendacao` (o repositório grava junto com a rodada): o prompt e
// a instrução como foram, cada resposta bruta com os erros dela, o modelo pedido e o devolvido, os tokens por tipo, o
// custo e as tentativas. Nunca lança: uma falha vira o registro com o motivo.

const ARQUIVO_PROMPT = "carteira-recomendacao.md";
const TENTATIVAS_ATE_VALIDAR = 2;
const JANELA_EVENTOS_DIAS = 7;

const hash = (texto) => crypto.createHash("sha256").update(texto).digest("hex");

// Os eventos aceitos dos últimos 7 dias de cada ativo. Uma falha na leitura dos eventos não impede a recomendação: o
// ativo vai sem eventos e o motivo fica no registro.
async function eventosDosAtivos(ativos, data, deps) {
  const service = deps.geopoliticaService || geopoliticaService;
  const eventosPorAtivo = {};
  const falhas = {};
  for (const ativo of ativos) {
    try {
      eventosPorAtivo[ativo] = (await service.obterEventosDoAtivo(ativo, data, { janelaDias: JANELA_EVENTOS_DIAS }, deps)).eventos;
    } catch (erro) {
      eventosPorAtivo[ativo] = [];
      falhas[ativo] = erro.message;
    }
  }
  return { eventosPorAtivo, falhas };
}

function registroBase({ data, tipo, modelo, entrada, prompt, falhasEventos }) {
  return {
    data,
    tipo,
    situacao: "FALHA",
    motivo_falha: null,
    versao_prompt: prompt?.versao ?? null,
    modelo_pedido: modelo || null,
    modelo_devolvido: null,
    hash_entrada: entrada ? hash(JSON.stringify(entrada)) : null,
    entrada,
    instrucao: prompt?.instrucaoDoSistema ?? null,
    prompt: prompt?.prompt ?? null,
    respostas: [],
    recomendacoes: null,
    contrarias: null,
    tokens: null,
    custo_usd: null,
    tentativas: [],
    detalhes: Object.keys(falhasEventos || {}).length ? { falhasEventos } : null
  };
}

// A chamada com as tentativas até validar. `prompt` e `entrada` já montados (a réplica semanal reusa os mesmos).
async function chamarEValidar(registro, { entrada, prompt, modelo }, deps) {
  const config = deps.recomendacaoCarteira || env.recomendacaoCarteira;
  const gemini = deps.gemini || env.gemini;
  const provedor = deps.geminiSearch || geminiSearch;
  const usos = [];
  try {
    for (let tentativa = 1; tentativa <= TENTATIVAS_ATE_VALIDAR; tentativa += 1) {
      // Só a chave paga e o modelo fixado.
      const resposta = await provedor.gerarJson(
        { systemInstruction: prompt.instrucaoDoSistema, prompt: prompt.prompt },
        { ...deps, gemini: { ...gemini, apiKeyFree: "", model: modelo } }
      );
      usos.push(resposta.uso);
      registro.tentativas.push(...(resposta.tentativas || []));
      registro.modelo_devolvido = resposta.modelo ?? null;
      const { recomendacoes, erros } =
        resposta.modelo && resposta.modelo !== modelo
          ? { recomendacoes: null, erros: [`O modelo devolvido (${resposta.modelo}) não é o pedido (${modelo}).`] }
          : validarRecomendacao(resposta.texto, entrada);
      registro.respostas.push({ texto: resposta.texto ?? null, modelo: resposta.modelo ?? null, erros });
      if (recomendacoes) {
        registro.situacao = "VALIDA";
        registro.recomendacoes = recomendacoes;
        registro.contrarias = contrariasALeitura(recomendacoes, entrada);
        break;
      }
      registro.motivo_falha = erros[0]?.startsWith("O modelo devolvido") ? "MODELO_DIFERENTE" : "RESPOSTA_INVALIDA";
    }
  } catch (erro) {
    registro.motivo_falha = "GEMINI_FORA";
    registro.detalhes = { ...(registro.detalhes || {}), erro: erro.message };
  }
  if (registro.situacao === "VALIDA") registro.motivo_falha = null;
  registro.tokens = somarUso(usos);
  registro.custo_usd = custoUsd(registro.tokens, config);
  return registro;
}

// A recomendação do dia (tipo PRINCIPAL). `leiturasPorAtivo`: as congeladas na rodada. -> o registro.
async function recomendar({ data, ativos, leiturasPorAtivo }, deps = {}) {
  const config = deps.recomendacaoCarteira || env.recomendacaoCarteira;
  const gemini = deps.gemini || env.gemini;
  const modelo = config.model;
  const { eventosPorAtivo, falhas } = await eventosDosAtivos(ativos.filter((a) => leiturasPorAtivo[a]), data, deps);
  const entrada = montarEntrada({ data, ativos, leiturasPorAtivo, eventosPorAtivo });
  const prompt = entrada.ativos.length
    ? carregarPrompt(ARQUIVO_PROMPT, { data, ativos: entrada.ativos.map((a) => a.ativo).join(", "), entrada: textoDaEntrada(entrada) })
    : null;
  const registro = registroBase({ data, tipo: "PRINCIPAL", modelo, entrada, prompt, falhasEventos: falhas });

  if (!entrada.ativos.length) return { ...registro, motivo_falha: "SEM_LEITURAS" };
  if (!modeloFixadoValido(modelo)) return { ...registro, motivo_falha: "MODELO_NAO_FIXADO" };
  if (!gemini.apiKey) return { ...registro, motivo_falha: "SEM_CHAVE_PAGA" };
  return chamarEValidar(registro, { entrada, prompt, modelo }, deps);
}

// A réplica semanal (ADR 0127, §4): a MESMA entrada e o mesmo prompt de uma recomendação válida, de novo; não decide
// nada, só mede a consistência.
async function replicar(principal, deps = {}) {
  const registro = registroBase({
    data: principal.data,
    tipo: "REPLICA",
    modelo: principal.modelo_pedido,
    entrada: principal.entrada,
    prompt: { versao: principal.versao_prompt, instrucaoDoSistema: principal.instrucao, prompt: principal.prompt }
  });
  return chamarEValidar(registro, { entrada: principal.entrada, prompt: { instrucaoDoSistema: principal.instrucao, prompt: principal.prompt }, modelo: principal.modelo_pedido }, deps);
}

module.exports = { recomendar, replicar, ARQUIVO_PROMPT };
