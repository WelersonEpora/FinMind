"use strict";

const env = require("../../config/env");
const geminiSearch = require("../../ai/gemini-search.provider");
const analiseDiariaRepository = require("../../repositories/analise-diaria.repository");
const promptDiarioService = require("../../services/prompt-diario.service");
const { validarRespostaAnalise } = require("../../shared/resposta-analise-diaria");
const { ATIVOS_COM_ANALISE_DIARIA, configuracaoDoAtivo } = require("../../shared/analise-diaria");

// Leitura diária de TENDÊNCIA de um ativo (petróleo, ADR 0052; ouro, ADR 0054): o prompt diário (ADR 0051,
// prompt-diario.service.js) enviado ao Gemini SEM busca na web e com a resposta em JSON, nos quatro horizontes. A IA só
// interpreta a BASE e a leitura do motor que recebe; não pesquisa nada. Um coletor por ativo, criado por
// `criarColetorAnaliseDiaria` com a configuração do ativo (shared/analise-diaria-<ativo>.js).
//
// Não é coleta de dado de fonte: é a chamada de IA que usa o que as outras coletas trouxeram. Fica no mesmo pipeline
// (registro de execução, cron, tela Execuções) e é registrada DEPOIS de todos os coletores (collectors/index.js), para
// rodar com a base do dia já coletada, inclusive a leitura de eventos.
//
// UMA leitura por ativo e dia, a primeira que der certo: o cron roda 3 vezes (01h, 03h e 05h em Brasília) e as
// execuções seguintes pulam a chamada. ANALISE_DIARIA_REFAZER=1 força uma nova leitura, que substitui a do dia.
//
// VALIDAÇÃO (shared/resposta-analise-diaria.js): a resposta inteira passa ou nada é gravado. Uma resposta recusada leva
// a UMA nova chamada; recusada de novo, a execução fica "failed" com os motivos, e o Centro de Decisão diz que não há
// leitura no dia (nunca mostra uma leitura fora do formato).
//
// A data da análise é o dia em São Paulo. A leitura de tendência não é recomendação: a resposta não tem compra nem
// venda (o prompt proíbe e a validação só aceita as escalas do formato).

const TENTATIVAS_ATE_VALIDAR = 2;

function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

// O que a validação precisa saber do prompt enviado: os horizontes do ativo, os fatores e, entre eles, os de contexto.
function opcoesDeValidacao(promptDiario, config) {
  const fatores = promptDiario.entrada.fatores;
  return {
    horizontes: config.HORIZONTES,
    codigosFator: fatores.map((f) => f.fator),
    codigosContexto: fatores.filter((f) => f.contextoDe).map((f) => f.fator)
  };
}

function criarColetorAnaliseDiaria(ativo) {
  const ATIVO = String(ativo).toUpperCase();
  const config = configuracaoDoAtivo(ATIVO);

  async function download({ signal }, deps = {}) {
    const provedor = deps.geminiSearch || geminiSearch;
    const repo = deps.analiseDiariaRepository || analiseDiariaRepository;
    const promptService = deps.promptDiarioService || promptDiarioService;
    const dataAnalise = deps.dataAnalise || hojeEmSaoPaulo(deps.agora);
    const refazer = deps.refazer ?? env.analiseDiaria.refazer;

    if (!refazer && (await repo.existeAnaliseDoDia(ATIVO, dataAnalise))) return { pular: true, dataAnalise };

    const { promptDiario } = await promptService.montarPromptDiario(ATIVO, { data: dataAnalise }, deps);
    const opcoes = opcoesDeValidacao(promptDiario, config);
    let resposta;
    let tokensRecusados = 0;
    let recusadas = 0;
    const motivosRecusa = [];
    for (let tentativa = 1; tentativa <= TENTATIVAS_ATE_VALIDAR; tentativa += 1) {
      resposta = await provedor.gerarJson({ systemInstruction: promptDiario.instrucaoDoSistema, prompt: promptDiario.prompt, signal });
      const { erros } = validarRespostaAnalise(resposta.texto, opcoes);
      if (erros.length === 0) break;
      if (tentativa < TENTATIVAS_ATE_VALIDAR) {
        recusadas += 1;
        tokensRecusados += resposta.tokens || 0;
        motivosRecusa.push(...erros);
      }
    }
    return { dataAnalise, promptDiario, resposta, tokensRecusados, recusadas, motivosRecusa };
  }

  function parse(resultado) {
    return [resultado];
  }

  // Para o detalhe da execução (tela Execuções): a chave, o modelo, os tokens (com os das respostas recusadas, o custo
  // real), os motivos das respostas recusadas que foram substituídas por uma nova chamada, e as versões.
  function detalhesDaIa({ promptDiario, resposta, tokensRecusados, recusadas, motivosRecusa = [] }) {
    return {
      ia: {
        chave: resposta.chave ?? null,
        modelo: resposta.modelo ?? null,
        tokens: resposta.tokens != null ? resposta.tokens + tokensRecusados : null,
        respostasRecusadas: recusadas,
        motivosRecusa,
        versaoPrompt: promptDiario.versaoPrompt,
        versaoMetodologia: promptDiario.versaoMetodologia,
        hashEntrada: promptDiario.hashEntrada
      }
    };
  }

  function normalize([resultado]) {
    if (resultado.pular) return { validos: [{ pular: true }], invalidos: [], avisos: [] };

    const { dataAnalise, promptDiario, resposta } = resultado;
    const detalhes = detalhesDaIa(resultado);
    const { leituras, erros } = validarRespostaAnalise(resposta.texto, opcoesDeValidacao(promptDiario, config));
    if (erros.length > 0) {
      // A chamada aconteceu (e gastou tokens) mesmo com a resposta recusada: os detalhes vão junto.
      return { validos: [], invalidos: erros.map((motivo) => ({ item: { ativo: ATIVO, dataAnalise }, motivo })), avisos: [], detalhes };
    }

    const analise = {
      ativo: ATIVO,
      data_analise: dataAnalise,
      versao_prompt: promptDiario.versaoPrompt,
      versao_metodologia: promptDiario.versaoMetodologia,
      versao_configuracao: promptDiario.versaoConfiguracao,
      hash_entrada: promptDiario.hashEntrada,
      entrada: promptDiario.entrada,
      instrucao_sistema: promptDiario.instrucaoDoSistema,
      prompt: promptDiario.prompt,
      resposta_bruta: resposta.texto,
      leituras,
      modelo: resposta.modelo,
      tokens: detalhes.ia.tokens,
      chave: resposta.chave
    };
    return { validos: [{ analise }], invalidos: [], avisos: [], detalhes };
  }

  async function persist(validos, { execucaoId }, deps = {}) {
    const repo = deps.analiseDiariaRepository || analiseDiariaRepository;
    const resultado = { criados: 0, atualizados: 0, ignorados: 0, falhas: [] };
    for (const { pular, analise } of validos) {
      if (pular) {
        resultado.ignorados += 1;
        continue;
      }
      const { substituiu } = await repo.substituirAnaliseDoDia({ ...analise, collection_execution_id: execucaoId });
      if (substituiu) resultado.atualizados += 1;
      else resultado.criados += 1;
    }
    return resultado;
  }

  return {
    codigo: config.COLETOR,
    // O provedor já controla o tempo de cada chamada e as repetições (5xx na mesma chave, depois a paga). Teto da
    // execução: duas chamadas (a nova tentativa quando a resposta é recusada), com folga para montar o prompt.
    get timeoutMs() {
      return 2 * env.gemini.timeoutMs + 60000;
    },
    // Sem repetição no runner: repetir aqui refaria também a chamada com a chave paga.
    tentativasRetry: 1,
    download,
    parse,
    normalize,
    persist,
    hojeEmSaoPaulo,
    ATIVO
  };
}

// Um coletor por ativo com leitura diária, na ordem do registro (shared/analise-diaria.js).
const COLETORES_ANALISE_DIARIA = ATIVOS_COM_ANALISE_DIARIA.map(criarColetorAnaliseDiaria);

module.exports = { criarColetorAnaliseDiaria, COLETORES_ANALISE_DIARIA };
