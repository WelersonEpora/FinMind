"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./geopolitica-ia.collector");
const { parsearBoletim, parsearFontes, vocabulario, tipo, listaDeAtivos, valoresPorAtivo, textoPorAtivo, fator, NIVEIS } = require("./geopolitica-boletim.parser");
const { FONTES, fonteDaUrl, paginaEspecifica, classificarFonte, fontesDaPesquisa, fontesDosAtivos } = require("./fontes-autorizadas");
const { ATIVOS, CODIGOS_TIPO } = require("../../shared/eventos-mercado");

// Respostas no formato do prompt v11, uma por chamada, com as variações de markdown que o Gemini às vezes usa (### e
// **). Nenhum teste chama o Gemini.
const TEXTO_OP = `OURO
Nível: Relevante
Resumo: Tensão no Mar Vermelho eleva o risco.

PETRÓLEO
Nível: EXCEPCIONAL
Resumo: Petroleiro atingido no Mar Vermelho.

EVENTOS

### EVENTO 1
**Título:** Petroleiro atingido por projétil no Mar Vermelho
**Tipo:** GEOPOLITICA
**Ativos:** PETRÓLEO, OURO, CAFÉ
**Fator:** PETROLEO=PETROLEO_GEOPOLITICA; OURO=OURO_GEOPOLITICA
**Resumo:** O UKMTO relatou um petroleiro atingido perto de Bab el-Mandeb.
**Canal de transmissão:** Rota e seguro do petróleo; busca por proteção no ouro.
**Pressão sobre o preço:** PETROLEO=alta; OURO=ambígua
**Intensidade:** alta
**Confiança:** alta
**Fontes:**
- UKMTO - https://www.ukmto.org

EVENTO 2
Título: Comentário de mercado sem página ligada
Tipo: Opinião
Ativos: OURO
Fator: OURO=FATOR_INVENTADO
Resumo: Texto qualquer.
Canal de transmissão: Proteção.
Pressão sobre o preço: OURO=ambígua
Fontes: AP News - https://apnews.com/article/x
`;

const TEXTO_MC = `MILHO
Nível: Atenção
Resumo: A China anunciou tarifa sobre o milho dos EUA.

CAFÉ
Nível: NORMAL
Resumo: Nada fora do normal.

EVENTOS

EVENTO 1
Título: China anuncia tarifa de 15% sobre o milho dos EUA
Tipo: Política comercial
Ativos: MILHO
Fator: MILHO=MILHO_POLITICA_COMERCIAL
Resumo: O MOFCOM anunciou contramedidas.
Canal de transmissão: Desvio da demanda chinesa para o milho do Brasil.
Pressão sobre o preço: alta
Intensidade: média
Confiança: alta
Fontes: Reuters - https://www.reuters.com/markets/china-corn
`;

const PDF_UKMTO = "https://www.ukmto.org/-/media/ukmto/products/warning-150-26.pdf";
const PAGINA_AP = "https://apnews.com/article/outro-assunto-123";

// Chamada de ouro e petróleo: a página do UKMTO apoia o EVENTO 1; a da AP foi lida, mas apoia outro trecho (o resumo do
// ouro), não o EVENTO 2; uma página do Kitco também foi lida.
const GROUNDING_OP = {
  webSearchQueries: ["site:ukmto.org warning", "site:apnews.com Red Sea"],
  groundingChunks: [
    { web: { title: "ukmto.org", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a", urlFinal: PDF_UKMTO } },
    { web: { title: "apnews.com", urlFinal: PAGINA_AP } },
    { web: { title: "kitco.com", urlFinal: "https://www.kitco.com/news/x" } }
  ],
  groundingSupports: [
    { segment: { text: "Petroleiro atingido por projétil no Mar Vermelho" }, groundingChunkIndices: [0] },
    { segment: { text: "Tensão no Mar Vermelho eleva o risco." }, groundingChunkIndices: [1] }
  ]
};

// Chamada de milho e café: a pesquisa leu o USTR (cumpre o piso do café, que está NORMAL), sem página ligada à tarifa.
const GROUNDING_MC = {
  webSearchQueries: ["site:ustr.gov China"],
  groundingChunks: [{ web: { title: "ustr.gov", urlFinal: "https://ustr.gov/about/press/x" } }],
  groundingSupports: []
};

function chamada(frente, texto, grounding, extra = {}) {
  return { frente, texto, grounding, prompt: `prompt ${frente}`, modelo: "gemini-flash-latest", tokens: 1000, chave: "gratuita", ...extra };
}

const RESPOSTA = {
  dataReferencia: "2026-10-02",
  versaoPrompt: "geopolitica-diaria@13",
  instrucaoDoSistema: "instrução enviada",
  chamadas: [chamada("OURO_PETROLEO", TEXTO_OP, GROUNDING_OP), chamada("MILHO_CAFE", TEXTO_MC, GROUNDING_MC, { chave: "paga", tokens: 234 })]
};

function comChamada(frente, mudanca) {
  return { ...RESPOSTA, chamadas: RESPOSTA.chamadas.map((c) => (c.frente === frente ? { ...c, ...mudanca } : c)) };
}

// Grounding em que a pesquisa leu o USTR: cumpre o piso do café (NORMAL no TEXTO_MC) e não dispara a repetição.
const COMERCIO_LIDO = { groundingChunks: [{ web: { title: "ustr.gov", urlFinal: "https://ustr.gov/x" } }] };

// Repositório falso: ainda não há leitura do dia (o download segue para a IA).
const SEM_LEITURA_HOJE = { existeLeituraDoDia: async () => false };

// Provedor falso que responde pela frente do prompt ("Ativos desta chamada: OURO e PETRÓLEO").
function provedorPorFrente(respostas, recebidos = []) {
  return {
    recebidos,
    async pesquisarNaWeb(entrada) {
      recebidos.push(entrada);
      const frente = /Ativos desta chamada: OURO e PETRÓLEO/.test(entrada.prompt) ? "OURO_PETROLEO" : "MILHO_CAFE";
      const resposta = respostas[frente];
      return typeof resposta === "function" ? resposta() : resposta;
    }
  };
}

// --- parser ---

test("parser: as seções de ativo e a lista de eventos, tolerando ### e **", () => {
  const { ativos, eventos } = parsearBoletim(TEXTO_OP);
  assert.deepEqual(Object.keys(ativos), ["OURO", "PETROLEO"]);
  assert.equal(ativos.OURO.nivel, "RELEVANTE");
  assert.equal(ativos.PETROLEO.resumo, "Petroleiro atingido no Mar Vermelho.");
  assert.equal(eventos.length, 2);
  const [navio] = eventos;
  assert.equal(navio.titulo, "Petroleiro atingido por projétil no Mar Vermelho");
  assert.equal(navio.tipo, "GEOPOLITICA");
  // O parser não sabe da frente: devolve todos os ativos citados (o coletor filtra).
  assert.deepEqual(navio.ativos, ["PETROLEO", "OURO", "CAFE"]);
  // Canal e intensidade sem "ATIVO=" (formato antigo) valem para todos os ativos do evento.
  const canal = "Rota e seguro do petróleo; busca por proteção no ouro.";
  assert.deepEqual(navio.porAtivo.PETROLEO, { fator: "PETROLEO_GEOPOLITICA", pressao: "ALTA", intensidade: "ALTA", canal });
  assert.deepEqual(navio.porAtivo.OURO, { fator: "OURO_GEOPOLITICA", pressao: "AMBIGUA", intensidade: "ALTA", canal });

  const mc = parsearBoletim(TEXTO_MC);
  assert.deepEqual(Object.keys(mc.ativos), ["MILHO", "CAFE"]);
  assert.equal(mc.ativos.MILHO.nivel, "ATENCAO");
  const [tarifa] = mc.eventos;
  assert.equal(tarifa.tipo, "POLITICA_COMERCIAL");
  assert.deepEqual(tarifa.porAtivo, {
    MILHO: { fator: "MILHO_POLITICA_COMERCIAL", pressao: "ALTA", intensidade: "MEDIA", canal: "Desvio da demanda chinesa para o milho do Brasil." }
  });
});

test("parser: canal e intensidade por ativo - o ativo indireto tem o próprio texto, mesmo com ';' e ':' no meio", () => {
  const texto = `PETRÓLEO
Nível: RELEVANTE
Resumo: y

OURO
Nível: ATENÇÃO
Resumo: x

EVENTOS

EVENTO 1
Título: Irã ameaça fechar o Estreito de Ormuz
Tipo: GEOPOLITICA
Ativos: PETRÓLEO, OURO
Canal de transmissão: PETRÓLEO=direto: ameaça à rota de 20% do petróleo; frete e seguro sobem. OURO=indireto: escalada entre Estados eleva a aversão a risco
Pressão sobre o preço: PETROLEO=alta; OURO=alta
Intensidade: PETROLEO=alta; OURO=média
`;
  const [evento] = parsearBoletim(texto).eventos;
  assert.equal(evento.porAtivo.PETROLEO.canal, "direto: ameaça à rota de 20% do petróleo; frete e seguro sobem.");
  assert.equal(evento.porAtivo.OURO.canal, "indireto: escalada entre Estados eleva a aversão a risco");
  assert.equal(evento.porAtivo.OURO.intensidade, "MEDIA");
  assert.deepEqual(textoPorAtivo("texto único; com ponto e vírgula"), { "*": "texto único; com ponto e vírgula" });

  // Cada linha gravada leva o canal e a intensidade do seu ativo.
  const linhas = coletor.normalize(coletor.parse(comChamada("OURO_PETROLEO", { texto }))).validos[0].eventos;
  const ouro = linhas.find((l) => l.ativo === "OURO");
  assert.equal(ouro.canal_transmissao, "indireto: escalada entre Estados eleva a aversão a risco");
  assert.equal(ouro.intensidade, "MEDIA");
});

test("parser: tipo fora da lista e fator inventado viram null (nunca corrigidos)", () => {
  const { eventos } = parsearBoletim(TEXTO_OP);
  assert.equal(eventos[1].tipo, null);
  assert.equal(eventos[1].tipoTexto, "Opinião");
  assert.equal(eventos[1].porAtivo.OURO.fator, null);
  assert.equal(tipo("POLITICA_OFERTA"), "POLITICA_OFERTA");
  assert.equal(tipo("Política de oferta"), "POLITICA_OFERTA");
  assert.equal(tipo("choque logístico"), "CHOQUE_LOGISTICO");
  assert.equal(tipo("Conflito militar"), null);
  assert.equal(tipo(""), null);
});

test("parser: o fator precisa ser do próprio ativo; NAO_SE_APLICA vale", () => {
  assert.equal(fator("MILHO_ETANOL", "MILHO"), "MILHO_ETANOL");
  assert.equal(fator("MILHO_ETANOL", "CAFE"), null);
  assert.equal(fator("NAO_SE_APLICA", "CAFE"), "NAO_SE_APLICA");
  assert.equal(fator("CAFE_CLIMA (Clima e eventos meteorológicos)", "CAFE"), "CAFE_CLIMA");
});

test("parser: ativos e valores por ativo, com e sem acento", () => {
  assert.deepEqual(listaDeAtivos("Petróleo, OURO e café"), ["PETROLEO", "OURO", "CAFE"]);
  assert.deepEqual(listaDeAtivos("SOJA"), []);
  assert.deepEqual(valoresPorAtivo("PETRÓLEO: alta; Café = baixa"), { PETROLEO: "alta", CAFE: "baixa" });
  assert.deepEqual(valoresPorAtivo("ambígua"), { "*": "ambígua" });
});

test("parser: evento dentro da seção de um ativo, sem 'Ativos:', vale para esse ativo (formato antigo)", () => {
  const texto = "OURO\nNível: ATENÇÃO\nResumo: x\n\nEVENTO 1\nTítulo: Sanção nova\nTipo: GEOPOLITICA\n\nPETRÓLEO\nNível: NORMAL\nResumo: y\n";
  assert.deepEqual(parsearBoletim(texto).eventos[0].ativos, ["OURO"]);
});

test("parser: o nível vale pela primeira palavra (o eco da escala inteira não vira NORMAL)", () => {
  assert.equal(vocabulario("ATENÇÃO.", NIVEIS), "ATENCAO");
  assert.equal(vocabulario("**Excepcional**", NIVEIS), "EXCEPCIONAL");
  assert.equal(vocabulario("NORMAL, ATENÇÃO, RELEVANTE ou EXCEPCIONAL", NIVEIS), "NORMAL");
  assert.equal(vocabulario("alto", NIVEIS), null);
});

test("parser: fontes em 'Nome - URL', '[Nome](URL)' e só o nome", () => {
  assert.deepEqual(parsearFontes("[OPEC](https://www.opec.org/pr-detail/613.html); OFAC"), [
    { nome: "OPEC", url: "https://www.opec.org/pr-detail/613.html" },
    { nome: "OFAC", url: null }
  ]);
});

// --- fontes autorizadas ---

test("fontes: a lista do ADR 0049 (11 fontes, sem o World Gold Council), cada uma com escopo, tipos e ativos válidos", () => {
  assert.deepEqual(Object.keys(FONTES), ["UKMTO", "TESOURO", "OPEP", "AP", "USTR", "CASA_BRANCA", "MOFCOM", "COMISSAO_EUROPEIA", "MAPA", "USDA_FAS", "INMET"]);
  for (const fonte of Object.values(FONTES)) {
    assert.ok(fonte.escopos.length > 0);
    assert.ok(fonte.tipos.every((t) => CODIGOS_TIPO.includes(t)), fonte.nome);
    assert.ok(fonte.ativos.every((a) => ATIVOS.includes(a)), fonte.nome);
  }
});

test("fontes: cada chamada recebe só as fontes que cobrem os seus ativos", () => {
  assert.deepEqual(fontesDosAtivos(["OURO", "PETROLEO"]), ["UKMTO", "TESOURO", "OPEP", "AP", "CASA_BRANCA"]);
  assert.deepEqual(fontesDosAtivos(["MILHO", "CAFE"]), ["UKMTO", "AP", "USTR", "CASA_BRANCA", "MOFCOM", "COMISSAO_EUROPEIA", "MAPA", "USDA_FAS", "INMET"]);
});

test("fontes: pela URL - domínio e, no gov.br, o caminho da instituição", () => {
  assert.equal(fonteDaUrl("https://www.gov.br/agricultura/pt-br/assuntos/noticias/abertura-de-mercados"), "MAPA");
  assert.equal(fonteDaUrl("https://www.gov.br/conab/pt-br/assuntos/noticias/x"), null);
  assert.equal(fonteDaUrl("https://www.gov.br/agricultura-familiar/x"), null);
  assert.equal(fonteDaUrl("https://www.gov.br/"), null);
  assert.equal(fonteDaUrl("https://avisos.inmet.gov.br/55907"), "INMET");
  assert.equal(fonteDaUrl("https://apps.fas.usda.gov/newgainapi/api/Report/x"), "USDA_FAS");
  assert.equal(fonteDaUrl("https://www.aphis.usda.gov/news/x"), null);
  assert.equal(fonteDaUrl("https://policy.trade.ec.europa.eu/x"), "COMISSAO_EUROPEIA");
  assert.equal(fonteDaUrl("https://www.consilium.europa.eu/en/press/press-releases/2026/09/30/x"), "COMISSAO_EUROPEIA");
  assert.equal(fonteDaUrl("https://www.europarl.europa.eu/news/x"), null);
  assert.equal(fonteDaUrl("https://english.mofcom.gov.cn/News/x.html"), "MOFCOM");
  assert.equal(fonteDaUrl("https://home.treasury.gov/news/press-releases/sb0644"), "TESOURO");
  assert.equal(fonteDaUrl("https://www.reuters.com/x"), null);
  assert.equal(fonteDaUrl("https://www.gold.org/goldhub"), null);
  assert.equal(fonteDaUrl("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc"), null);
});

test("fontes: só uma publicação específica sustenta um fato (não autor, tag, listagem ou página inicial)", () => {
  // Publicações: URLs reais lidas em 2026-10-02.
  for (const url of [
    "https://www.ukmto.org/-/media/ukmto/products/20261002-ukmto_warning_148_26.pdf?rev=2a8f",
    "https://home.treasury.gov/news/press-releases/sb0644",
    "https://apnews.com/article/iran-war-trump-ships-deployment-middle-east-42c23e9af0333f4bc3b4f419cc3a603e",
    "https://avisos.inmet.gov.br/55907",
    "https://www.gov.br/agricultura/pt-br/assuntos/noticias/abertura-de-mercados-para-produtos-brasileiros",
    "https://www.whitehouse.gov/presidential-actions/2025/11/modifying-the-scope-of-tariffs-on-the-government-of-brazil/",
    "https://ustr.gov/about-us/policy-offices/press-office/press-releases/2026/september/united-states-and-mexico-announce",
    "https://english.mofcom.gov.cn/News/PressConference/art/2026/art_33eb8976190e4a6382ce92e72c100b8c.html",
    "https://www.consilium.europa.eu/en/press/press-releases/2026/09/30/council-agrees-negotiating-stance"
  ]) {
    assert.equal(paginaEspecifica(url), true, url);
  }
  // Índices: o autor da AP (o caso do print), listagens e páginas iniciais.
  for (const url of [
    "https://apnews.com/author/konstantin-toropin",
    "https://apnews.com/hub/iran",
    "https://ustr.gov/about-us/policy-offices/press-office/press-releases/2026",
    "https://ustr.gov/about-us/policy-offices/press-office/press-releases",
    "https://www.whitehouse.gov/news/",
    "https://english.mofcom.gov.cn/News/index.html",
    "https://www.gov.br/agricultura/pt-br/ultimas-noticias",
    "https://portal.inmet.gov.br/noticias/noticias?noticias=geadas",
    "https://portal.inmet.gov.br/",
    "https://fas.usda.gov/newsroom/search"
  ]) {
    assert.equal(paginaEspecifica(url), false, url);
  }
});

test("normalize: a página do autor não sustenta o evento; a matéria, sim", () => {
  const texto = "OURO\nNível: ATENÇÃO\nResumo: x\n\nPETRÓLEO\nNível: NORMAL\nResumo: y\n\nEVENTOS\n\nEVENTO 1\nTítulo: EUA enviam terceiro porta-aviões ao Oriente Médio\nTipo: GEOPOLITICA\nAtivos: OURO\n";
  const suporte = [{ segment: { text: "EUA enviam terceiro porta-aviões ao Oriente Médio" }, groundingChunkIndices: [0, 1] }];
  const soAutor = { groundingChunks: [{ web: { urlFinal: "https://apnews.com/author/konstantin-toropin" } }], groundingSupports: [{ ...suporte[0], groundingChunkIndices: [0] }] };
  const [semMateria] = coletor.normalize(coletor.parse(comChamada("OURO_PETROLEO", { texto, grounding: soAutor }))).validos[0].eventos;
  assert.equal(semMateria.aceito, false);

  const comMateria = {
    groundingChunks: [{ web: { urlFinal: "https://apnews.com/author/konstantin-toropin" } }, { web: { urlFinal: "https://apnews.com/article/iran-war-deployment-42c2" } }],
    groundingSupports: suporte
  };
  const [aceito] = coletor.normalize(coletor.parse(comChamada("OURO_PETROLEO", { texto, grounding: comMateria }))).validos[0].eventos;
  assert.equal(aceito.aceito, true);
  assert.deepEqual(aceito.fontes.map((f) => f.url), ["https://apnews.com/article/iran-war-deployment-42c2"]);
});

test("fontes: citação da IA classificada pela URL ou, sem URL, pelo nome (só para exibir)", () => {
  assert.equal(classificarFonte({ nome: "AP", url: "https://apnews.com/article/x" }), "AP");
  assert.equal(classificarFonte({ nome: "AP News", url: "https://www.business-standard.com/x" }), null);
  assert.equal(classificarFonte({ nome: "OPEP+ (comunicado)", url: null }), "OPEP");
  assert.equal(classificarFonte({ nome: "Ministério da Agricultura", url: null }), "MAPA");
  assert.equal(classificarFonte({ nome: "OFAC", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" }), "TESOURO");
});

test("fontes: as fontes lidas na pesquisa vêm da URL final de cada página, não do título", () => {
  assert.deepEqual(fontesDaPesquisa(GROUNDING_OP), ["UKMTO", "AP"]);
  const gov = { groundingChunks: [{ web: { title: "www.gov.br", urlFinal: "https://www.gov.br/conab/pt-br/x" } }] };
  assert.deepEqual(fontesDaPesquisa(gov), []);
  assert.deepEqual(fontesDaPesquisa(null), []);
});

// --- normalize ---

test("normalize: uma leitura com as duas chamadas; uma linha por (evento, ativo da chamada)", () => {
  const { validos, invalidos } = coletor.normalize(coletor.parse(RESPOSTA));
  assert.equal(invalidos.length, 0);
  const { leitura, eventos } = validos[0];
  assert.equal(leitura.data_referencia, "2026-10-02");
  assert.deepEqual(
    [leitura.nivel_ouro, leitura.nivel_petroleo, leitura.nivel_milho, leitura.nivel_cafe],
    ["RELEVANTE", "EXCEPCIONAL", "ATENCAO", "NORMAL"]
  );
  assert.equal(leitura.resumo_milho, "A China anunciou tarifa sobre o milho dos EUA.");
  assert.match(leitura.texto_bruto, /^=== OURO E PETRÓLEO ===\nOURO\n/);
  assert.match(leitura.texto_bruto, /\n\n=== MILHO E CAFÉ ===\nMILHO\n/);
  assert.match(leitura.prompt, /prompt OURO_PETROLEO[\s\S]*prompt MILHO_CAFE/);
  assert.equal(leitura.versao_prompt, "geopolitica-diaria@13");
  // Uma chamada usou a chave paga: a leitura registra "paga"; os tokens somam.
  assert.equal(leitura.chave, "paga");
  assert.equal(leitura.tokens, 1234);

  // O CAFÉ citado no EVENTO 1 da chamada de ouro e petróleo é descartado: o café é lido na outra chamada.
  assert.deepEqual(
    eventos.map((e) => [e.ordem, e.ativo, e.tipo, e.fator, e.pressao]),
    [
      [1, "PETROLEO", "GEOPOLITICA", "PETROLEO_GEOPOLITICA", "ALTA"],
      [1, "OURO", "GEOPOLITICA", "OURO_GEOPOLITICA", "AMBIGUA"],
      [2, "OURO", null, null, "AMBIGUA"],
      [1, "MILHO", "POLITICA_COMERCIAL", "MILHO_POLITICA_COMERCIAL", "ALTA"]
    ]
  );
});

test("normalize: o grounding gravado junta as duas chamadas, com a frente em cada página e os índices deslocados", () => {
  const { leitura } = coletor.normalize(coletor.parse(RESPOSTA)).validos[0];
  assert.equal(leitura.grounding.groundingChunks.length, 4);
  assert.deepEqual(leitura.grounding.groundingChunks.map((c) => c.frente), ["OURO_PETROLEO", "OURO_PETROLEO", "OURO_PETROLEO", "MILHO_CAFE"]);
  assert.deepEqual(leitura.grounding.webSearchQueries, ["site:ukmto.org warning", "site:apnews.com Red Sea", "site:ustr.gov China"]);

  const comSuporte = { ...GROUNDING_MC, groundingSupports: [{ segment: { text: "China anuncia tarifa" }, groundingChunkIndices: [0] }] };
  const junto = coletor.normalize(coletor.parse(comChamada("MILHO_CAFE", { grounding: comSuporte }))).validos[0].leitura.grounding;
  assert.deepEqual(junto.groundingSupports.at(-1).groundingChunkIndices, [3]);
});

test("normalize: aceito só com página de fonte autorizada ligada ao texto do evento; a citação da IA não basta", () => {
  const { validos, avisos } = coletor.normalize(coletor.parse(RESPOSTA));
  const [petroleo, ouro, opiniao, milho] = validos[0].eventos;

  // EVENTO 1: o PDF do UKMTO apoia o título; ele substitui a citação da página inicial.
  assert.equal(petroleo.aceito, true);
  assert.deepEqual(petroleo.fontes, [
    { nome: "UKMTO / JMIC", url: PDF_UKMTO, fonteAutorizada: "UKMTO", confirmadaNaPesquisa: true, origem: "pesquisa" }
  ]);
  assert.equal(ouro.aceito, true);

  // A AP é autorizada e foi lida, mas a página lida apoia OUTRO trecho, não este evento.
  assert.equal(opiniao.aceito, false);
  assert.deepEqual(opiniao.fontes.map((f) => [f.fonteAutorizada, f.confirmadaNaPesquisa, f.origem]), [["AP", true, "citada"]]);
  assert.match(opiniao.motivo_rejeicao, /AP News.*nenhuma página dela sustenta o texto deste evento/);

  // A Reuters não é fonte autorizada nem foi lida - o caso que motivou a regra.
  assert.equal(milho.aceito, false);
  assert.match(milho.motivo_rejeicao, /Nenhuma fonte autorizada; citadas: https:\/\/www\.reuters\.com/);

  assert.ok(avisos.some((a) => /Tipo fora da lista: "Opinião"/.test(a.motivo)));
  assert.ok(avisos.some((a) => /Nível ATENCAO sem nenhum evento sustentado/.test(a.motivo) && a.item.ativo === "MILHO"));
  assert.equal(avisos.filter((a) => /citadas|sustenta o texto/.test(a.motivo)).length, 2);
});

test("normalize: a conferência de cada evento usa o grounding da PRÓPRIA chamada", () => {
  // A página do MOFCOM foi lida na chamada de ouro e petróleo, não na de milho e café: não confirma a citação do milho.
  const texto = TEXTO_MC.replace("Fontes: Reuters - https://www.reuters.com/markets/china-corn", "Fontes: MOFCOM - https://english.mofcom.gov.cn/News/x.html");
  const op = { ...GROUNDING_OP, groundingChunks: [...GROUNDING_OP.groundingChunks, { web: { urlFinal: "https://english.mofcom.gov.cn/News/x.html" } }] };
  const resposta = { ...RESPOSTA, chamadas: [chamada("OURO_PETROLEO", TEXTO_OP, op), chamada("MILHO_CAFE", texto, GROUNDING_MC)] };
  const milho = coletor.normalize(coletor.parse(resposta)).validos[0].eventos.find((e) => e.ativo === "MILHO");
  assert.equal(milho.aceito, false);
  assert.match(milho.motivo_rejeicao, /MOFCOM.*nenhuma página dela foi lida nesta pesquisa/);
});

test("normalize: página do gov.br de outro órgão não sustenta um evento do MAPA", () => {
  const texto = `MILHO
Nível: RELEVANTE
Resumo: x

CAFÉ
Nível: NORMAL
Resumo: x

EVENTOS

EVENTO 1
Título: Brasil abre o mercado da Argélia para o DDG de milho
Tipo: POLITICA_COMERCIAL
Ativos: MILHO
Fator: MILHO=MILHO_POLITICA_COMERCIAL
Fontes: MAPA - https://www.gov.br/agricultura/pt-br/assuntos/noticias/abertura
`;
  const suporte = [{ segment: { text: "Brasil abre o mercado da Argélia para o DDG de milho" }, groundingChunkIndices: [0] }];
  const conab = { groundingChunks: [{ web: { title: "www.gov.br", urlFinal: "https://www.gov.br/conab/pt-br/x" } }], groundingSupports: suporte };
  const [rejeitado] = coletor.normalize(coletor.parse(comChamada("MILHO_CAFE", { texto, grounding: conab }))).validos[0].eventos.filter((e) => e.ativo === "MILHO");
  assert.equal(rejeitado.aceito, false);

  const mapa = { groundingChunks: [{ web: { title: "www.gov.br", urlFinal: "https://www.gov.br/agricultura/pt-br/assuntos/noticias/abertura" } }], groundingSupports: suporte };
  const [aceito] = coletor.normalize(coletor.parse(comChamada("MILHO_CAFE", { texto, grounding: mapa }))).validos[0].eventos.filter((e) => e.ativo === "MILHO");
  assert.equal(aceito.aceito, true);
  assert.equal(aceito.fontes[0].fonteAutorizada, "MAPA");
});

test("normalize: a mesma página com e sem barra no fim aparece uma vez só", () => {
  const texto = "OURO\nNível: ATENÇÃO\nResumo: x\n\nPETRÓLEO\nNível: NORMAL\nResumo: y\n\nEVENTOS\n\nEVENTO 1\nTítulo: Sanções do Tesouro contra redes ligadas ao Irã\nTipo: GEOPOLITICA\nAtivos: OURO\n";
  const grounding = {
    groundingChunks: [
      { web: { title: "treasury.gov", urlFinal: "https://home.treasury.gov/news/press-releases/sb0644/" } },
      { web: { title: "treasury.gov", urlFinal: "https://home.treasury.gov/news/press-releases/sb0644" } }
    ],
    groundingSupports: [{ segment: { text: "Título: Sanções do Tesouro contra redes ligadas ao Irã" }, groundingChunkIndices: [0, 1] }]
  };
  const [evento] = coletor.normalize(coletor.parse(comChamada("OURO_PETROLEO", { texto, grounding }))).validos[0].eventos;
  assert.equal(evento.fontes.length, 1);
  assert.equal(evento.aceito, true);
});

test("normalize: evento sem nenhum ativo da chamada é descartado com aviso", () => {
  const texto = `${TEXTO_MC.split("EVENTOS")[0]}EVENTOS\n\nEVENTO 1\nTítulo: Fato sobre o petróleo\nTipo: GEOPOLITICA\nAtivos: PETROLEO\n`;
  const { validos, avisos } = coletor.normalize(coletor.parse(comChamada("MILHO_CAFE", { texto })));
  assert.ok(!validos[0].eventos.some((e) => e.titulo === "Fato sobre o petróleo"));
  assert.ok(avisos.some((a) => /sem nenhum ativo desta chamada/.test(a.motivo)));
});

test("normalize: faltou a seção de um ativo ou o nível está fora da escala, nada é gravado", () => {
  const semCafe = coletor.normalize(coletor.parse(comChamada("MILHO_CAFE", { texto: TEXTO_MC.replace("CAFÉ\nNível: NORMAL\nResumo: Nada fora do normal.\n", "") })));
  assert.equal(semCafe.validos.length, 0);
  assert.match(semCafe.invalidos[0].motivo, /chamada "Milho e café" não trouxe a seção CAFE/);

  const nivelEstranho = coletor.normalize(coletor.parse(comChamada("MILHO_CAFE", { texto: TEXTO_MC.replace("Nível: Atenção", "Nível: Alto") })));
  assert.equal(nivelEstranho.validos.length, 0);
  assert.match(nivelEstranho.invalidos[0].motivo, /Nível do milho fora da escala: "Alto"/);
});

test("normalize: piso por ativo, conferido com as fontes lidas pela chamada do ativo", () => {
  // Café NORMAL com o USTR lido: piso cumprido.
  const base = coletor.normalize(coletor.parse(RESPOSTA)).avisos;
  assert.ok(!base.some((a) => a.item.ativo === "CAFE" && /Nível NORMAL/.test(a.motivo)));

  // Só o INMET lido: não basta para o café.
  const soInmet = { groundingChunks: [{ web: { urlFinal: "https://avisos.inmet.gov.br/1" } }] };
  const inmet = coletor.normalize(coletor.parse(comChamada("MILHO_CAFE", { grounding: soInmet }))).avisos;
  assert.ok(inmet.some((a) => a.item.ativo === "CAFE" && /NORMAL do café sem fonte de política comercial ou regulação do ativo/.test(a.motivo)));

  // Milho NORMAL: precisa de uma fonte de comércio E da AP (Mar Negro).
  const textoMilhoNormal = TEXTO_MC.replace("Nível: Atenção", "Nível: NORMAL");
  const avisoDoMilho = (urls) =>
    coletor
      .normalize(coletor.parse(comChamada("MILHO_CAFE", { texto: textoMilhoNormal, grounding: { groundingChunks: urls.map((url) => ({ web: { urlFinal: url } })) } })))
      .avisos.find((a) => a.item.ativo === "MILHO" && /Nível NORMAL/.test(a.motivo));
  assert.match(avisoDoMilho(["https://ustr.gov/x"]).motivo, /sem busca na AP News \(Mar Negro\) lida/);
  assert.match(avisoDoMilho(["https://apnews.com/article/x"]).motivo, /sem fonte de política comercial ou regulação do ativo lida/);
  assert.equal(avisoDoMilho(["https://ustr.gov/x", "https://apnews.com/article/x"]), undefined);

  // Ouro NORMAL (v12): precisa da AP ou do Tesouro; o UKMTO sozinho não basta.
  const textoOuroNormal = TEXTO_OP.replace("Nível: Relevante", "Nível: NORMAL");
  const avisoDoOuro = (urls) =>
    coletor
      .normalize(coletor.parse(comChamada("OURO_PETROLEO", { texto: textoOuroNormal, grounding: { groundingChunks: urls.map((url) => ({ web: { urlFinal: url } })) } })))
      .avisos.find((a) => a.item.ativo === "OURO" && /Nível NORMAL/.test(a.motivo));
  assert.match(avisoDoOuro(["https://www.ukmto.org/aviso.pdf"]).motivo, /NORMAL do ouro sem busca na AP News ou no Tesouro dos EUA lida/);
  assert.equal(avisoDoOuro(["https://www.ukmto.org/aviso.pdf", "https://home.treasury.gov/news/press-releases/x"]), undefined);
  assert.equal(avisoDoOuro(["https://apnews.com/article/x"]), undefined);
});

test("normalize: detalhes das chamadas para a execução, com as fontes lidas de cada uma", () => {
  const { detalhes } = coletor.normalize(coletor.parse(RESPOSTA));
  assert.deepEqual(detalhes, {
    ia: {
      chave: "paga",
      modelo: "gemini-flash-latest",
      tokens: 1234,
      repeticoesPeloPiso: 0,
      versaoPrompt: "geopolitica-diaria@13",
      chamadas: 2,
      buscas: 3,
      paginasLidas: 4,
      fontesLidas: ["UKMTO", "AP", "USTR"],
      fontesLidasPorChamada: { OURO_PETROLEO: ["UKMTO", "AP"], MILHO_CAFE: ["USTR"] }
    }
  });
  // Resposta fora do formato: as chamadas aconteceram, os detalhes vão junto.
  const invalida = coletor.normalize(coletor.parse(comChamada("OURO_PETROLEO", { texto: "sem seções" })));
  assert.equal(invalida.validos.length, 0);
  assert.equal(invalida.detalhes.ia.chamadas, 2);
  // Leitura de hoje já existia: não houve chamada, não há detalhes.
  assert.equal(coletor.normalize([{ pular: true }]).detalhes, undefined);
});

// --- persist e download ---

test("persist: substitui a leitura do dia pelo repositório, com a execução; criada x refeita", async () => {
  const { validos } = coletor.normalize(coletor.parse(RESPOSTA));
  const chamadas = [];
  let jaExiste = false;
  const deps = {
    geopoliticaRepository: {
      async substituirLeituraDoDia(leitura, eventos) {
        chamadas.push({ leitura, eventos });
        const substituiu = jaExiste;
        jaExiste = true;
        return { substituiu };
      }
    }
  };
  assert.deepEqual(await coletor.persist(validos, { execucaoId: "exec-1" }, deps), { criados: 1, atualizados: 0, ignorados: 0, falhas: [] });
  assert.deepEqual(await coletor.persist(validos, { execucaoId: "exec-2" }, deps), { criados: 0, atualizados: 1, ignorados: 0, falhas: [] });
  assert.equal(chamadas[0].leitura.collection_execution_id, "exec-1");
  assert.equal(chamadas[0].eventos.length, 4);
});

test("download: duas chamadas, cada uma com os seus ativos, o seu piso, as suas fontes e os seus fatores", async () => {
  const recebidos = [];
  const pagina = { groundingChunks: [{ web: { title: "apnews.com" } }] };
  const provedor = provedorPorFrente(
    { OURO_PETROLEO: { texto: TEXTO_OP, grounding: pagina, modelo: "m", tokens: 1 }, MILHO_CAFE: { texto: TEXTO_MC, grounding: COMERCIO_LIDO, modelo: "m", tokens: 1 } },
    recebidos
  );
  const resposta = await coletor.download({ signal: undefined }, { dataReferencia: "2026-10-02", geopoliticaRepository: SEM_LEITURA_HOJE, geminiSearch: provedor });

  assert.equal(recebidos.length, 2);
  assert.deepEqual(resposta.chamadas.map((c) => c.frente), ["OURO_PETROLEO", "MILHO_CAFE"]);
  assert.equal(resposta.versaoPrompt, "geopolitica-diaria@13");
  // A instrução do sistema é a mesma; o prompt muda por chamada.
  assert.equal(recebidos[0].systemInstruction, recebidos[1].systemInstruction);
  assert.match(recebidos[0].systemInstruction, /Não procure notícias gerais\. Procure somente acontecimentos relevantes nas fontes autorizadas/);
  assert.match(recebidos[0].systemInstruction, /ATIVOS DESTA CHAMADA/);
  assert.doesNotMatch(recebidos[0].systemInstruction, /\{\{/);

  const [op, mc] = recebidos.map((r) => r.prompt);
  assert.match(op, /Ativos desta chamada: OURO e PETRÓLEO/);
  assert.match(op, /- Tesouro dos EUA/);
  assert.doesNotMatch(op, /MAPA|INMET|USTR/);
  assert.equal((op.match(/^- (OURO|PETROLEO)_[A-Z_]+: /gm) || []).length, 18);
  assert.match(op, /- OURO: ao menos uma busca na AP News .* ou no Tesouro dos EUA .*; o UKMTO sozinho não basta/);
  assert.match(op, /- PETRÓLEO: ao menos uma busca numa fonte que cobre o ativo/);

  assert.match(mc, /Ativos desta chamada: MILHO e CAFÉ/);
  assert.match(mc, /- MAPA \(Ministério da Agricultura\) \(gov\.br\/agricultura\) - tipos: Política comercial, Sanidade, Regulação - ativos: milho, café: /);
  // A AP entra na chamada do milho só pelo Mar Negro, e o UKMTO só pelo café.
  assert.match(mc, /- AP News \(apnews\.com\) - tipos: Geopolítica - ativos: milho: /);
  assert.match(mc, /site:apnews\.com Black Sea ports Odesa grain/);
  assert.doesNotMatch(mc, /Iran strike|Tesouro dos EUA|^- OPEP/m);
  assert.equal((mc.match(/^- (MILHO|CAFE)_[A-Z_]+: /gm) || []).length, 16);
  assert.match(mc, /- MILHO: ao menos uma busca numa fonte de política comercial ou regulação .*; e uma busca na AP News sobre o Mar Negro/);
  assert.doesNotMatch(op + mc, /gold\.org|reuters/i);
});

test("hojeEmSaoPaulo: a data do Brasil, não a de UTC", () => {
  assert.equal(coletor.hojeEmSaoPaulo(new Date("2026-10-01T01:30:00Z")), "2026-09-30");
  assert.equal(coletor.hojeEmSaoPaulo(new Date("2026-10-01T15:00:00Z")), "2026-10-01");
});

test("download: uma chamada respondeu sem pesquisar - só ela tenta de novo", async () => {
  let tentativasMc = 0;
  const respostas = [
    { texto: TEXTO_MC, grounding: null, modelo: "m", tokens: 1 },
    { texto: TEXTO_MC, grounding: COMERCIO_LIDO, modelo: "m", tokens: 2 }
  ];
  const provedor = provedorPorFrente({
    OURO_PETROLEO: { texto: TEXTO_OP, grounding: { groundingChunks: [{ web: { title: "ukmto.org" } }] }, modelo: "m", tokens: 1 },
    MILHO_CAFE: () => respostas[tentativasMc++]
  });
  const resposta = await coletor.download({ signal: undefined }, { dataReferencia: "2026-10-02", geopoliticaRepository: SEM_LEITURA_HOJE, geminiSearch: provedor });
  assert.equal(provedor.recebidos.length, 3);
  assert.equal(resposta.chamadas.find((c) => c.frente === "MILHO_CAFE").tokens, 2);
});

test("download: piso não cumprido - só a chamada que falhou repete, uma vez, e fica a resposta com menos faltas", async () => {
  // Milho e café: a 1ª resposta leu só o INMET (o café NORMAL fica sem fonte de comércio); a 2ª leu o USTR.
  const soInmet = { groundingChunks: [{ web: { urlFinal: "https://avisos.inmet.gov.br/1" } }] };
  const respostasMc = [
    { texto: TEXTO_MC, grounding: soInmet, modelo: "m", tokens: 100 },
    { texto: TEXTO_MC, grounding: COMERCIO_LIDO, modelo: "m", tokens: 200 }
  ];
  let i = 0;
  const provedor = provedorPorFrente({
    OURO_PETROLEO: { texto: TEXTO_OP, grounding: { groundingChunks: [{ web: { urlFinal: "https://apnews.com/article/x" } }] }, modelo: "m", tokens: 10 },
    MILHO_CAFE: () => respostasMc[i++]
  });
  const resposta = await coletor.download({ signal: undefined }, { dataReferencia: "2026-10-02", geopoliticaRepository: SEM_LEITURA_HOJE, geminiSearch: provedor });
  assert.equal(provedor.recebidos.length, 3);
  const mc = resposta.chamadas.find((c) => c.frente === "MILHO_CAFE");
  assert.equal(mc.tokens, 200);
  assert.equal(mc.tokensDescartados, 100);
  assert.equal(mc.repetidaPeloPiso, true);
  assert.equal(resposta.chamadas.find((c) => c.frente === "OURO_PETROLEO").repetidaPeloPiso, false);

  const { detalhes, avisos } = coletor.normalize(coletor.parse(resposta));
  assert.equal(detalhes.ia.repeticoesPeloPiso, 1);
  // Custo real: as três respostas (10 + 200 + a descartada, 100).
  assert.equal(detalhes.ia.tokens, 310);
  assert.ok(!avisos.some((a) => /Nível NORMAL do café/.test(a.motivo)));
});

test("download: a repetição não melhora o piso - fica a 1ª resposta e o aviso continua", async () => {
  const soInmet = { groundingChunks: [{ web: { urlFinal: "https://avisos.inmet.gov.br/1" } }] };
  let i = 0;
  const respostasMc = [
    { texto: TEXTO_MC, grounding: soInmet, modelo: "m", tokens: 100 },
    { texto: TEXTO_MC.replace("Resumo: Nada fora do normal.", "Resumo: segunda."), grounding: soInmet, modelo: "m", tokens: 50 }
  ];
  const provedor = provedorPorFrente({
    OURO_PETROLEO: { texto: TEXTO_OP, grounding: { groundingChunks: [{ web: { urlFinal: "https://apnews.com/article/x" } }] }, modelo: "m", tokens: 10 },
    MILHO_CAFE: () => respostasMc[i++]
  });
  const resposta = await coletor.download({ signal: undefined }, { dataReferencia: "2026-10-02", geopoliticaRepository: SEM_LEITURA_HOJE, geminiSearch: provedor });
  const mc = resposta.chamadas.find((c) => c.frente === "MILHO_CAFE");
  assert.equal(mc.tokens, 100);
  assert.equal(mc.tokensDescartados, 50);
  assert.doesNotMatch(mc.texto, /segunda/);
  const { avisos } = coletor.normalize(coletor.parse(resposta));
  assert.ok(avisos.some((a) => /Nível NORMAL do café sem fonte de política comercial/.test(a.motivo)));
});

test("download: a repetição pelo piso falhou - segue a 1ª resposta, sem derrubar a leitura", async () => {
  const soInmet = { groundingChunks: [{ web: { urlFinal: "https://avisos.inmet.gov.br/1" } }] };
  let i = 0;
  const provedor = provedorPorFrente({
    OURO_PETROLEO: { texto: TEXTO_OP, grounding: { groundingChunks: [{ web: { urlFinal: "https://apnews.com/article/x" } }] }, modelo: "m", tokens: 10 },
    MILHO_CAFE: () => {
      i += 1;
      if (i === 1) return { texto: TEXTO_MC, grounding: soInmet, modelo: "m", tokens: 100 };
      throw new Error("Gemini fora do ar");
    }
  });
  const resposta = await coletor.download({ signal: undefined }, { dataReferencia: "2026-10-02", geopoliticaRepository: SEM_LEITURA_HOJE, geminiSearch: provedor });
  assert.equal(resposta.chamadas.find((c) => c.frente === "MILHO_CAFE").tokens, 100);
});

test("download: uma chamada sem pesquisa nas 2 tentativas - a execução falha sem gravar nada", async () => {
  const semPesquisa = { texto: TEXTO_MC, grounding: { webSearchQueries: ["x"], groundingChunks: [] }, modelo: "m", tokens: 1 };
  const provedor = provedorPorFrente({
    OURO_PETROLEO: { texto: TEXTO_OP, grounding: { groundingChunks: [{ web: { title: "ukmto.org" } }] }, modelo: "m", tokens: 1 },
    MILHO_CAFE: semPesquisa
  });
  await assert.rejects(coletor.download({ signal: undefined }, { dataReferencia: "2026-10-02", geopoliticaRepository: SEM_LEITURA_HOJE, geminiSearch: provedor }), (erro) => {
    assert.equal(erro.code, "UPSTREAM_ERROR");
    assert.match(erro.message, /respondeu sem pesquisar .* em 2 tentativas na chamada "Milho e café"/);
    return true;
  });
});

test("download: já existe leitura de hoje - pula as chamadas e o persist conta como ignorado", async () => {
  const provedor = provedorPorFrente({});
  const deps = { dataReferencia: "2026-10-02", refazer: false, geopoliticaRepository: { existeLeituraDoDia: async () => true }, geminiSearch: provedor };
  const resposta = await coletor.download({ signal: undefined }, deps);
  assert.equal(provedor.recebidos.length, 0);
  assert.deepEqual(resposta, { pular: true, dataReferencia: "2026-10-02" });

  const { validos, invalidos, avisos } = coletor.normalize(coletor.parse(resposta));
  assert.deepEqual([invalidos, avisos], [[], []]);
  const repoQueNaoDeveSerChamado = { substituirLeituraDoDia: async () => assert.fail("não deveria gravar") };
  assert.deepEqual(await coletor.persist(validos, { execucaoId: "e" }, { geopoliticaRepository: repoQueNaoDeveSerChamado }), {
    criados: 0,
    atualizados: 0,
    ignorados: 1,
    falhas: []
  });
});

test("download: com GEOPOLITICA_REFAZER, chama a IA mesmo com leitura de hoje (e não consulta o banco)", async () => {
  const pagina = { groundingChunks: [{ web: { title: "apnews.com" } }] };
  const provedor = provedorPorFrente({ OURO_PETROLEO: { texto: TEXTO_OP, grounding: pagina }, MILHO_CAFE: { texto: TEXTO_MC, grounding: COMERCIO_LIDO } });
  const deps = { dataReferencia: "2026-10-02", refazer: true, geopoliticaRepository: { existeLeituraDoDia: async () => assert.fail("não deveria consultar") }, geminiSearch: provedor };
  const resposta = await coletor.download({ signal: undefined }, deps);
  assert.equal(provedor.recebidos.length, 2);
  assert.equal(resposta.pular, undefined);
});
