"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const geminiSearch = require("../../ai/gemini-search.provider");
const { carregarPrompt } = require("../../ai/carregar-prompt");
const geopoliticaRepository = require("../../repositories/geopolitica.repository");
const { parsearBoletim } = require("./geopolitica-boletim.parser");
const { resolverLinks, paginasDoTrecho } = require("./paginas-da-pesquisa");
const { FONTES, classificarFonte, sitesDaPesquisa, verificarNaPesquisa, listaParaPrompt, sugestoesDeBusca } = require("./fontes-autorizadas");

// Leitura diária de geopolítica do OURO e do PETRÓLEO. ADR 0047, no padrão do AgroMind (ADR 0027 de lá).
//
// O QUE É: uma única chamada diária ao Gemini com busca na web (ai/gemini-search.provider.js), orientada às fontes
// autorizadas (fontes-autorizadas.js), que responde "existe hoje algo geopolítico fora do normal que deva ser
// considerado na análise do ouro / do petróleo?". A resposta é texto com rótulos fixos (ai/prompts/
// geopolitica-diaria.md), lido por um parser determinístico. Não é um sistema de eventos: não há identidade de
// evento entre dias. Se um fato de ontem continua relevante hoje, ele simplesmente aparece de novo.
//
// O QUE É GRAVADO: uma leitura por dia (nível e resumo de cada ativo, a resposta bruta, o prompt, o modelo e o
// grounding) e os eventos dela. Reexecutar no mesmo dia substitui a leitura do dia, numa transação.
//
// VALIDAÇÃO: a IA precisa ter pesquisado (ao menos uma página lida no grounding; senão, mais uma tentativa e, se
// falhar de novo, a execução falha sem gravar nada). As duas seções e um nível reconhecível em cada uma são obrigatórios; faltou algo, nada é gravado
// (item inválido, execução "failed") e uma leitura anterior do mesmo dia fica como estava. Um evento só é aceito se
// citar um site confiável (lista única para os dois ativos) que TAMBÉM apareceu nos resultados da pesquisa desta
// chamada; senão, é gravado como rejeitado (aceito = false, vai para a tela, não vai ao Motor) e vira aviso da
// execução, não falha: é o filtro funcionando.
//
// A data de referência é o dia em São Paulo (a análise é feita no Brasil). A busca ao vivo não é reproduzível: a
// leitura só vale da primeira coleta em diante e não serve para backtest (ADR 0047).

const ARQUIVO_PROMPT = "geopolitica-diaria.md";
const ATIVOS = ["OURO", "PETROLEO"];
// O assunto (fator) deste coletor. Preenchido aqui, nunca pela IA: um assunto novo terá o próprio coletor/prompt.
const ASSUNTO = "GEOPOLITICA";
const NOME_ATIVO = { OURO: "ouro", PETROLEO: "petróleo" };

function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

function montarPrompt(dataReferencia) {
  return carregarPrompt(ARQUIVO_PROMPT, {
    data_referencia: dataReferencia,
    fontes_confiaveis: listaParaPrompt(),
    sugestoes_busca: sugestoesDeBusca()
  });
}

// Quantas chamadas fazer até a IA de fato pesquisar (ver `pesquisou`).
const TENTATIVAS_ATE_PESQUISAR = 2;

// A IA pesquisou de verdade? Só se a resposta trouxer ao menos uma página lida no grounding. Em 2026-10-02, por alguns
// minutos (12h27-12h31), o Gemini respondeu SEM pesquisar, sem erro nenhum: escreveu nível, resumo e eventos de memória,
// citando AP, UKMTO e Tesouro sem ter lido nada. Os eventos foram rejeitados pela conferência, mas o nível e o resumo
// teriam ido ao Motor. Sem pesquisa, não há leitura.
function pesquisou(resposta) {
  return (resposta.grounding?.groundingChunks || []).length > 0;
}

async function download({ signal }, deps = {}) {
  const provedor = deps.geminiSearch || geminiSearch;
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const dataReferencia = deps.dataReferencia || hojeEmSaoPaulo();
  const refazer = deps.refazer ?? env.geopolitica.refazer;

  // Uma leitura por dia, a primeira que der certo: o cron roda 3 vezes (01h, 03h e 05h em Brasília) e as execuções
  // seguintes só servem de nova tentativa quando a anterior falhou. Pular não gasta chamada; fica como "ignorado" na
  // execução. GEOPOLITICA_REFAZER=1 força uma nova leitura, que substitui a do dia.
  if (!refazer && (await repo.existeLeituraDoDia(dataReferencia))) {
    return { pular: true, dataReferencia };
  }

  const { versao, instrucaoDoSistema, prompt } = montarPrompt(dataReferencia);

  let resposta;
  for (let tentativa = 1; tentativa <= TENTATIVAS_ATE_PESQUISAR; tentativa += 1) {
    resposta = await provedor.pesquisarNaWeb({ systemInstruction: instrucaoDoSistema, prompt, signal });
    if (pesquisou(resposta)) break;
  }
  if (!pesquisou(resposta)) {
    // Falha de comunicação, não item inválido: nada é gravado, a execução fica "failed" e uma leitura anterior do mesmo
    // dia continua valendo; sem leitura no dia, o Motor recebe "leitura indisponível", nunca o que a IA lembrou.
    throw new UpstreamServiceError(
      `A IA respondeu sem pesquisar (nenhuma página lida) em ${TENTATIVAS_ATE_PESQUISAR} tentativas: leitura descartada, nada foi gravado.`
    );
  }

  // Os links do grounding expiram: a URL final de cada página lida é resolvida agora e fica gravada no grounding.
  await resolverLinks(resposta.grounding, { fetchFn: deps.fetch || fetch, signal });
  return { ...resposta, instrucaoDoSistema, prompt, versaoPrompt: versao, dataReferencia };
}

function parse(resposta) {
  return [resposta];
}

function descreverFonte(fonte) {
  return fonte.url || fonte.nome || "?";
}

// Fontes do evento, em duas origens:
// - "pesquisa": página de um site confiável que a pesquisa leu e que apoia um trecho deste evento (grounding). Traz o
//   link direto (o aviso, o comunicado, a matéria). Substitui a citação da IA do mesmo site, que costuma vir sem URL ou
//   com a página inicial.
// - "citada": o que a IA escreveu em "Fontes:". `fonteAutorizada` = código do site confiável (ou null) e
//   `confirmadaNaPesquisa` = esse site apareceu nos resultados da pesquisa.
// Só a fonte confiável E confirmada (a "pesquisa" sempre é) sustenta o evento.
function montarFontes(evento, sites, grounding) {
  const daPesquisa = [];
  for (const pagina of paginasDoTrecho(evento.trecho, grounding)) {
    const codigo = classificarFonte({ url: pagina.url });
    // "…/sb0644" e "…/sb0644/" são a mesma página.
    const mesmaPagina = (url) => url.replace(/\/+$/, "") === pagina.url.replace(/\/+$/, "");
    if (codigo && !daPesquisa.some((fonte) => mesmaPagina(fonte.url))) {
      daPesquisa.push({ nome: FONTES[codigo].nome, url: pagina.url, fonteAutorizada: codigo, confirmadaNaPesquisa: true, origem: "pesquisa" });
    }
  }
  const sitesComPagina = new Set(daPesquisa.map((fonte) => fonte.fonteAutorizada));
  const citadas = evento.fontes
    .map((fonte) => {
      const fonteAutorizada = classificarFonte(fonte);
      const confirmadaNaPesquisa = Boolean(fonteAutorizada) && verificarNaPesquisa(fonteAutorizada, sites);
      return { ...fonte, fonteAutorizada, confirmadaNaPesquisa, origem: "citada" };
    })
    .filter((fonte) => !(fonte.fonteAutorizada && sitesComPagina.has(fonte.fonteAutorizada)));
  return [...daPesquisa, ...citadas];
}

function normalizarEvento(evento, ativo, sites, grounding) {
  const fontes = montarFontes(evento, sites, grounding);
  const aceito = fontes.some((fonte) => fonte.confirmadaNaPesquisa);
  const confiaveisNaoConfirmadas = fontes.filter((fonte) => fonte.fonteAutorizada && !fonte.confirmadaNaPesquisa);
  let motivo;
  if (fontes.length === 0) {
    motivo = "Nenhuma fonte citada.";
  } else if (confiaveisNaoConfirmadas.length > 0) {
    const nomes = [...new Set(confiaveisNaoConfirmadas.map((fonte) => FONTES[fonte.fonteAutorizada].nome))].join(", ");
    motivo = `Site confiável citado (${nomes}), mas ele não apareceu nos resultados da pesquisa desta chamada.`;
  } else {
    motivo = `Nenhum site confiável citado; citadas: ${fontes.map(descreverFonte).join("; ")}`;
  }
  return {
    ativo,
    assunto: ASSUNTO,
    tipo: evento.tipo,
    ordem: evento.ordem,
    titulo: evento.titulo.slice(0, 300),
    resumo: evento.resumo,
    canal_transmissao: evento.canal,
    pressao: evento.pressao,
    intensidade: evento.intensidade,
    confianca: evento.confianca,
    fontes,
    aceito,
    motivo_rejeicao: aceito ? null : motivo.slice(0, 255)
  };
}

// Dados da chamada de IA para o detalhe da execução (tela Execuções): qual chave respondeu, o modelo, os tokens e quanto
// a pesquisa trabalhou. Vão em metadata.detalhes da execução (collector-runner.js).
function detalhesDaIa(resposta) {
  return {
    ia: {
      chave: resposta.chave ?? null,
      modelo: resposta.modelo ?? null,
      tokens: resposta.tokens ?? null,
      versaoPrompt: resposta.versaoPrompt ?? null,
      buscas: (resposta.grounding?.webSearchQueries || []).length,
      paginasLidas: (resposta.grounding?.groundingChunks || []).length
    }
  };
}

function normalize([resposta]) {
  // Já havia leitura de hoje: nada a validar; o persist conta como "ignorado".
  if (resposta.pular) return { validos: [{ pular: true }], invalidos: [], avisos: [] };

  const secoes = parsearBoletim(resposta.texto);
  const invalidos = [];
  const avisos = [];

  for (const ativo of ATIVOS) {
    const secao = secoes[ativo];
    if (!secao) {
      invalidos.push({ item: { ativo }, motivo: `A resposta não trouxe a seção ${ativo}.` });
    } else if (!secao.nivel) {
      invalidos.push({ item: { ativo, nivel: secao.nivelTexto }, motivo: `Nível do ${NOME_ATIVO[ativo]} fora da escala: "${secao.nivelTexto ?? ""}".` });
    }
  }
  // A chamada aconteceu (e gastou tokens) mesmo com a resposta fora do formato: os detalhes vão junto.
  if (invalidos.length > 0) return { validos: [], invalidos, avisos, detalhes: detalhesDaIa(resposta) };

  const sites = sitesDaPesquisa(resposta.grounding);
  const eventos = [];
  for (const ativo of ATIVOS) {
    const secao = secoes[ativo];
    for (const evento of secao.eventos) {
      if (!evento.titulo) {
        avisos.push({ item: { ativo, ordem: evento.ordem }, motivo: "EVENTO sem título reconhecível, descartado." });
        continue;
      }
      const normalizado = normalizarEvento(evento, ativo, sites, resposta.grounding);
      if (!normalizado.aceito) avisos.push({ item: { ativo, titulo: normalizado.titulo }, motivo: normalizado.motivo_rejeicao });
      eventos.push(normalizado);
    }
    if (secao.nivel !== "NORMAL" && !eventos.some((e) => e.ativo === ativo && e.aceito)) {
      avisos.push({ item: { ativo, nivel: secao.nivel }, motivo: `Nível ${secao.nivel} sem nenhum evento sustentado por site confiável confirmado na pesquisa.` });
    }
  }

  const leitura = {
    data_referencia: resposta.dataReferencia,
    nivel_ouro: secoes.OURO.nivel,
    resumo_ouro: secoes.OURO.resumo,
    nivel_petroleo: secoes.PETROLEO.nivel,
    resumo_petroleo: secoes.PETROLEO.resumo,
    texto_bruto: resposta.texto,
    instrucao_sistema: resposta.instrucaoDoSistema,
    prompt: resposta.prompt,
    versao_prompt: resposta.versaoPrompt,
    modelo: resposta.modelo,
    tokens: resposta.tokens,
    chave: resposta.chave,
    grounding: resposta.grounding
  };
  return { validos: [{ leitura, eventos }], invalidos, avisos, detalhes: detalhesDaIa(resposta) };
}

async function persist(validos, { execucaoId }, deps = {}) {
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const resultado = { criados: 0, atualizados: 0, ignorados: 0, falhas: [] };
  for (const { pular, leitura, eventos } of validos) {
    if (pular) {
      resultado.ignorados += 1;
      continue;
    }
    const { substituiu } = await repo.substituirLeituraDoDia({ ...leitura, collection_execution_id: execucaoId }, eventos);
    if (substituiu) resultado.atualizados += 1;
    else resultado.criados += 1;
  }
  return resultado;
}

module.exports = {
  codigo: "geopolitica-ia-diario",
  // O provedor já controla o tempo de cada chamada e as repetições (5xx na mesma chave, depois a chave paga). Este é
  // o teto da execução inteira: no pior caso, uma chamada longa com cada chave, mais as esperas entre tentativas.
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
  montarPrompt
};
