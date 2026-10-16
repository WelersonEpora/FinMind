"use strict";

const crypto = require("node:crypto");
const env = require("../config/env");
const geminiSearch = require("../ai/gemini-search.provider");
const { carregarPrompt } = require("../ai/carregar-prompt");
const geopoliticaService = require("./geopolitica.service");
const recomendacaoIaRepository = require("../repositories/recomendacao-ia.repository");
const { modeloFixadoValido, montarEntrada, textoDaEntrada, validarRecomendacao, contrariasALeitura, somarUso, custoUsd } = require("../carteiras/recomendacao");
const logger = require("../shared/logger");

// A RECOMENDAÇÃO diária da IA de uma carteira (ADR 0127, §4), na decisão da rodada, depois das leituras. Entrada: as
// leituras congeladas e os eventos dos últimos 7 dias (só dado global; nenhum estado de trilha nem dado da carteira vai
// ao prompt). Só a chave PAGA e o modelo FIXADO (GEMINI_MODEL_RECOMENDACAO): um `modelVersion` devolvido diferente do
// pedido conta como resposta inválida. Duas respostas inválidas, o Gemini fora ou o modelo não configurado -> FALHA, e
// a trilha IA fica no fallback "manter" (carteiras/recomendacao.js::intencoesDaIa).
//
// COMPARTILHADA (adendo de 2026-10-16): como a entrada não depende da carteira, carteiras com os mesmos ativos mandam o
// mesmo prompt no mesmo dia. A chamada é feita uma vez e gravada na tabela GLOBAL `recomendacao_ia`; as carteiras
// seguintes reaproveitam a VALIDA da mesma chave (data, tipo, hash da entrada, versão do prompt e modelo). Dentro da
// rotina, `deps.memoRecomendacoes` (um Map) guarda também as falhas: a rotina já tentou de novo antes de decidir, e uma
// carteira não chama a IA outra vez pelo que falhou. Uma cota esgotada (429) é repetida com espera (ESPERAS_COTA_MS).
//
// Devolve o registro pronto para a tabela `carteira_recomendacao` (o repositório grava junto com a rodada): o prompt e
// a instrução como foram, cada resposta bruta com os erros dela, o modelo pedido e o devolvido, os tokens por tipo, o
// custo, as tentativas e o vínculo com a chamada (`recomendacao_ia_id`). Nunca lança: uma falha vira o registro com o
// motivo.

const ARQUIVO_PROMPT = "carteira-recomendacao.md";
const TENTATIVAS_ATE_VALIDAR = 2;
const JANELA_EVENTOS_DIAS = 7;
// Cota esgotada (429) na chave paga: espera e tenta de novo, duas vezes. Em 2026-10-15 o Gemini respondeu 429 depois de
// 81 s, a uma chamada a cada 2 minutos: falta de capacidade do lado do Google, não excesso nosso.
const ESPERAS_COTA_MS = [30000, 90000];

const hash = (texto) => crypto.createHash("sha256").update(texto).digest("hex");

// A combinação de ativos da entrada (com e sem leitura), em ordem alfabética: a réplica é uma por combinação e semana.
const ativosDaEntrada = (entrada) => [...(entrada?.ativos || []).map((a) => a.ativo), ...(entrada?.semLeitura || [])].sort().join(",");

const chaveDoMemo = (r) => [r.data, r.tipo, r.hash_entrada, r.versao_prompt, r.modelo_pedido].join("|");

// A cópia da chamada para a carteira: sem o id e a combinação (da linha global), com o vínculo.
function paraCarteira({ id, ativos: _ativos, created_at: _criada, updated_at: _atualizada, ...registro }) {
  return { ...registro, custo_usd: registro.custo_usd == null ? null : Number(registro.custo_usd), recomendacao_ia_id: id ?? null };
}

// A chamada compartilhada: a do memo da rotina, a VALIDA já gravada ou, sem nenhuma, `chamar()` (que pode devolver
// null: nada a chamar), gravada na tabela global. Uma falha do banco não impede a recomendação: só o vínculo fica nulo.
async function compartilhada(registro, chamar, deps) {
  const repo = deps.recomendacaoIaRepository || recomendacaoIaRepository;
  const log = deps.logger || logger;
  const memo = deps.memoRecomendacoes;
  const chave = chaveDoMemo(registro);
  if (memo?.has(chave)) return memo.get(chave);

  let resultado = null;
  try {
    const existente = await repo.buscarValida(registro);
    if (existente) resultado = paraCarteira(existente);
  } catch (erro) {
    log.warn({ err: erro }, "Recomendação das carteiras: falha ao ler a recomendação compartilhada; chamando a IA.");
  }
  if (!resultado) {
    const feito = await chamar();
    if (feito) {
      try {
        resultado = paraCarteira(await repo.registrar(feito));
      } catch (erro) {
        log.warn({ err: erro }, "Recomendação das carteiras: falha ao gravar a recomendação compartilhada.");
        resultado = paraCarteira(feito);
      }
    }
  }
  memo?.set(chave, resultado);
  return resultado;
}

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

function registroBase({ data, tipo, modelo, entrada, prompt, falhasEventos, hashEntrada }) {
  return {
    data,
    tipo,
    ativos: ativosDaEntrada(entrada),
    situacao: "FALHA",
    motivo_falha: null,
    versao_prompt: prompt?.versao ?? null,
    modelo_pedido: modelo || null,
    modelo_devolvido: null,
    hash_entrada: hashEntrada ?? (entrada ? hash(JSON.stringify(entrada)) : null),
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
      // Só a chave paga e o modelo fixado; a cota esgotada (429) espera e tenta de novo.
      const resposta = await provedor.gerarJson(
        { systemInstruction: prompt.instrucaoDoSistema, prompt: prompt.prompt },
        { ...deps, gemini: { ...gemini, apiKeyFree: "", model: modelo }, esperasCotaMs: deps.esperasCotaMs ?? ESPERAS_COTA_MS }
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

  const semChamada = (motivo) => paraCarteira({ ...registro, motivo_falha: motivo });
  if (!entrada.ativos.length) return semChamada("SEM_LEITURAS");
  if (!modeloFixadoValido(modelo)) return semChamada("MODELO_NAO_FIXADO");
  if (!gemini.apiKey) return semChamada("SEM_CHAVE_PAGA");
  return compartilhada(registro, () => chamarEValidar(registro, { entrada, prompt, modelo }, deps), deps);
}

// A réplica semanal (ADR 0127, §4): a MESMA entrada e o mesmo prompt de uma recomendação válida, de novo; não decide
// nada, só mede a consistência. Compartilhada como a principal: uma por combinação de ativos e semana (`semana`: a
// segunda e o domingo). Devolve null quando a combinação já teve réplica na semana, em outro dia.
async function replicar(principal, [inicio, fim], deps = {}) {
  const repo = deps.recomendacaoIaRepository || recomendacaoIaRepository;
  const registro = registroBase({
    data: principal.data,
    tipo: "REPLICA",
    modelo: principal.modelo_pedido,
    entrada: principal.entrada,
    hashEntrada: principal.hash_entrada,
    prompt: { versao: principal.versao_prompt, instrucaoDoSistema: principal.instrucao, prompt: principal.prompt }
  });
  return compartilhada(
    registro,
    async () => {
      try {
        if (await repo.existeReplicaEntre(registro, inicio, fim)) return null;
      } catch (erro) {
        (deps.logger || logger).warn({ err: erro }, "Recomendação das carteiras: falha ao procurar a réplica da semana; sem réplica hoje.");
        return null;
      }
      return chamarEValidar(registro, { entrada: principal.entrada, prompt: { instrucaoDoSistema: principal.instrucao, prompt: principal.prompt }, modelo: principal.modelo_pedido }, deps);
    },
    deps
  );
}

module.exports = { recomendar, replicar, chaveDoMemo, ARQUIVO_PROMPT };
