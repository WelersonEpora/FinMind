"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { obterGeopoliticaDoDia, obterEventosDoFator, listarEventos, obterUltimaLeitura, obterDetalheIa } = require("./geopolitica.service");

const LEITURA = {
  nivel_ouro: "RELEVANTE",
  resumo_ouro: "Negociações EUA-Irã travadas.",
  nivel_petroleo: "NORMAL",
  resumo_petroleo: "Nada fora do normal.",
  eventos: [
    {
      aceito: true,
      titulo: "EUA negam alívio de sanções ao Irã",
      resumo: "Em 30/09...",
      tipo: "GEOPOLITICA",
      fator: "OURO_GEOPOLITICA",
      canal_transmissao: "Busca por ativo de proteção.",
      pressao: "ALTA",
      intensidade: "MEDIA",
      confianca: "ALTA",
      fontes: [
        { nome: "AP News", url: "https://apnews.com/x", fonteAutorizada: "AP", confirmadaNaPesquisa: true, origem: "pesquisa" },
        // Citação da IA (mesmo de fonte lida na pesquisa): não sustenta o evento e não vai ao bloco do Motor.
        { nome: "OFAC", url: null, fonteAutorizada: "TESOURO", confirmadaNaPesquisa: true, origem: "citada" },
        { nome: "Blog", url: "https://exemplo.com", fonteAutorizada: null }
      ]
    },
    { aceito: false, titulo: "Rejeitado", resumo: null, canal_transmissao: null, intensidade: null, confianca: null, fontes: [] }
  ]
};

function repoCom(leitura) {
  const consultas = [];
  return {
    consultas,
    async buscarLeituraComEventos(data, ativo) {
      consultas.push([data, ativo]);
      return leitura;
    }
  };
}

test("obterGeopoliticaDoDia: bloco do ativo só com os eventos aceitos e as fontes autorizadas", async () => {
  const repo = repoCom(LEITURA);
  const resultado = await obterGeopoliticaDoDia("OURO", "2026-10-01", { geopoliticaRepository: repo });

  assert.deepEqual(repo.consultas, [["2026-10-01", "OURO"]]);
  assert.equal(resultado.disponivel, true);
  assert.equal(resultado.nivel, "RELEVANTE");
  assert.equal(resultado.eventos.length, 1);
  assert.match(resultado.contexto, /^EVENTOS DE MERCADO — OURO \(2026-10-01\)/);
  assert.match(resultado.contexto, /Nível: RELEVANTE/);
  assert.match(resultado.contexto, /1\. EUA negam alívio de sanções ao Irã\n {3}Tipo: Geopolítica\n {3}Fator do FEL 1: Geopolítica e risco sistêmico/);
  assert.match(resultado.contexto, /Canal de transmissão: Busca por ativo de proteção\./);
  assert.match(resultado.contexto, /Pressão do fato sobre o preço: alta \(leitura da IA, com o resto constante\)/);
  assert.match(resultado.contexto, /Intensidade: média \| Confiança: alta/);
  assert.match(resultado.contexto, /Fontes: AP News - https:\/\/apnews\.com\/x$/m);
  assert.doesNotMatch(resultado.contexto, /OFAC/);
  assert.doesNotMatch(resultado.contexto, /exemplo\.com|Rejeitado/);
});

test("obterGeopoliticaDoDia: as fontes lidas vêm do grounding gravado, não do que a IA diz ter consultado", async () => {
  const grounding = {
    groundingChunks: [
      { web: { title: "www.gov.br", urlFinal: "https://www.gov.br/agricultura/pt-br/x" } },
      { web: { title: "ukmto.org", urlFinal: "https://www.ukmto.org/aviso.pdf" } },
      { web: { title: "www.gov.br", urlFinal: "https://www.gov.br/conab/pt-br/x" } }
    ]
  };
  const leitura = { ...LEITURA, resumo_ouro: "Foram consultadas USTR, MOFCOM e MAPA.", grounding };
  const resultado = await obterGeopoliticaDoDia("OURO", "2026-10-02", { geopoliticaRepository: repoCom(leitura) });
  assert.deepEqual(resultado.fontesLidas, ["MAPA (Ministério da Agricultura)", "UKMTO / JMIC"]);
  assert.match(resultado.contexto, /Fontes autorizadas lidas na pesquisa do dia: MAPA \(Ministério da Agricultura\), UKMTO \/ JMIC/);
  // Desde a v11 (duas chamadas), cada página é marcada com a frente: o milho só vê as da chamada de milho e café.
  const porFrente = {
    groundingChunks: [
      { frente: "OURO_PETROLEO", web: { urlFinal: "https://www.ukmto.org/aviso.pdf" } },
      { frente: "MILHO_CAFE", web: { urlFinal: "https://ustr.gov/x" } }
    ]
  };
  const milho = await obterGeopoliticaDoDia("MILHO", "2026-10-02", {
    geopoliticaRepository: repoCom({ ...LEITURA, nivel_milho: "NORMAL", grounding: porFrente, eventos: [] })
  });
  assert.deepEqual(milho.fontesLidas, ["USTR (Representante Comercial dos EUA)"]);
  const semGrounding = await obterGeopoliticaDoDia("OURO", "2026-10-02", { geopoliticaRepository: repoCom(LEITURA) });
  assert.match(semGrounding.contexto, /Fontes autorizadas lidas na pesquisa do dia: nenhuma/);
});

test("obterGeopoliticaDoDia: nível NORMAL sem eventos diz isso explicitamente", async () => {
  const resultado = await obterGeopoliticaDoDia("PETROLEO", "2026-10-01", { geopoliticaRepository: repoCom({ ...LEITURA, eventos: [] }) });
  assert.match(resultado.contexto, /^EVENTOS DE MERCADO — PETRÓLEO/);
  assert.match(resultado.contexto, /Nível: NORMAL/);
  assert.match(resultado.contexto, /nenhum evento fora do normal/);
});

test("obterGeopoliticaDoDia: sem leitura na data, 'indisponível' - nunca 'normal'", async () => {
  const resultado = await obterGeopoliticaDoDia("PETROLEO", "2026-10-02", { geopoliticaRepository: repoCom(null) });
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.nivel, null);
  assert.match(resultado.contexto, /Leitura indisponível/);
  assert.doesNotMatch(resultado.contexto, /Nível/);
});

test("obterGeopoliticaDoDia: milho e café (ADR 0049); leitura anterior sem o ativo vale como indisponível", async () => {
  const comCafe = await obterGeopoliticaDoDia("CAFE", "2026-10-02", {
    geopoliticaRepository: repoCom({ ...LEITURA, nivel_cafe: "ATENCAO", resumo_cafe: "Geada em MG.", eventos: [] })
  });
  assert.equal(comCafe.disponivel, true);
  assert.match(comCafe.contexto, /^EVENTOS DE MERCADO — CAFÉ \(2026-10-02\)/);
  assert.match(comCafe.contexto, /Resumo: Geada em MG\./);
  // Leitura de 2026-10-01 (só ouro e petróleo): para o milho, não há leitura.
  const antiga = await obterGeopoliticaDoDia("MILHO", "2026-10-01", { geopoliticaRepository: repoCom(LEITURA) });
  assert.equal(antiga.disponivel, false);
  assert.match(antiga.contexto, /Leitura indisponível/);
});

test("obterGeopoliticaDoDia: ativo ou data inválidos", async () => {
  await assert.rejects(obterGeopoliticaDoDia("SOJA", "2026-10-01", { geopoliticaRepository: repoCom(null) }), /Ativo inválido/);
  await assert.rejects(obterGeopoliticaDoDia("OURO", "01/10/2026", { geopoliticaRepository: repoCom(null) }), /Data de referência inválida/);
});

test("listarEventos: por padrão só os aceitos; filtros e paginação passam ao repositório; resposta com a data e o nível do dia", async () => {
  const chamadas = [];
  const repo = {
    async listarEventos(filtros) {
      chamadas.push(filtros);
      return {
        total: 1,
        registros: [
          {
            id: "e1",
            leitura_id: "l1",
            ativo: "PETROLEO",
            tipo: "GEOPOLITICA",
            fator: "PETROLEO_GEOPOLITICA",
            ordem: 1,
            titulo: "Petroleiro atingido",
            resumo: "r",
            canal_transmissao: "rota",
            pressao: "AMBIGUA",
            intensidade: "ALTA",
            confianca: "ALTA",
            fontes: [{ nome: "UKMTO", url: null, fonteAutorizada: "UKMTO" }],
            aceito: true,
            motivo_rejeicao: null,
            leitura: { data_referencia: "2026-10-01", nivel_ouro: "NORMAL", nivel_petroleo: "EXCEPCIONAL" }
          }
        ]
      };
    }
  };

  const resultado = await listarEventos({ ativo: "PETROLEO", dataInicio: "2026-09-01" }, { geopoliticaRepository: repo });
  assert.deepEqual(chamadas[0], {
    ativo: "PETROLEO",
    tipo: undefined,
    aceito: true,
    dataInicio: "2026-09-01",
    dataFim: undefined,
    pagina: 1,
    tamanhoPagina: 25,
    ordem: "DESC"
  });
  assert.equal(resultado.eventos[0].data, "2026-10-01");
  assert.equal(resultado.eventos[0].leituraId, "l1");
  assert.equal(resultado.eventos[0].tipo, "GEOPOLITICA");
  assert.equal(resultado.eventos[0].fator, "PETROLEO_GEOPOLITICA");
  assert.equal(resultado.eventos[0].fatorNome, "Geopolítica e conflitos (Oriente Médio, Rússia)");
  assert.equal(resultado.eventos[0].assunto, undefined);
  assert.equal(resultado.eventos[0].canalTransmissao, "rota");
  assert.equal(resultado.eventos[0].pressao, "AMBIGUA");
  assert.deepEqual(resultado.paginacao, { pagina: 1, tamanhoPagina: 25, total: 1, totalPaginas: 1 });

  await listarEventos({ situacao: "todos", ordem: "ASC" }, { geopoliticaRepository: repo });
  assert.equal(chamadas[1].aceito, undefined);
  assert.equal(chamadas[1].ordem, "ASC");
  await listarEventos({ situacao: "rejeitados" }, { geopoliticaRepository: repo });
  assert.equal(chamadas[2].aceito, false);
  await listarEventos({ ativo: "CAFE", tipo: "CLIMA_EXTREMO" }, { geopoliticaRepository: repo });
  assert.equal(chamadas[3].ativo, "CAFE");
  assert.equal(chamadas[3].tipo, "CLIMA_EXTREMO");
});

test("listarEventos: filtros inválidos", async () => {
  const repo = { listarEventos: async () => ({ registros: [], total: 0 }) };
  await assert.rejects(listarEventos({ ativo: "SOJA" }, { geopoliticaRepository: repo }), /"ativo"/);
  await assert.rejects(listarEventos({ situacao: "x" }, { geopoliticaRepository: repo }), /"situacao"/);
  await assert.rejects(listarEventos({ dataFim: "01/10/2026" }, { geopoliticaRepository: repo }), /"dataFim"/);
  await assert.rejects(listarEventos({ tipo: "SANCAO" }, { geopoliticaRepository: repo }), /"tipo"/);
});

test("obterUltimaLeitura: nível e resumo de cada ativo; null antes da primeira coleta", async () => {
  const leitura = {
    data_referencia: "2026-10-01",
    nivel_ouro: "RELEVANTE",
    resumo_ouro: "o",
    nivel_petroleo: "NORMAL",
    resumo_petroleo: "p",
    modelo: "gemini-2.5-flash",
    chave: "gratuita",
    versao_prompt: "geopolitica-diaria@1",
    updated_at: "2026-10-01T12:00:00Z"
  };
  const { leitura: resposta } = await obterUltimaLeitura({ geopoliticaRepository: { buscarUltimaLeitura: async () => leitura } });
  assert.deepEqual(resposta.ouro, { nivel: "RELEVANTE", resumo: "o" });
  // Leitura anterior ao ADR 0049: milho e café sem nível.
  assert.deepEqual(resposta.cafe, { nivel: null, resumo: null });
  assert.equal(resposta.chave, "gratuita");
  const vazia = await obterUltimaLeitura({ geopoliticaRepository: { buscarUltimaLeitura: async () => null } });
  assert.equal(vazia.leitura, null);
  // A lista de sites confiáveis vem sempre, do mesmo catálogo do prompt e do parser.
  assert.equal(vazia.fontesConfiaveis.length, 11);
  assert.deepEqual(vazia.fontesConfiaveis.find((f) => f.nome.startsWith("MAPA")).enderecos, ["gov.br/agricultura"]);
  assert.ok(!vazia.fontesConfiaveis.some((f) => f.enderecos.includes("gold.org")));
  assert.ok(vazia.fontesConfiaveis.every((f) => f.papel && f.tipos.length && f.ativos.length));
});

test("obterDetalheIa: instrução do sistema, prompt, resposta, buscas e páginas lidas da leitura", async () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const leitura = {
    id,
    data_referencia: "2026-10-02",
    updated_at: "2026-10-02T11:54:00Z",
    modelo: "gemini-3.8-flash",
    chave: "paga",
    tokens: 7096,
    versao_prompt: "geopolitica-diaria@5",
    instrucao_sistema: "Você é um analista...",
    prompt: "Data de referência: 2026-10-02",
    texto_bruto: "OURO\nNível: RELEVANTE",
    grounding: {
      webSearchQueries: ["site:ukmto.org warning"],
      groundingChunks: [{ web: { title: "ukmto.org", uri: "https://vertexaisearch/x", urlFinal: "https://www.ukmto.org/aviso.pdf" } }, { web: { title: "apnews.com" } }]
    }
  };
  const consultas = [];
  const repo = { buscarLeituraPorId: async (x) => (consultas.push(x), x === id ? leitura : null) };

  const { detalheIa } = await obterDetalheIa(id, { geopoliticaRepository: repo });
  assert.equal(detalheIa.instrucaoSistema, "Você é um analista...");
  assert.equal(detalheIa.prompt, "Data de referência: 2026-10-02");
  assert.equal(detalheIa.resposta, "OURO\nNível: RELEVANTE");
  assert.deepEqual(detalheIa.buscas, ["site:ukmto.org warning"]);
  assert.deepEqual(detalheIa.paginasLidas, [
    { site: "ukmto.org", url: "https://www.ukmto.org/aviso.pdf" },
    { site: "apnews.com", url: null }
  ]);

  await assert.rejects(obterDetalheIa("99999999-2222-3333-4444-555555555555", { geopoliticaRepository: repo }), /não encontrada/);
  await assert.rejects(obterDetalheIa("abc", { geopoliticaRepository: repo }), /Leitura inválida/);
  assert.equal(consultas.length, 2);
});

// --- Fator de evento (Metodologia do Ativo) ---

function repoDoFator({ eventos = [], datas = [], primeiraData = null } = {}) {
  const chamadas = [];
  return {
    chamadas,
    async listarEventosAceitosDoFator(args) {
      chamadas.push({ eventos: args });
      return eventos;
    },
    async listarDatasDeLeitura(args) {
      chamadas.push({ datas: args });
      return { datas, primeiraData };
    },
    async buscarLeituraComEventos(data) {
      return { ...LEITURA, data_referencia: data };
    }
  };
}

const EVENTO_OPEP = {
  leitura: { data_referencia: "2026-09-20" },
  titulo: "OPEP+ mantém o corte voluntário até dezembro",
  tipo: "POLITICA_OFERTA",
  resumo: "Em 19/09, os oito países...",
  canal_transmissao: "direto: menos oferta.",
  pressao: "ALTA",
  intensidade: "MEDIA",
  confianca: "ALTA",
  fontes: [{ nome: "OPEP", url: "https://opec.org/x", origem: "pesquisa" }]
};

test("fator de evento: os eventos aceitos do fator na janela, com a data da leitura e a idade, e os dias sem leitura", async () => {
  const repo = repoDoFator({ eventos: [EVENTO_OPEP], datas: ["2026-09-20", "2026-10-01", "2026-10-03"], primeiraData: "2026-09-20" });
  const r = await obterEventosDoFator("PETROLEO", "PETROLEO_OPEP", "2026-10-03", 45, { geopoliticaRepository: repo });
  assert.deepEqual(repo.chamadas[0].eventos, { ativo: "PETROLEO", fator: "PETROLEO_OPEP", dataInicio: "2026-08-20", dataFim: "2026-10-03" });
  assert.equal(r.inicio, "2026-08-20");
  assert.equal(r.eventos[0].idadeDias, 13);
  assert.equal(r.diasSemLeitura.length, 14 - 3);
  assert.equal(r.ultimaLeitura.data, "2026-10-03");
  assert.match(r.contexto, /EVENTOS DO FATOR — Decisões da OPEP\+ \(cotas de produção\) — PETRÓLEO \(2026-10-03\)/);
  assert.match(r.contexto, /1\. \[registrado em 2026-09-20, há 13 dia\(s\)\] OPEP\+ mantém o corte/);
  assert.match(r.contexto, /a leitura diária começou em 2026-09-20/);
  assert.match(r.contexto, /Dias sem leitura \(sem informação, não calmaria\): 2026-09-21, .* e mais 1\./);
  assert.match(r.contexto, /Retrato do ativo na leitura mais recente \(2026-10-03\): nível NORMAL\. Nada fora do normal\./);
  assert.match(r.contexto, /Fontes: OPEP - https:\/\/opec\.org\/x/);
});

test("fator de evento: sem leitura nenhuma, avisa que a ausência não é situação normal", async () => {
  const r = await obterEventosDoFator("PETROLEO", "PETROLEO_GEOPOLITICA", "2026-10-03", 30, { geopoliticaRepository: repoDoFator() });
  assert.deepEqual(r.eventos, []);
  assert.deepEqual(r.diasSemLeitura, []);
  assert.match(r.contexto, /a leitura diária ainda não rodou para este ativo/);
  assert.match(r.contexto, /nenhum evento deste fator nas leituras da janela/);
  await assert.rejects(obterEventosDoFator("PETROLEO", "PETROLEO_OPEP", "2026-10-03", 0, { geopoliticaRepository: repoDoFator() }), /janela/);
});
