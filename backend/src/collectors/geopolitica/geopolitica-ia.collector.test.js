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
const { parsearBoletim, parsearFontes, vocabulario, tipo, NIVEIS } = require("./geopolitica-boletim.parser");
const { classificarFonte, sitesDaPesquisa, verificarNaPesquisa } = require("./fontes-autorizadas");

// Resposta no formato do prompt, com as variações de markdown que o Gemini às vezes usa (### e **). Nenhum teste
// chama o Gemini.
const TEXTO = `OURO
Nível: Relevante
Resumo: As negociações EUA-Irã travaram e a crise em Hormuz segue elevando o risco de inflação via energia.

### EVENTO 1
**Título:** EUA negam alívio de sanções ao Irã e as negociações travam
**Tipo:** Diplomacia
**Resumo:** Em 30/09 o governo dos EUA negou a oferta de alívio de sanções ao Irã.
**Canal de transmissão:** Busca por ativo de proteção e risco de inflação via energia.
**Pressão sobre o preço:** alta
**Intensidade:** média
**Confiança:** alta
**Fontes:**
- AP News - https://apnews.com/article/us-iran-talks-2026-09-30
- Business Standard - https://www.business-standard.com/markets/commodities/oil-prices-steady

EVENTO 2
Título: Comentário de mercado sem fonte autorizada
Resumo: Texto qualquer.
Canal de transmissão: Proteção.
Pressão sobre o preço: ambígua
Intensidade: baixa
Confiança: baixa
Fontes: Kitco - https://www.kitco.com/news/article/2026-10-01/gold

PETRÓLEO
Nível: EXCEPCIONAL
Resumo: Petroleiro atingido no Estreito de Hormuz.

EVENTO 1
Título: Petroleiro atingido por projétil perto de Khasab
Tipo: Rota marítima (ataque a navio)
Resumo: O UKMTO relatou um petroleiro atingido no Estreito de Hormuz.
Canal de transmissão: Rota e transporte: frete e seguro.
Pressão sobre o preço: Alta.
Intensidade: alta
Confiança: alta
Fontes: UKMTO; Al Jazeera - https://www.aljazeera.com/news/2026/8/18/vessel-hit
`;

// Repositório falso: ainda não há leitura do dia (o download segue para a IA).
const SEM_LEITURA_HOJE = { existeLeituraDoDia: async () => false };

const RESPOSTA = {
  texto: TEXTO,
  grounding: {
    webSearchQueries: ["site:ukmto.org warning", "site:apnews.com Iran"],
    // O título de cada resultado do grounding é o domínio; a URL é um redirecionamento do Google.
    groundingChunks: [
      { web: { title: "apnews.com", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a" } },
      { web: { title: "ukmto.org" } },
      { web: { title: "kitco.com" } }
    ]
  },
  modelo: "gemini-flash-latest",
  tokens: 1234,
  chave: "gratuita",
  instrucaoDoSistema: "instrução enviada",
  prompt: "prompt enviado",
  versaoPrompt: "geopolitica-diaria@1",
  dataReferencia: "2026-10-01"
};

test("parser: as duas seções, com nível, resumo e eventos, tolerando ### e **", () => {
  const secoes = parsearBoletim(TEXTO);
  assert.deepEqual(Object.keys(secoes), ["OURO", "PETROLEO"]);
  assert.equal(secoes.OURO.nivel, "RELEVANTE");
  assert.match(secoes.OURO.resumo, /^As negociações EUA-Irã/);
  assert.equal(secoes.OURO.eventos.length, 2);
  const [primeiro] = secoes.OURO.eventos;
  assert.equal(primeiro.titulo, "EUA negam alívio de sanções ao Irã e as negociações travam");
  assert.equal(primeiro.canal, "Busca por ativo de proteção e risco de inflação via energia.");
  assert.equal(primeiro.pressao, "ALTA");
  assert.equal(secoes.OURO.eventos[1].pressao, "AMBIGUA");
  assert.equal(secoes.PETROLEO.eventos[0].pressao, "ALTA");
  assert.equal(primeiro.intensidade, "MEDIA");
  assert.equal(primeiro.confianca, "ALTA");
  assert.deepEqual(primeiro.fontes, [
    { nome: "AP News", url: "https://apnews.com/article/us-iran-talks-2026-09-30" },
    { nome: "Business Standard", url: "https://www.business-standard.com/markets/commodities/oil-prices-steady" }
  ]);
  assert.equal(secoes.PETROLEO.nivel, "EXCEPCIONAL");
  assert.equal(secoes.PETROLEO.eventos[0].ordem, 1);
});

test("parser: o nível vale pela primeira palavra (o eco da escala inteira não vira NORMAL)", () => {
  assert.equal(vocabulario("ATENÇÃO.", NIVEIS), "ATENCAO");
  assert.equal(vocabulario("**Excepcional**", NIVEIS), "EXCEPCIONAL");
  assert.equal(vocabulario("NORMAL, ATENÇÃO, RELEVANTE ou EXCEPCIONAL", NIVEIS), "NORMAL");
  assert.equal(vocabulario("alto", NIVEIS), null);
  assert.equal(vocabulario("", NIVEIS), null);
});

test("parser: fontes em 'Nome - URL', '[Nome](URL)' e só o nome", () => {
  assert.deepEqual(parsearFontes("[OPEC](https://www.opec.org/pr-detail/613-6-september-2026.html); OFAC"), [
    { nome: "OPEC", url: "https://www.opec.org/pr-detail/613-6-september-2026.html" },
    { nome: "OFAC", url: null }
  ]);
});

test("fontes: lista única; com URL decide o domínio; sem URL (ou com o redirecionamento do Google) decide o nome", () => {
  assert.equal(classificarFonte({ nome: "AP", url: "https://apnews.com/article/x" }), "AP");
  assert.equal(classificarFonte({ nome: "AP News", url: "https://www.business-standard.com/x" }), null);
  // A Reuters saiu da lista (a pesquisa do Gemini não lê o reuters.com).
  assert.equal(classificarFonte({ nome: "Reuters", url: "https://www.reuters.com/x" }), null);
  assert.equal(classificarFonte({ nome: "OPEP+ (comunicado)", url: null }), "OPEP");
  assert.equal(classificarFonte({ nome: "JMIC Advisory Note", url: null }), "UKMTO");
  assert.equal(classificarFonte({ nome: "Comunicado", url: "https://home.treasury.gov/news/press-releases/sb0644" }), "TESOURO");
  assert.equal(classificarFonte({ nome: "OFAC", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" }), "TESOURO");
  // Lista única: o WGC e o UKMTO valem para qualquer ativo.
  assert.equal(classificarFonte({ nome: "World Gold Council", url: "https://www.gold.org/goldhub" }), "WGC");
});

test("fontes: confirmação pelos sites que a pesquisa devolveu", () => {
  const sites = sitesDaPesquisa({ groundingChunks: [{ web: { title: "Treasury.gov" } }, { web: { title: "apnews.com" } }, { web: {} }] });
  assert.deepEqual(sites, ["treasury.gov", "apnews.com"]);
  assert.equal(verificarNaPesquisa("TESOURO", sites), true);
  assert.equal(verificarNaPesquisa("AP", sites), true);
  assert.equal(verificarNaPesquisa("UKMTO", sites), false);
  assert.deepEqual(sitesDaPesquisa(null), []);
});

test("normalize: leitura do dia com os eventos; evento sem fonte autorizada fica gravado como rejeitado e vira aviso", () => {
  const { validos, invalidos, avisos } = coletor.normalize(coletor.parse(RESPOSTA));
  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 1);
  const { leitura, eventos } = validos[0];
  assert.equal(leitura.data_referencia, "2026-10-01");
  assert.equal(leitura.nivel_ouro, "RELEVANTE");
  assert.equal(leitura.nivel_petroleo, "EXCEPCIONAL");
  assert.equal(leitura.texto_bruto, TEXTO);
  assert.equal(leitura.versao_prompt, "geopolitica-diaria@1");
  assert.equal(leitura.chave, "gratuita");
  assert.equal(leitura.instrucao_sistema, "instrução enviada");
  assert.equal(leitura.prompt, "prompt enviado");
  assert.equal(eventos.length, 3);

  const [ap, kitco, ukmto] = eventos;
  assert.equal(ap.aceito, true);
  assert.equal(ap.pressao, "ALTA");
  assert.deepEqual(
    ap.fontes.map((f) => [f.fonteAutorizada, f.confirmadaNaPesquisa]),
    [
      ["AP", true],
      [null, false]
    ]
  );
  assert.equal(kitco.aceito, false);
  // A Kitco apareceu na pesquisa, mas não está na lista: não sustenta.
  assert.match(kitco.motivo_rejeicao, /Nenhum site confiável citado; citadas: .*kitco\.com/);
  assert.equal(ukmto.ativo, "PETROLEO");
  assert.equal(ukmto.aceito, true);

  assert.equal(avisos.length, 1);
  assert.match(avisos[0].motivo, /kitco/);
});

test("normalize: a página lida na pesquisa vira o link direto da fonte, no lugar da citação da IA do mesmo site", () => {
  const texto = `OURO
Nível: NORMAL
Resumo: x

PETRÓLEO
Nível: RELEVANTE
Resumo: y

EVENTO 1
Título: Petroleiro atingido por projétil no Estreito de Ormuz
Resumo: O UKMTO emitiu o aviso 147-26.
Canal de transmissão: rota
Fontes: UKMTO - https://www.ukmto.org
`;
  const pdf = "https://www.ukmto.org/-/media/ukmto/products/2026101-ukmto_warning-147-26.pdf";
  const grounding = {
    groundingChunks: [{ web: { title: "ukmto.org", uri: "https://vertexaisearch.cloud.google.com/x", urlFinal: pdf } }],
    groundingSupports: [{ segment: { text: "Título: Petroleiro atingido por projétil no Estreito de Ormuz" }, groundingChunkIndices: [0] }]
  };
  const { validos } = coletor.normalize(coletor.parse({ ...RESPOSTA, texto, grounding }));
  const [evento] = validos[0].eventos;
  assert.equal(evento.aceito, true);
  // A citação "UKMTO - https://www.ukmto.org" (página inicial) dá lugar ao PDF do aviso.
  assert.deepEqual(evento.fontes, [
    { nome: "UKMTO / JMIC", url: pdf, fonteAutorizada: "UKMTO", confirmadaNaPesquisa: true, origem: "pesquisa" }
  ]);
});

test("normalize: site confiável citado que NÃO apareceu nos resultados da pesquisa não sustenta o evento", () => {
  const texto = `OURO
Nível: ATENÇÃO
Resumo: x

EVENTO 1
Título: Sanção nova ao Irã
Resumo: ...
Canal de transmissão: sanções sobre reservas
Fontes: OFAC - https://ofac.treasury.gov/recent-actions/20261001

PETRÓLEO
Nível: NORMAL
Resumo: y
`;
  // A pesquisa só devolveu a AP: a citação do Tesouro não está provada.
  const grounding = { groundingChunks: [{ web: { title: "apnews.com" } }] };
  const { validos } = coletor.normalize(coletor.parse({ ...RESPOSTA, texto, grounding }));
  const [evento] = validos[0].eventos;
  assert.equal(evento.aceito, false);
  assert.deepEqual(evento.fontes.map((f) => [f.fonteAutorizada, f.confirmadaNaPesquisa]), [["TESOURO", false]]);
  assert.match(evento.motivo_rejeicao, /Tesouro dos EUA .*não apareceu nos resultados da pesquisa/);

  // Sem grounding nenhum, nada se prova.
  const semGrounding = coletor.normalize(coletor.parse({ ...RESPOSTA, texto, grounding: null }));
  assert.equal(semGrounding.validos[0].eventos[0].aceito, false);
});

test("normalize: nível acima de NORMAL sem evento aceito vira aviso (o nível da IA não é reescrito)", () => {
  const texto = `OURO
Nível: NORMAL
Resumo: Nada fora do normal.

PETRÓLEO
Nível: ATENÇÃO
Resumo: Ameaça sem fonte autorizada.

EVENTO 1
Título: Ameaça a navios
Resumo: ...
Canal de transmissão: rota
Intensidade: baixa
Confiança: baixa
Fontes: Blog qualquer - https://exemplo.com/x
`;
  const { validos, avisos } = coletor.normalize(coletor.parse({ ...RESPOSTA, texto }));
  assert.equal(validos[0].leitura.nivel_petroleo, "ATENCAO");
  assert.equal(validos[0].eventos[0].aceito, false);
  assert.ok(avisos.some((a) => /Nível ATENCAO sem nenhum evento sustentado/.test(a.motivo)));
});

test("normalize: sem a seção do petróleo ou com nível fora da escala, nada é gravado", () => {
  const semPetroleo = coletor.normalize(coletor.parse({ ...RESPOSTA, texto: "OURO\nNível: NORMAL\nResumo: nada." }));
  assert.equal(semPetroleo.validos.length, 0);
  assert.match(semPetroleo.invalidos[0].motivo, /seção PETROLEO/);

  const nivelEstranho = coletor.normalize(
    coletor.parse({ ...RESPOSTA, texto: "OURO\nNível: Alto\nResumo: x\n\nPETRÓLEO\nNível: NORMAL\nResumo: y" })
  );
  assert.equal(nivelEstranho.validos.length, 0);
  assert.match(nivelEstranho.invalidos[0].motivo, /fora da escala: "Alto"/);
});

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
  assert.equal(chamadas[0].eventos.length, 3);
  assert.deepEqual(await coletor.persist([], { execucaoId: "exec-3" }, deps), { criados: 0, atualizados: 0, ignorados: 0, falhas: [] });
});

test("download: monta o prompt versionado com a data e as fontes e chama o provedor uma vez", async () => {
  const recebidos = [];
  const deps = {
    dataReferencia: "2026-10-01",
    geopoliticaRepository: SEM_LEITURA_HOJE,
    geminiSearch: {
      async pesquisarNaWeb(entrada) {
        recebidos.push(entrada);
        // Uma página lida (sem link de redirecionamento: nada a seguir).
        return { texto: TEXTO, grounding: { groundingChunks: [{ web: { title: "apnews.com" } }] }, modelo: "m", tokens: 1 };
      }
    }
  };
  const resposta = await coletor.download({ signal: undefined }, deps);
  assert.equal(recebidos.length, 1);
  assert.match(recebidos[0].prompt, /Data de referência: 2026-10-01/);
  assert.match(recebidos[0].prompt, /- AP News \(apnews\.com\): /);
  assert.match(recebidos[0].prompt, /- Tesouro dos EUA \(OFAC e comunicados\) \(treasury\.gov\)/);
  assert.doesNotMatch(recebidos[0].prompt, /reuters/i);
  assert.match(recebidos[0].prompt, /site:ukmto\.org/);
  assert.doesNotMatch(recebidos[0].systemInstruction, /\{\{/);
  assert.equal(resposta.versaoPrompt, "geopolitica-diaria@6");
  assert.equal(resposta.instrucaoDoSistema, recebidos[0].systemInstruction);
  assert.equal(resposta.dataReferencia, "2026-10-01");
});

test("hojeEmSaoPaulo: a data do Brasil, não a de UTC", () => {
  // 01/10 às 01:30 UTC ainda é 30/09 em São Paulo (UTC-3).
  assert.equal(coletor.hojeEmSaoPaulo(new Date("2026-10-01T01:30:00Z")), "2026-09-30");
  assert.equal(coletor.hojeEmSaoPaulo(new Date("2026-10-01T15:00:00Z")), "2026-10-01");
});

test("normalize: a mesma página com e sem barra no fim aparece uma vez só", () => {
  const texto = `OURO
Nível: ATENÇÃO
Resumo: x

EVENTO 1
Título: Sanções do Tesouro contra redes ligadas ao Irã
Canal de transmissão: sanções

PETRÓLEO
Nível: NORMAL
Resumo: y
`;
  const grounding = {
    groundingChunks: [
      { web: { title: "treasury.gov", urlFinal: "https://home.treasury.gov/news/press-releases/sb0644/" } },
      { web: { title: "treasury.gov", urlFinal: "https://home.treasury.gov/news/press-releases/sb0644" } }
    ],
    groundingSupports: [{ segment: { text: "Título: Sanções do Tesouro contra redes ligadas ao Irã" }, groundingChunkIndices: [0, 1] }]
  };
  const { validos } = coletor.normalize(coletor.parse({ ...RESPOSTA, texto, grounding }));
  assert.equal(validos[0].eventos[0].fontes.length, 1);
  assert.equal(validos[0].eventos[0].aceito, true);
});

test("parser: tipo do evento pela lista fechada; valor fora da lista vira OUTRO; sem o rótulo, null", () => {
  const secoes = parsearBoletim(TEXTO);
  assert.equal(secoes.OURO.eventos[0].tipo, "DIPLOMACIA");
  assert.equal(secoes.OURO.eventos[1].tipo, null);
  assert.equal(secoes.PETROLEO.eventos[0].tipo, "ROTA_MARITIMA");
  assert.equal(tipo("Sanções"), "SANCAO");
  assert.equal(tipo("Decisão de produção (OPEP+)"), "PRODUCAO");
  assert.equal(tipo("Conflito militar"), "CONFLITO_MILITAR");
  assert.equal(tipo("Infraestrutura"), "INFRAESTRUTURA");
  assert.equal(tipo("Ciberataque"), "OUTRO");
  assert.equal(tipo(""), null);
});

test("normalize: o assunto vem do coletor (GEOPOLITICA), o tipo vem da IA", () => {
  const { validos } = coletor.normalize(coletor.parse(RESPOSTA));
  assert.ok(validos[0].eventos.every((e) => e.assunto === "GEOPOLITICA"));
  assert.deepEqual(
    validos[0].eventos.map((e) => e.tipo),
    ["DIPLOMACIA", null, "ROTA_MARITIMA"]
  );
});

test("download: a IA respondeu sem pesquisar - tenta de novo; se pesquisou na 2ª, segue", async () => {
  const respostas = [
    { texto: TEXTO, grounding: null, modelo: "m", tokens: 1 },
    { texto: TEXTO, grounding: { groundingChunks: [{ web: { title: "ukmto.org" } }] }, modelo: "m", tokens: 2 }
  ];
  let chamadas = 0;
  const deps = { dataReferencia: "2026-10-02", geopoliticaRepository: SEM_LEITURA_HOJE, geminiSearch: { pesquisarNaWeb: async () => respostas[chamadas++] } };
  const resposta = await coletor.download({ signal: undefined }, deps);
  assert.equal(chamadas, 2);
  assert.equal(resposta.tokens, 2);
});

test("download: sem pesquisa nas 2 tentativas, falha sem gravar nada (nível e resumo de memória não chegam ao Motor)", async () => {
  let chamadas = 0;
  const semPesquisa = { texto: TEXTO, grounding: { webSearchQueries: ["x"], groundingChunks: [] }, modelo: "m", tokens: 1 };
  const deps = { dataReferencia: "2026-10-02", geopoliticaRepository: SEM_LEITURA_HOJE, geminiSearch: { pesquisarNaWeb: async () => (chamadas++, semPesquisa) } };
  await assert.rejects(coletor.download({ signal: undefined }, deps), (erro) => {
    assert.equal(erro.code, "UPSTREAM_ERROR");
    assert.match(erro.message, /respondeu sem pesquisar .* em 2 tentativas/);
    return true;
  });
  assert.equal(chamadas, 2);
});

test("download: já existe leitura de hoje - pula a chamada à IA e o persist conta como ignorado", async () => {
  let chamadas = 0;
  const datasConsultadas = [];
  const deps = {
    dataReferencia: "2026-10-02",
    refazer: false,
    geopoliticaRepository: { existeLeituraDoDia: async (data) => (datasConsultadas.push(data), true) },
    geminiSearch: { pesquisarNaWeb: async () => (chamadas++, RESPOSTA) }
  };
  const resposta = await coletor.download({ signal: undefined }, deps);
  assert.equal(chamadas, 0);
  assert.deepEqual(datasConsultadas, ["2026-10-02"]);
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
  let chamadas = 0;
  const deps = {
    dataReferencia: "2026-10-02",
    refazer: true,
    geopoliticaRepository: { existeLeituraDoDia: async () => assert.fail("não deveria consultar") },
    geminiSearch: {
      pesquisarNaWeb: async () => (chamadas++, { ...RESPOSTA, grounding: { groundingChunks: [{ web: { title: "apnews.com" } }] } })
    }
  };
  const resposta = await coletor.download({ signal: undefined }, deps);
  assert.equal(chamadas, 1);
  assert.equal(resposta.pular, undefined);
});
