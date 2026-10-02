"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { obterGeopoliticaDoDia, listarEventos, obterUltimaLeitura, obterDetalheIa } = require("./geopolitica.service");

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
      tipo: "DIPLOMACIA",
      canal_transmissao: "Busca por ativo de proteção.",
      pressao: "ALTA",
      intensidade: "MEDIA",
      confianca: "ALTA",
      fontes: [
        { nome: "AP News", url: "https://apnews.com/x", fonteAutorizada: "AP", confirmadaNaPesquisa: true },
        // Site confiável, mas não confirmado na pesquisa: não vai ao bloco do Motor.
        { nome: "OFAC", url: null, fonteAutorizada: "TESOURO", confirmadaNaPesquisa: false },
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
  assert.match(resultado.contexto, /^GEOPOLÍTICA — OURO \(2026-10-01\)/);
  assert.match(resultado.contexto, /Nível: RELEVANTE/);
  assert.match(resultado.contexto, /1\. EUA negam alívio de sanções ao Irã\n   Tipo: diplomacia/);
  assert.match(resultado.contexto, /Canal de transmissão: Busca por ativo de proteção\./);
  assert.match(resultado.contexto, /Pressão do fato sobre o preço: alta \(leitura da IA, com o resto constante\)/);
  assert.match(resultado.contexto, /Intensidade: média \| Confiança: alta/);
  assert.match(resultado.contexto, /Fontes: AP News - https:\/\/apnews\.com\/x$/m);
  assert.doesNotMatch(resultado.contexto, /OFAC/);
  assert.doesNotMatch(resultado.contexto, /exemplo\.com|Rejeitado/);
});

test("obterGeopoliticaDoDia: nível NORMAL sem eventos diz isso explicitamente", async () => {
  const resultado = await obterGeopoliticaDoDia("PETROLEO", "2026-10-01", { geopoliticaRepository: repoCom({ ...LEITURA, eventos: [] }) });
  assert.match(resultado.contexto, /^GEOPOLÍTICA — PETRÓLEO/);
  assert.match(resultado.contexto, /Nível: NORMAL/);
  assert.match(resultado.contexto, /nenhum evento geopolítico fora do normal/);
});

test("obterGeopoliticaDoDia: sem leitura na data, 'indisponível' - nunca 'normal'", async () => {
  const resultado = await obterGeopoliticaDoDia("PETROLEO", "2026-10-02", { geopoliticaRepository: repoCom(null) });
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.nivel, null);
  assert.match(resultado.contexto, /Leitura indisponível/);
  assert.doesNotMatch(resultado.contexto, /Nível/);
});

test("obterGeopoliticaDoDia: ativo ou data inválidos", async () => {
  await assert.rejects(obterGeopoliticaDoDia("CAFE", "2026-10-01", { geopoliticaRepository: repoCom(null) }), /Ativo inválido/);
  await assert.rejects(obterGeopoliticaDoDia("OURO", "01/10/2026", { geopoliticaRepository: repoCom(null) }), /Data de referência inválida/);
});

test("listarEventos: por padrão só os aceitos; filtros e paginação passam ao repositório; resposta com a data e o nível do dia", async () => {
  const chamadas = [];
  const repo = {
    listarAssuntos: async () => ["GEOPOLITICA"],
    async listarEventos(filtros) {
      chamadas.push(filtros);
      return {
        total: 1,
        registros: [
          {
            id: "e1",
            leitura_id: "l1",
            ativo: "PETROLEO",
            assunto: "GEOPOLITICA",
            tipo: "ROTA_MARITIMA",
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
    assunto: undefined,
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
  assert.equal(resultado.eventos[0].assunto, "GEOPOLITICA");
  assert.equal(resultado.eventos[0].tipo, "ROTA_MARITIMA");
  assert.deepEqual(resultado.assuntosDisponiveis, ["GEOPOLITICA"]);
  assert.equal(resultado.eventos[0].canalTransmissao, "rota");
  assert.equal(resultado.eventos[0].pressao, "AMBIGUA");
  assert.deepEqual(resultado.paginacao, { pagina: 1, tamanhoPagina: 25, total: 1, totalPaginas: 1 });

  await listarEventos({ situacao: "todos", ordem: "ASC" }, { geopoliticaRepository: repo });
  assert.equal(chamadas[1].aceito, undefined);
  assert.equal(chamadas[1].ordem, "ASC");
  await listarEventos({ situacao: "rejeitados" }, { geopoliticaRepository: repo });
  assert.equal(chamadas[2].aceito, false);
  await listarEventos({ assunto: "GEOPOLITICA", tipo: "SANCAO" }, { geopoliticaRepository: repo });
  assert.equal(chamadas[3].assunto, "GEOPOLITICA");
  assert.equal(chamadas[3].tipo, "SANCAO");
});

test("listarEventos: filtros inválidos", async () => {
  const repo = { listarEventos: async () => ({ registros: [], total: 0 }), listarAssuntos: async () => [] };
  await assert.rejects(listarEventos({ ativo: "CAFE" }, { geopoliticaRepository: repo }), /"ativo"/);
  await assert.rejects(listarEventos({ situacao: "x" }, { geopoliticaRepository: repo }), /"situacao"/);
  await assert.rejects(listarEventos({ dataFim: "01/10/2026" }, { geopoliticaRepository: repo }), /"dataFim"/);
  await assert.rejects(listarEventos({ tipo: "GUERRA" }, { geopoliticaRepository: repo }), /"tipo"/);
  await assert.rejects(listarEventos({ assunto: "CLIMA" }, { geopoliticaRepository: repo }), /"assunto"/);
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
  assert.equal(resposta.chave, "gratuita");
  const vazia = await obterUltimaLeitura({ geopoliticaRepository: { buscarUltimaLeitura: async () => null } });
  assert.equal(vazia.leitura, null);
  // A lista de sites confiáveis vem sempre, do mesmo catálogo do prompt e do parser.
  assert.deepEqual(vazia.fontesConfiaveis.map((f) => f.dominios[0]), ["ukmto.org", "treasury.gov", "opec.org", "apnews.com", "gold.org"]);
  assert.ok(vazia.fontesConfiaveis.every((f) => f.papel));
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
