"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const geminiSearch = require("../../ai/gemini-search.provider");
const { carregarPrompt } = require("../../ai/carregar-prompt");
const geopoliticaRepository = require("../../repositories/geopolitica.repository");
const { parsearBoletim } = require("./geopolitica-boletim.parser");
const { resolverLinks, paginasDoTrecho } = require("./paginas-da-pesquisa");
const { FONTES, fonteDaUrl, paginaEspecifica, classificarFonte, fontesDaPesquisa, listaParaPrompt, sugestoesDeBusca } = require("./fontes-autorizadas");
const { ATIVOS, NOME_ATIVO, ROTULO_ATIVO, TIPOS, LEITURAS, TODAS_AS_FRENTES } = require("../../shared/eventos-mercado");
const { FATORES } = require("../../shared/fatores-fel1");

// Leitura diária de EVENTOS DE MERCADO do ouro, do petróleo, do milho e do café. Nasceu como a leitura de geopolítica
// do ouro e do petróleo (ADR 0047, no padrão do AgroMind, ADR 0027 de lá) e foi estendida no mesmo coletor (ADR 0049):
// a geopolítica virou um dos sete tipos de evento.
//
// O QUE É: DUAS chamadas diárias ao Gemini com busca na web (ai/gemini-search.provider.js), uma por frente (ouro e
// petróleo; milho e café, shared/eventos-mercado.js), em paralelo. Cada uma é orientada às fontes autorizadas que cobrem
// os seus ativos (fontes-autorizadas.js), decide o nível deles e só lista eventos deles: fatos externos, recentes e
// relevantes para o preço que o FinMind não obtém dos observáveis (preço, produção, exportação, estoque e relatórios
// periódicos NÃO são evento). As respostas são texto com rótulos fixos (ai/prompts/geopolitica-diaria.md), lido por um
// parser determinístico. Não é um sistema de acompanhamento: não há identidade de evento entre dias.
//
// O QUE É GRAVADO: UMA leitura por dia, juntando as duas chamadas (nível e resumo de cada ativo, as respostas, os
// prompts, o modelo e o grounding das duas, cada página marcada com a frente) e os eventos, uma linha por (evento, ativo
// afetado). Reexecutar no mesmo dia substitui a leitura do dia, numa transação.
//
// VALIDAÇÃO: cada chamada precisa ter pesquisado (ao menos uma página lida; senão, mais uma tentativa e, se falhar de
// novo, a execução falha sem gravar nada). As seções de todos os ativos e um nível reconhecível em cada uma são
// obrigatórios; faltou algo, nada é gravado (item inválido, execução "failed") e uma leitura anterior do mesmo dia fica
// como estava. Um evento só é aceito se uma PÁGINA de fonte autorizada (domínio e, no gov.br, o caminho da instituição)
// que a pesquisa daquela chamada de fato leu estiver ligada, pelo grounding, ao texto DESTE evento. A citação da IA não
// basta. Sem isso, o evento é gravado como rejeitado (aceito = false, vai para a tela, não vai ao Motor) e vira aviso da
// execução, não falha: é o filtro funcionando. Um ativo NORMAL sem o mínimo de pesquisa vira aviso (piso por ativo). Um
// evento sustentado só por páginas que já sustentaram um evento aceito do mesmo ativo nos últimos dias (ou na mesma
// leitura) é rejeitado como repetição (ADR 0092).
//
// A data de referência é o dia em São Paulo (a análise é feita no Brasil). A busca ao vivo não é reproduzível: a
// leitura só vale da primeira coleta em diante e não serve para backtest (ADR 0047).

// Uma configuração por LEITURA (ADR 0115): a principal (os quatro ativos validados, duas frentes, o prompt de sempre) e
// a da soja (fase 1 da soja, só aquisição: uma frente, prompt próprio, outra linha por dia). Cada uma é um coletor com
// execução, falha e "refazer" próprios: a da soja nunca toca na leitura principal.
const ARQUIVO_PROMPT = "geopolitica-diaria.md";
const CONFIGURACOES = {
  PRINCIPAL: { codigo: "geopolitica-ia-diario", leitura: LEITURAS.PRINCIPAL.codigo, frentes: LEITURAS.PRINCIPAL.frentes, arquivoPrompt: ARQUIVO_PROMPT },
  SOJA: { codigo: "geopolitica-ia-soja", leitura: LEITURAS.SOJA.codigo, frentes: LEITURAS.SOJA.frentes, arquivoPrompt: "eventos-soja-diaria.md" }
};

function frentePorCodigo(codigo) {
  return TODAS_AS_FRENTES.find((f) => f.codigo === codigo);
}

function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

const ROTULO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.codigo, t.rotulo]));

// Piso por ativo (ADR 0049, itens 8, 10 e 13): o mínimo de pesquisa antes de declarar um ativo NORMAL. Cada exigência tem o
// texto do prompt e a regra que o coletor confere pelas fontes de fato lidas. Petróleo: uma fonte de geopolítica ou de
// oferta do ativo (ADR 0092). Ouro: a AP ou o Tesouro.
// Milho e café: uma fonte de política comercial ou regulação (o INMET sozinho não basta). Milho, também: a AP News (a
// guerra no Mar Negro, que nenhuma fonte de comércio cobre). Não reescreve o nível da IA nem rejeita a leitura: vira
// aviso da execução, para acompanhar a cobertura dia a dia.
const TIPOS_DO_PISO_AGRO = ["POLITICA_COMERCIAL", "REGULACAO"];
// Petróleo (ADR 0092): as fontes de furacão (NHC, BSEE) e de rota (Canal do Panamá) cobrem o petróleo, mas um dia sem
// tempestade não diz nada sobre Ormuz ou a OPEP+: sozinhas, não cumprem o piso.
const TIPOS_DO_PISO_PETROLEO = ["GEOPOLITICA", "POLITICA_OFERTA"];
const GEOPOLITICA_OU_OFERTA = {
  descricao: "fonte de geopolítica ou de oferta do petróleo",
  instrucao: "ao menos uma busca numa fonte de geopolítica ou de oferta que cobre o ativo (a lista diz os tipos e os ativos de cada fonte); as de furacão e de rota sozinhas não bastam",
  vale: (fonte) => fonte.ativos.includes("PETROLEO") && fonte.tipos.some((t) => TIPOS_DO_PISO_PETROLEO.includes(t))
};
const COMERCIO_DO_ATIVO = (ativo) => ({
  descricao: "fonte de política comercial ou regulação do ativo",
  instrucao: "ao menos uma busca numa fonte de política comercial ou regulação que cobre o ativo (a lista diz os tipos e os ativos de cada fonte); o INMET sozinho não basta",
  vale: (fonte) => fonte.ativos.includes(ativo) && fonte.tipos.some((t) => TIPOS_DO_PISO_AGRO.includes(t))
});
// Ouro (v12): o UKMTO cobre o ouro, mas só pela rota marítima; o canal do ouro é a escalada e as sanções. No diagnóstico
// de 2026-10-02 (10 leituras), a chamada de ouro e petróleo leu só o UKMTO em 4 e declarou o ouro NORMAL sem olhar a AP
// nem o Tesouro.
const ESCALADA_OU_SANCAO = {
  descricao: "busca na AP News ou no Tesouro dos EUA",
  instrucao: "ao menos uma busca na AP News (escalada militar entre Estados) ou no Tesouro dos EUA (sanções); o UKMTO sozinho não basta",
  vale: (fonte) => fonte === FONTES.AP || fonte === FONTES.TESOURO
};
const MAR_NEGRO = {
  descricao: "busca na AP News (Mar Negro)",
  instrucao: "uma busca na AP News sobre o Mar Negro (a guerra Rússia-Ucrânia e os portos de grãos, como Odessa): a Ucrânia é grande exportadora de milho",
  vale: (fonte) => fonte === FONTES.AP
};
// Soja (ADR 0115): uma fonte de política comercial ou regulação PARA A SOJA (o bloco `soja` da fonte).
const COMERCIO_DA_SOJA = {
  descricao: "fonte de política comercial ou regulação da soja",
  instrucao: "ao menos uma busca numa fonte de política comercial ou regulação da soja (a lista diz os tipos de cada fonte); as de logística sozinhas não bastam",
  vale: (fonte) => Boolean(fonte.soja) && fonte.soja.tipos.some((t) => TIPOS_DO_PISO_AGRO.includes(t))
};
const PISO = {
  OURO: [ESCALADA_OU_SANCAO],
  PETROLEO: [GEOPOLITICA_OU_OFERTA],
  MILHO: [COMERCIO_DO_ATIVO("MILHO"), MAR_NEGRO],
  CAFE: [COMERCIO_DO_ATIVO("CAFE")],
  SOJA: [COMERCIO_DA_SOJA]
};

// As exigências do piso que nenhuma fonte lida cumpriu ([] = piso cumprido).
function faltasDoPiso(ativo, fontesLidas) {
  return PISO[ativo].filter((exigencia) => !fontesLidas.some((codigo) => exigencia.vale(FONTES[codigo]))).map((e) => e.descricao);
}

// "- MILHO: ao menos uma busca numa fonte de política comercial...; e uma busca na AP News sobre o Mar Negro..."
function pisoParaPrompt(ativos) {
  return ativos.map((ativo) => `- ${ROTULO_ATIVO[ativo]}: ${PISO[ativo].map((e) => e.instrucao).join("; e ")}.`).join("\n");
}

// "- POLITICA_COMERCIAL (Política comercial): tarifa, embargo..."
function tiposParaPrompt() {
  return TIPOS.map((t) => `- ${t.codigo} (${t.rotulo}): ${t.descricao}`).join("\n");
}

// Os fatores do FEL 1 dos ativos da chamada, agrupados por ativo: "OURO\n- OURO_GEOPOLITICA: Geopolítica e risco sistêmico".
function fatoresParaPrompt(ativos) {
  return ativos.map((ativo) => [ativo, ...FATORES.filter((f) => f.ativo === ativo).map((f) => `- ${f.codigo}: ${f.nome}`)].join("\n")).join("\n");
}

// REPETIÇÃO (ADR 0092): sem identidade de evento entre dias (ADR 0047), o mesmo fato voltava dia após dia, porque
// "recente" vale 24 a 48 horas. Duas medidas, sem criar acompanhamento de eventos:
// - o prompt de cada frente traz os eventos aceitos dos ativos dela nos últimos dias, com a regra de só repetir um
//   desdobramento novo;
// - o coletor rejeita o evento cujas páginas que o sustentam já sustentaram um evento aceito do mesmo ativo nessa janela
//   ou antes, na mesma leitura. As páginas de fonte reescrita na mesma URL (`paginaAtualizada`) não contam.
const JANELA_REPETICAO_DIAS = 3;

function diasAntes(data, dias) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function ddmm(data) {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

// "…/sb0644", "…/sb0644/" e "…/sb0644#x" são a mesma página.
function chaveDaPagina(url) {
  return String(url).replace(/#.*$/, "").replace(/\/+$/, "");
}

// Páginas que sustentam o evento (origem "pesquisa") e que servem para reconhecer a repetição.
function paginasDeRepeticao(fontes) {
  return fontes
    .filter((fonte) => fonte.origem === "pesquisa" && fonte.url && !FONTES[fonte.fonteAutorizada]?.paginaAtualizada)
    .map((fonte) => chaveDaPagina(fonte.url));
}

// Linhas gravadas -> [{ data, ativo, titulo, paginas }], do repositório (eventos aceitos da janela).
function eventosRecentesDe(registros) {
  return registros.map((r) => ({
    data: r.leitura?.data_referencia ?? r.data,
    ativo: r.ativo,
    titulo: r.titulo,
    paginas: paginasDeRepeticao(r.fontes || [])
  }));
}

// "- 05/10 (PETRÓLEO, OURO): Navio-tanque atingido em Ormuz" - um fato com vários ativos vira uma linha só.
function eventosRecentesParaPrompt(recentes, ativos) {
  const linhas = new Map();
  for (const evento of recentes.filter((e) => ativos.includes(e.ativo))) {
    const chave = `${evento.data}|${evento.titulo}`;
    if (!linhas.has(chave)) linhas.set(chave, { ...evento, ativos: [] });
    linhas.get(chave).ativos.push(ROTULO_ATIVO[evento.ativo]);
  }
  if (linhas.size === 0) return `Nenhum evento aceito nos últimos ${JANELA_REPETICAO_DIAS} dias.`;
  return [...linhas.values()].map((e) => `- ${ddmm(e.data)} (${e.ativos.join(", ")}): ${e.titulo}`).join("\n");
}

// O prompt de uma frente: a mesma instrução do sistema, com os ativos, o piso, as fontes, os fatores, as sugestões e os
// eventos recentes dela.
function montarPrompt(dataReferencia, frente, recentes = [], arquivo = ARQUIVO_PROMPT) {
  return carregarPrompt(arquivo, {
    eventos_recentes: eventosRecentesParaPrompt(recentes, frente.ativos),
    data_referencia: dataReferencia,
    ativos: frente.ativos.map((ativo) => ROTULO_ATIVO[ativo]).join(" e "),
    piso: pisoParaPrompt(frente.ativos),
    fontes_confiaveis: listaParaPrompt({ rotuloTipo: ROTULO_TIPO, nomeAtivo: NOME_ATIVO, ativos: frente.ativos }),
    tipos: tiposParaPrompt(),
    fatores: fatoresParaPrompt(frente.ativos),
    sugestoes_busca: sugestoesDeBusca({ ativos: frente.ativos })
  });
}

// Quantas chamadas fazer, por frente, até a IA de fato pesquisar (ver `pesquisou`).
const TENTATIVAS_ATE_PESQUISAR = 2;

// A IA pesquisou de verdade? Só se a resposta trouxer ao menos uma página lida no grounding. Em 2026-10-02, por alguns
// minutos (12h27-12h31), o Gemini respondeu SEM pesquisar, sem erro nenhum: escreveu nível, resumo e eventos de memória,
// citando AP, UKMTO e Tesouro sem ter lido nada. Os eventos foram rejeitados pela conferência, mas o nível e o resumo
// teriam ido ao Motor. Sem pesquisa, não há leitura.
function pesquisou(resposta) {
  return (resposta.grounding?.groundingChunks || []).length > 0;
}

// Uma resposta que de fato pesquisou (com nova tentativa se a IA não pesquisou), com os links do grounding resolvidos
// (eles expiram).
async function responderPesquisando(frente, { instrucaoDoSistema, prompt, provedor, signal, fetchFn }) {
  let resposta;
  for (let tentativa = 1; tentativa <= TENTATIVAS_ATE_PESQUISAR; tentativa += 1) {
    resposta = await provedor.pesquisarNaWeb({ systemInstruction: instrucaoDoSistema, prompt, signal });
    if (pesquisou(resposta)) break;
  }
  if (!pesquisou(resposta)) {
    // Falha de comunicação, não item inválido: nada é gravado, a execução fica "failed" e uma leitura anterior do mesmo
    // dia continua valendo; sem leitura no dia, o Motor recebe "leitura indisponível", nunca o que a IA lembrou.
    throw new UpstreamServiceError(
      `A IA respondeu sem pesquisar (nenhuma página lida) em ${TENTATIVAS_ATE_PESQUISAR} tentativas na chamada "${frente.nome}": leitura descartada, nada foi gravado.`
    );
  }
  await resolverLinks(resposta.grounding, { fetchFn, signal });
  return resposta;
}

// Quantas exigências do piso a resposta deixou de cumprir, somando os ativos da frente que vieram NORMAL. Uma seção
// ausente ou fora da escala não conta aqui (o normalize a recusa depois).
function faltasDaResposta(frente, resposta) {
  const boletim = parsearBoletim(resposta.texto);
  const fontesLidas = fontesDaPesquisa(resposta.grounding);
  return frente.ativos.reduce((total, ativo) => total + (boletim.ativos[ativo]?.nivel === "NORMAL" ? faltasDoPiso(ativo, fontesLidas).length : 0), 0);
}

// Uma frente. Se a resposta declarou um ativo NORMAL sem cumprir o piso (ADR 0049, item 14), a chamada desta frente é
// repetida UMA vez e fica a resposta com menos faltas (no empate, a primeira). Só esta frente repete; os tokens da
// resposta descartada entram na conta da execução. Se a repetição falhar, fica a primeira resposta.
async function chamarFrente(frente, { dataReferencia, recentes, provedor, signal, fetchFn, arquivoPrompt }) {
  const { versao, instrucaoDoSistema, prompt } = montarPrompt(dataReferencia, frente, recentes, arquivoPrompt);
  const contexto = { instrucaoDoSistema, prompt, provedor, signal, fetchFn };
  let resposta = await responderPesquisando(frente, contexto);
  let tokensDescartados = 0;
  let repetidaPeloPiso = false;

  const faltas = faltasDaResposta(frente, resposta);
  if (faltas > 0) {
    repetidaPeloPiso = true;
    try {
      const outra = await responderPesquisando(frente, contexto);
      if (faltasDaResposta(frente, outra) < faltas) {
        tokensDescartados = resposta.tokens || 0;
        resposta = outra;
      } else {
        tokensDescartados = outra.tokens || 0;
      }
    } catch {
      // A repetição é só uma segunda chance: sem ela, segue a primeira resposta (o normalize avisa o piso que faltou).
    }
  }
  return { frente: frente.codigo, ...resposta, tokensDescartados, repetidaPeloPiso, prompt, instrucaoDoSistema, versaoPrompt: versao };
}

async function download(config, { signal }, deps = {}) {
  const provedor = deps.geminiSearch || geminiSearch;
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const dataReferencia = deps.dataReferencia || hojeEmSaoPaulo();
  const refazer = deps.refazer ?? env.geopolitica.refazer;

  // Uma leitura por dia, a primeira que der certo: o cron roda 3 vezes (01h, 03h e 05h em Brasília) e as execuções
  // seguintes só servem de nova tentativa quando a anterior falhou. Pular não gasta chamada; fica como "ignorado" na
  // execução. GEOPOLITICA_REFAZER=1 força uma nova leitura, que substitui a do dia.
  if (!refazer && (await repo.existeLeituraDoDia(dataReferencia, config.leitura))) {
    return { pular: true, dataReferencia };
  }

  // Os aceitos dos dias anteriores (não os do próprio dia: refazer o dia substitui a leitura dele).
  const recentes = eventosRecentesDe(
    await repo.listarEventosAceitosRecentes({ dataInicio: diasAntes(dataReferencia, JANELA_REPETICAO_DIAS), dataFim: diasAntes(dataReferencia, 1) })
  );

  // As frentes da leitura em paralelo; se uma falhar, nada é gravado (a leitura do dia é uma só).
  const chamadas = await Promise.all(
    config.frentes.map((frente) =>
      chamarFrente(frente, { dataReferencia, recentes, provedor, signal, fetchFn: deps.fetch || fetch, arquivoPrompt: config.arquivoPrompt })
    )
  );
  return { dataReferencia, versaoPrompt: chamadas[0].versaoPrompt, instrucaoDoSistema: chamadas[0].instrucaoDoSistema, chamadas, eventosRecentes: recentes };
}

function parse(resposta) {
  return [resposta];
}

function descreverFonte(fonte) {
  return fonte.url || fonte.nome || "?";
}

// Fontes do evento, em duas origens:
// - "pesquisa": página de uma fonte autorizada (pela URL final: domínio e, no gov.br, o caminho da instituição) que a
//   pesquisa leu e que o grounding liga a um trecho DESTE evento. Traz o link direto (o aviso, o comunicado, a ordem).
//   É a ÚNICA origem que sustenta o evento.
// - "citada": o que a IA escreveu em "Fontes:", só para exibir. `fonteAutorizada` = código da fonte (ou null) e
//   `confirmadaNaPesquisa` = alguma página dessa fonte foi lida nesta pesquisa (não necessariamente sobre este evento).
//   Uma citação da mesma fonte de uma página "pesquisa" não se repete.
function montarFontes(evento, fontesLidas, grounding) {
  const daPesquisa = [];
  for (const pagina of paginasDoTrecho(evento.trecho, grounding)) {
    // Página de autor, de tag ou listagem não sustenta o fato (ADR 0049, item 15).
    const codigo = paginaEspecifica(pagina.url) ? fonteDaUrl(pagina.url) : null;
    // "…/sb0644" e "…/sb0644/" são a mesma página.
    const mesmaPagina = (url) => url.replace(/\/+$/, "") === pagina.url.replace(/\/+$/, "");
    if (codigo && !daPesquisa.some((fonte) => mesmaPagina(fonte.url))) {
      daPesquisa.push({ nome: FONTES[codigo].nome, url: pagina.url, fonteAutorizada: codigo, confirmadaNaPesquisa: true, origem: "pesquisa" });
    }
  }
  const fontesComPagina = new Set(daPesquisa.map((fonte) => fonte.fonteAutorizada));
  const citadas = evento.fontes
    .map((fonte) => {
      const fonteAutorizada = classificarFonte(fonte);
      const confirmadaNaPesquisa = Boolean(fonteAutorizada) && fontesLidas.includes(fonteAutorizada);
      return { ...fonte, fonteAutorizada, confirmadaNaPesquisa, origem: "citada" };
    })
    .filter((fonte) => !(fonte.fonteAutorizada && fontesComPagina.has(fonte.fonteAutorizada)));
  return [...daPesquisa, ...citadas];
}

function nomesDasFontes(fontes) {
  return [...new Set(fontes.map((fonte) => FONTES[fonte.fonteAutorizada].nome))].join(", ");
}

// Por que o evento não se sustenta (só quando não há página "pesquisa").
function motivoDaRejeicao(fontes) {
  const lidas = fontes.filter((fonte) => fonte.fonteAutorizada && fonte.confirmadaNaPesquisa);
  const naoLidas = fontes.filter((fonte) => fonte.fonteAutorizada && !fonte.confirmadaNaPesquisa);
  if (lidas.length > 0) {
    return `Fonte autorizada citada e lida na pesquisa (${nomesDasFontes(lidas)}), mas nenhuma página dela sustenta o texto deste evento.`;
  }
  if (naoLidas.length > 0) return `Fonte autorizada citada (${nomesDasFontes(naoLidas)}), mas nenhuma página dela foi lida nesta pesquisa.`;
  if (fontes.length === 0) return "Nenhuma fonte citada e nenhuma página de fonte autorizada ligada ao evento.";
  return `Nenhuma fonte autorizada; citadas: ${fontes.map(descreverFonte).join("; ")}`;
}

// Um evento da IA -> uma linha por ativo afetado (só os da frente), todas com as mesmas fontes e o mesmo aceite; o
// fator, a pressão, a intensidade e o canal são os daquele ativo.
function normalizarEvento(evento, ativos, fontesLidas, grounding) {
  const fontes = montarFontes(evento, fontesLidas, grounding);
  const aceito = fontes.some((fonte) => fonte.origem === "pesquisa");
  const motivo = aceito ? null : motivoDaRejeicao(fontes).slice(0, 255);
  return ativos.map((ativo) => ({
    ativo,
    tipo: evento.tipo,
    fator: evento.porAtivo[ativo].fator,
    ordem: evento.ordem,
    titulo: evento.titulo.slice(0, 300),
    resumo: evento.resumo,
    canal_transmissao: evento.porAtivo[ativo].canal,
    pressao: evento.porAtivo[ativo].pressao,
    intensidade: evento.porAtivo[ativo].intensidade,
    confianca: evento.confianca,
    fontes,
    aceito,
    motivo_rejeicao: motivo
  }));
}

// O grounding das duas chamadas num só (o que fica gravado na leitura): cada página marcada com a frente, e os índices
// dos trechos apoiados deslocados para a lista única de páginas.
function juntarGroundings(chamadas) {
  const junto = { webSearchQueries: [], groundingChunks: [], groundingSupports: [] };
  for (const chamada of chamadas) {
    const g = chamada.grounding || {};
    const deslocamento = junto.groundingChunks.length;
    junto.webSearchQueries.push(...(g.webSearchQueries || []));
    junto.groundingChunks.push(...(g.groundingChunks || []).map((c) => ({ ...c, frente: chamada.frente })));
    junto.groundingSupports.push(
      ...(g.groundingSupports || []).map((s) => ({ ...s, frente: chamada.frente, groundingChunkIndices: (s.groundingChunkIndices || []).map((i) => i + deslocamento) }))
    );
  }
  return junto;
}

// Os textos das chamadas num só, cada um com o nome da frente (a resposta bruta e o prompt gravados na leitura).
function juntarTextos(chamadas, campo) {
  return chamadas.map((chamada) => `=== ${frentePorCodigo(chamada.frente).nome.toUpperCase()} ===\n${chamada[campo]}`).join("\n\n");
}

// Dados das chamadas de IA para o detalhe da execução (tela Execuções): qual chave respondeu, o modelo, os tokens, quanto
// as pesquisas trabalharam e quais fontes autorizadas cada uma leu (é por aqui que se acompanha a cobertura, ADR 0049).
// Vão em metadata.detalhes da execução (collector-runner.js).
function detalhesDaIa(resposta) {
  const chamadas = resposta.chamadas || [];
  const soma = (fn) => chamadas.reduce((total, c) => total + fn(c), 0);
  const fontesLidasPorChamada = Object.fromEntries(chamadas.map((c) => [c.frente, fontesDaPesquisa(c.grounding)]));
  return {
    ia: {
      chave: chamadas.some((c) => c.chave === "paga") ? "paga" : (chamadas[0]?.chave ?? null),
      modelo: chamadas[0]?.modelo ?? null,
      // Inclui os tokens das respostas descartadas na repetição pelo piso: é o custo real da execução.
      tokens: chamadas.some((c) => c.tokens != null) ? soma((c) => (c.tokens || 0) + (c.tokensDescartados || 0)) : null,
      repeticoesPeloPiso: chamadas.filter((c) => c.repetidaPeloPiso).length,
      versaoPrompt: resposta.versaoPrompt ?? null,
      chamadas: chamadas.length,
      buscas: soma((c) => (c.grounding?.webSearchQueries || []).length),
      paginasLidas: soma((c) => (c.grounding?.groundingChunks || []).length),
      fontesLidas: [...new Set(Object.values(fontesLidasPorChamada).flat())],
      fontesLidasPorChamada
    }
  };
}

// Por ativo, as páginas que já sustentaram um evento aceito: { PETROLEO: Map(página -> { data, titulo }) }.
function paginasVistasDe(recentes) {
  const vistas = Object.fromEntries(ATIVOS.map((ativo) => [ativo, new Map()]));
  for (const evento of recentes) {
    for (const pagina of evento.paginas) {
      if (vistas[evento.ativo] && !vistas[evento.ativo].has(pagina)) vistas[evento.ativo].set(pagina, evento);
    }
  }
  return vistas;
}

// O motivo, se a linha aceita repete um evento: TODAS as páginas que a sustentam já sustentaram um evento aceito do mesmo
// ativo. Uma página nova basta para não ser repetição. Não repetida, as páginas dela passam a contar para as próximas.
function repeticao(linha, paginasVistas, dataReferencia) {
  const paginas = paginasDeRepeticao(linha.fontes);
  const vistas = paginasVistas[linha.ativo];
  if (paginas.length > 0 && paginas.every((pagina) => vistas.has(pagina))) {
    const anterior = vistas.get(paginas[0]);
    const quando = anterior.data === dataReferencia ? "nesta mesma leitura" : `em ${ddmm(anterior.data)}`;
    return `Repetição: a página que sustenta este evento já sustentou "${anterior.titulo}" ${quando}.`;
  }
  for (const pagina of paginas) if (!vistas.has(pagina)) vistas.set(pagina, { data: dataReferencia, titulo: linha.titulo });
  return null;
}

function normalize(config, [resposta]) {
  // Já havia leitura de hoje: nada a validar; o persist conta como "ignorado".
  if (resposta.pular) return { validos: [{ pular: true }], invalidos: [], avisos: [] };

  const invalidos = [];
  const avisos = [];
  const secoes = {};
  const eventos = [];
  const paginasVistas = paginasVistasDe(resposta.eventosRecentes || []);

  for (const chamada of resposta.chamadas) {
    const frente = frentePorCodigo(chamada.frente);
    const boletim = parsearBoletim(chamada.texto);
    for (const ativo of frente.ativos) {
      const secao = boletim.ativos[ativo];
      if (!secao) {
        invalidos.push({ item: { ativo }, motivo: `A resposta da chamada "${frente.nome}" não trouxe a seção ${ativo}.` });
      } else if (!secao.nivel) {
        invalidos.push({ item: { ativo, nivel: secao.nivelTexto }, motivo: `Nível do ${NOME_ATIVO[ativo]} fora da escala: "${secao.nivelTexto ?? ""}".` });
      } else {
        secoes[ativo] = secao;
      }
    }
    if (invalidos.length > 0) continue;

    const fontesLidas = fontesDaPesquisa(chamada.grounding);
    for (const evento of boletim.eventos) {
      // Só os ativos desta frente: um ativo de fora é lido (e decidido) na outra chamada.
      const ativos = evento.ativos.filter((a) => frente.ativos.includes(a));
      if (!evento.titulo) {
        avisos.push({ item: { frente: frente.codigo, ordem: evento.ordem }, motivo: "EVENTO sem título reconhecível, descartado." });
        continue;
      }
      if (ativos.length === 0) {
        avisos.push({ item: { frente: frente.codigo, ordem: evento.ordem, titulo: evento.titulo }, motivo: 'EVENTO sem nenhum ativo desta chamada em "Ativos:", descartado.' });
        continue;
      }
      if (!evento.tipo) {
        avisos.push({ item: { frente: frente.codigo, ordem: evento.ordem, tipo: evento.tipoTexto }, motivo: `Tipo fora da lista: "${evento.tipoTexto ?? ""}" (gravado sem tipo).` });
      }
      const linhas = normalizarEvento(evento, ativos, fontesLidas, chamada.grounding);
      if (!linhas[0].aceito) avisos.push({ item: { ativos, titulo: linhas[0].titulo }, motivo: linhas[0].motivo_rejeicao });
      for (const linha of linhas.filter((l) => l.aceito)) {
        const repetido = repeticao(linha, paginasVistas, resposta.dataReferencia);
        if (repetido) {
          linha.aceito = false;
          linha.motivo_rejeicao = repetido.slice(0, 255);
          avisos.push({ item: { ativo: linha.ativo, titulo: linha.titulo }, motivo: linha.motivo_rejeicao });
        }
      }
      eventos.push(...linhas);
    }
    for (const ativo of frente.ativos) {
      const { nivel } = secoes[ativo];
      if (nivel !== "NORMAL" && !eventos.some((e) => e.ativo === ativo && e.aceito)) {
        avisos.push({ item: { ativo, nivel }, motivo: `Nível ${nivel} sem nenhum evento sustentado por página de fonte autorizada.` });
      }
      const faltas = nivel === "NORMAL" ? faltasDoPiso(ativo, fontesLidas) : [];
      if (faltas.length > 0) {
        avisos.push({ item: { ativo, fontesLidas }, motivo: `Nível NORMAL do ${NOME_ATIVO[ativo]} sem ${faltas.join(" nem ")} lida na pesquisa.` });
      }
    }
  }
  // As chamadas aconteceram (e gastaram tokens) mesmo com a resposta fora do formato: os detalhes vão junto.
  if (invalidos.length > 0) return { validos: [], invalidos, avisos, detalhes: detalhesDaIa(resposta) };

  const detalhes = detalhesDaIa(resposta);
  const leitura = {
    data_referencia: resposta.dataReferencia,
    frente: config.leitura,
    // Só as colunas dos ativos desta leitura (a principal não tem a soja; a da soja não tem os outros).
    ...Object.fromEntries(
      config.frentes.flatMap((f) => f.ativos).flatMap((ativo) => {
        const coluna = ativo.toLowerCase();
        return [
          [`nivel_${coluna}`, secoes[ativo].nivel],
          [`resumo_${coluna}`, secoes[ativo].resumo]
        ];
      })
    ),
    texto_bruto: juntarTextos(resposta.chamadas, "texto"),
    instrucao_sistema: resposta.instrucaoDoSistema,
    prompt: juntarTextos(resposta.chamadas, "prompt"),
    versao_prompt: resposta.versaoPrompt,
    modelo: detalhes.ia.modelo,
    tokens: detalhes.ia.tokens,
    chave: detalhes.ia.chave,
    grounding: juntarGroundings(resposta.chamadas)
  };
  return { validos: [{ leitura, eventos }], invalidos, avisos, detalhes };
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

// Coletor de uma leitura de CONFIGURACOES ("PRINCIPAL", "SOJA").
function criarColetorEventos(chave) {
  const config = CONFIGURACOES[chave];
  return {
    codigo: config.codigo,
    // O provedor já controla o tempo de cada chamada e as repetições (5xx na mesma chave, depois a chave paga). Este é
    // o teto da execução inteira: as frentes rodam em paralelo; no pior caso, uma frente faz quatro chamadas longas
    // em sequência (nova tentativa quando a IA não pesquisa, e a repetição pelo piso), mais as esperas entre tentativas.
    get timeoutMs() {
      return 4 * env.gemini.timeoutMs + 60000;
    },
    // Sem repetição no runner: repetir aqui refaria também a chamada com a chave paga.
    tentativasRetry: 1,
    download: (opcoes, deps) => download(config, opcoes, deps),
    parse,
    normalize: (itens) => normalize(config, itens),
    persist
  };
}

// O módulo continua sendo o coletor da leitura principal (o de antes), com o da soja ao lado.
// (Object.assign sobre o próprio coletor preserva o getter do timeout.)
module.exports = Object.assign(criarColetorEventos("PRINCIPAL"), {
  coletorSoja: criarColetorEventos("SOJA"),
  hojeEmSaoPaulo,
  montarPrompt
});
