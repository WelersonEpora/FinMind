"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { URL } = require("node:url");
const coletor = require("./imea-oferta-demanda-milho.collector");

// Um item real do catálogo (`GET /api/arquivo`), reduzido aos campos usados. O achado real de
// 2026-09-22: o catálogo também tem um PDF de METODOLOGIA ("OFERTA E DEMANDA", sem "- Milho", path
// em `/Metodologias/...`) misturado com as edições mensais - `ehEdicaoValida` precisa descartá-lo.
function arquivo({ nome = "Oferta e Demanda - Milho", id, data, mimeType = "application/pdf", path = "https://bucket/x.pdf?assinatura", isPublico = true, liberado = true }) {
  return { Nome: nome, Id: id, Data: data, MimeType: mimeType, Path: path, IsPublico: isPublico, Liberado: liberado, UrlCompleto: "https://imea.com.br/pagina" };
}

const ED_2026 = arquivo({ id: "1", data: "2026-08-31T00:00:00" });
const METODOLOGIA = arquivo({ nome: "OFERTA E DEMANDA", id: "2", data: "2017-01-07T00:00:00", path: "https://bucket/Metodologias/3/x.pdf" });

const resposta = (corpo, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => corpo,
  arrayBuffer: async () => (Buffer.isBuffer(corpo) ? corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength) : Buffer.from("").buffer)
});

// PDF "grande o bastante" pra passar da guarda de tamanho, com a assinatura real ("%PDF").
const PDF_FALSO = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(25_000)]);

function fetchFake(rotas, chamadas = []) {
  return async (url) => {
    chamadas.push(url);
    const rota = rotas[url] ?? Object.entries(rotas).find(([chave]) => url.startsWith(chave))?.[1];
    if (rota === undefined) return resposta("", { ok: false, status: 404 });
    return typeof rota === "function" ? rota() : resposta(rota);
  };
}

// --- ehEdicaoValida ---

test("ehEdicaoValida: aceita \"Oferta e Demanda - Milho\" em PDF, público e liberado", () => {
  assert.equal(coletor.ehEdicaoValida(ED_2026), true);
});

test("ehEdicaoValida: descarta o PDF de metodologia (\"OFERTA E DEMANDA\", achado real do catálogo) e nomes de outra cadeia", () => {
  assert.equal(coletor.ehEdicaoValida(METODOLOGIA), false);
  assert.equal(coletor.ehEdicaoValida(arquivo({ nome: "Boletim Semanal - Milho", id: "3", data: "2026-08-31" })), false);
});

test("ehEdicaoValida: descarta sem Path, não público, não liberado ou que não seja PDF", () => {
  assert.equal(coletor.ehEdicaoValida(arquivo({ id: "1", data: "x", path: null })), false);
  assert.equal(coletor.ehEdicaoValida(arquivo({ id: "1", data: "x", isPublico: false })), false);
  assert.equal(coletor.ehEdicaoValida(arquivo({ id: "1", data: "x", liberado: false })), false);
  assert.equal(coletor.ehEdicaoValida(arquivo({ id: "1", data: "x", mimeType: "application/vnd.ms-excel" })), false);
});

// --- escolherUmaPorData ---

test("escolherUmaPorData: republicação no mesmo dia (achado real de 2017-12-18) vale a de MAIOR id", () => {
  const antiga = { id: "700679871802376192", data: "2017-12-18" };
  const nova = { id: "728504982270115840", data: "2017-12-18" };
  const escolhidas = coletor.escolherUmaPorData([antiga, nova]);
  assert.deepEqual(escolhidas, [nova]);
});

test("escolherUmaPorData: sai em ordem cronológica", () => {
  const escolhidas = coletor.escolherUmaPorData([{ id: "2", data: "2020-01-01" }, { id: "1", data: "2014-04-14" }]);
  assert.deepEqual(escolhidas.map((e) => e.data), ["2014-04-14", "2020-01-01"]);
});

// --- listarCatalogo / listarEdicoes ---

test("listarCatalogo: pede cadeia=3, nome=Oferta e Demanda e para quando junta o TotalCount", async () => {
  const chamadas = [];
  const fetchFn = fetchFake({ [coletor.URL_LISTA]: () => resposta({ TotalCount: 1, Result: [ED_2026] }) }, chamadas);
  const arquivos = await coletor.listarCatalogo({ fetchFn });

  assert.equal(arquivos.length, 1);
  assert.equal(chamadas.length, 1);
  const url = new URL(chamadas[0]);
  assert.equal(url.searchParams.get("cadeia"), "3");
  assert.equal(url.searchParams.get("nome"), "Oferta e Demanda");
});

test("listarCatalogo: resposta sem `Result` é barrada", async () => {
  await assert.rejects(coletor.listarCatalogo({ fetchFn: fetchFake({ [coletor.URL_LISTA]: () => resposta({ TotalCount: 1 }) }) }), /não trouxe `Result`/);
});

test("listarEdicoes: filtra inválidas (metodologia), aplica desde/ate e devolve em ordem cronológica", async () => {
  const fetchFn = fetchFake({
    [coletor.URL_LISTA]: () =>
      resposta({
        TotalCount: 3,
        Result: [ED_2026, METODOLOGIA, arquivo({ id: "3", data: "2020-01-01T00:00:00" })]
      })
  });

  const todas = await coletor.listarEdicoes({ fetchFn });
  assert.deepEqual(todas.map((e) => e.data), ["2020-01-01", "2026-08-31"]);

  const filtradas = await coletor.listarEdicoes({ desde: "2021-01-01", fetchFn });
  assert.deepEqual(filtradas.map((e) => e.data), ["2026-08-31"]);
});

// --- baixarEdicoes / download / downloadIntervalo ---

test("baixarEdicoes: lê cada PDF com pdfjs (paginas), sem URL assinada seguindo adiante, com pausa entre downloads", async () => {
  const chamadasEspera = [];
  const fetchFn = fetchFake({ "https://bucket/x.pdf?assinatura": () => resposta(PDF_FALSO) });

  const baixadas = await coletor.baixarEdicoes([{ id: "1", data: "2026-08-31", path: "https://bucket/x.pdf?assinatura" }, { id: "2", data: "2026-08-03", path: "https://bucket/x.pdf?assinatura" }], {
    fetchFn,
    esperar: async (ms) => chamadasEspera.push(ms)
  });

  assert.equal(baixadas.length, 2);
  assert.equal(baixadas[0].path, undefined, "a URL assinada não segue adiante");
  // PDF_FALSO não tem a tabela real: vira `erro` no PRÓPRIO item, não uma exceção (a leitura falha, não o download).
  assert.match(baixadas[0].erro, /Falha ao ler o PDF/);
  assert.deepEqual(chamadasEspera, [1000], "1 pausa entre os 2 downloads");
});

test("baixarEdicoes: arquivo que não parece PDF (pequeno ou sem assinatura \"%PDF\") aborta a execução (falha de comunicação)", async () => {
  const fetchFn = fetchFake({ "https://bucket/x.pdf?assinatura": () => resposta(Buffer.from("não é um pdf")) });
  await assert.rejects(
    coletor.baixarEdicoes([{ id: "1", data: "2026-08-31", nome: "Oferta e Demanda - Milho", path: "https://bucket/x.pdf?assinatura" }], { fetchFn }),
    /não parece um PDF/
  );
});

test("download: só as 2 edições mais recentes do catálogo (coleta diária relê a última + uma correção)", async () => {
  const fetchFn = fetchFake({
    [coletor.URL_LISTA]: () =>
      resposta({
        TotalCount: 3,
        Result: [arquivo({ id: "1", data: "2014-04-14T00:00:00", path: "https://bucket/a.pdf" }), arquivo({ id: "2", data: "2026-08-03T00:00:00", path: "https://bucket/b.pdf" }), arquivo({ id: "3", data: "2026-08-31T00:00:00", path: "https://bucket/c.pdf" })]
      }),
    "https://bucket/b.pdf": () => resposta(PDF_FALSO),
    "https://bucket/c.pdf": () => resposta(PDF_FALSO)
  });

  const baixadas = await coletor.download({ fetchFn, esperar: async () => {} });
  assert.deepEqual(baixadas.map((b) => b.data), ["2026-08-03", "2026-08-31"]);
});

test("downloadIntervalo: respeita dataInicial/dataFinal (usado pelo backfill)", async () => {
  const fetchFn = fetchFake({
    [coletor.URL_LISTA]: () =>
      resposta({
        TotalCount: 2,
        Result: [arquivo({ id: "1", data: "2014-04-14T00:00:00", path: "https://bucket/a.pdf" }), arquivo({ id: "2", data: "2020-01-01T00:00:00", path: "https://bucket/b.pdf" })]
      }),
    "https://bucket/b.pdf": () => resposta(PDF_FALSO)
  });

  const baixadas = await coletor.downloadIntervalo({ dataInicial: "2018-01-01", dataFinal: "2022-01-01", fetchFn, esperar: async () => {} });
  assert.deepEqual(baixadas.map((b) => b.data), ["2020-01-01"]);
});

// --- parse ---

test("parse: repassa erro de leitura (marcado no download) sem chamar extrairBalanco; interpreta páginas boas", () => {
  const paginasBoas = [
    {
      itens: [
        { str: "2011/12", x: 267.9, y: 678 },
        { str: "2012/13", x: 329, y: 678 },
        { str: "Estoque Inicial", x: 88.6, y: 657 },
        { str: "0,17", x: 267.9, y: 657 },
        { str: "0,20", x: 329, y: 657 }
      ]
    }
  ];
  const [comErro, boa] = coletor.parse([
    { id: "1", data: "2020-01-01", nome: "x", erro: "Falha ao ler o PDF: xyz" },
    { id: "2", data: "2026-08-31", nome: "x", urlPublica: null, paginas: paginasBoas }
  ]);

  assert.equal(comErro.erro, "Falha ao ler o PDF: xyz");
  assert.equal(comErro.paginas, undefined, "o erro não carrega a lista de páginas adiante");
  assert.deepEqual(Object.keys(boa.linhas), ["ESTOQUE_INICIAL"]);
});

test("parse: formato de entrada inesperado é barrado", () => {
  assert.throws(() => coletor.parse({}), /formato inesperado/);
});

// --- normalize ---

function edicaoComLinhas(data, id, linhas) {
  return { id, data, nome: "Oferta e Demanda - Milho", urlPublica: "https://imea.com.br/x", linhas, invalidos: [] };
}

test("normalize: um valor por campo/safra, published_at é o fim do dia da edição, série IMEA.MILHO.BALANCO.<CAMPO>", () => {
  const edicao = edicaoComLinhas("2026-08-31", "1", {
    ESTOQUE_FINAL: { "2025/26": { valor: 0.64, texto: "0,64", estimativa: true, anoInicial: 2025 } },
    PRODUCAO: { "2025/26": { valor: 58.04, texto: "58,04", estimativa: true, anoInicial: 2025 } }
  });

  const { validos, invalidos } = coletor.normalize([edicao]);

  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 2);
  const estoque = validos.find((v) => v.metadata.campo === "ESTOQUE_FINAL");
  assert.equal(estoque.series_code, "IMEA.MILHO.BALANCO.ESTOQUE_FINAL");
  assert.equal(estoque.observed_at, "2025-09-01");
  assert.equal(estoque.value, 0.64);
  assert.equal(estoque.unit, "milhões de t");
  assert.equal(estoque.source_code, "IMEA_MILHO_BALANCO");
  assert.equal(estoque.published_at.toISOString(), "2026-08-31T23:59:59.000Z");
  assert.equal(estoque.published_at_is_estimated, false);
  assert.equal(estoque.metadata.safra, "2025/26");
  assert.equal(estoque.metadata.estimativa, true);
  assert.equal(estoque.metadata.arquivoId, "1");
});

test("normalize: ordena por data de publicação (o serviço point-in-time compara com a versão anterior)", () => {
  const { validos } = coletor.normalize([
    edicaoComLinhas("2026-08-31", "2", { PRODUCAO: { "2025/26": { valor: 58.04, texto: "58,04", estimativa: true, anoInicial: 2025 } } }),
    edicaoComLinhas("2026-08-03", "1", { PRODUCAO: { "2025/26": { valor: 55.95, texto: "55,95", estimativa: true, anoInicial: 2025 } } })
  ]);
  assert.deepEqual(validos.map((v) => v.value), [55.95, 58.04]);
});

test("normalize: erro de leitura vira inválido direto; edição sem NENHUM campo lido soma o próprio inválido do parser com o resumo \"nenhum campo\"; outras seguem normalmente", () => {
  const { validos, invalidos } = coletor.normalize([
    { id: "1", data: "2020-01-01", nome: "x", erro: "Falha ao ler o PDF: xyz" },
    // Uma edição sem NENHUM campo lido (linhas vazio) sempre soma o(s) inválido(s) específico(s) do
    // parser (aqui, 1 valor não numérico) com o resumo abaixo - os dois são informativos.
    { ...edicaoComLinhas("2020-02-01", "2", {}), invalidos: [{ rotulo: "PRODUCAO", safra: "2019/20", motivo: 'Valor não numérico ("abc") em PRODUCAO/2019/20.' }] },
    edicaoComLinhas("2026-08-31", "3", { PRODUCAO: { "2025/26": { valor: 58.04, texto: "58,04", estimativa: true, anoInicial: 2025 } } })
  ]);

  assert.equal(validos.length, 1);
  assert.equal(invalidos.length, 3);
  assert.equal(invalidos[0].motivo, "Falha ao ler o PDF: xyz");
  assert.match(invalidos[1].motivo, /não numérico/);
  assert.match(invalidos[2].motivo, /Nenhum campo conhecido/);
});

// --- persist / persistirBackfill (a lógica de `persistirPorEdicao` já é testada em collectors/base;
// aqui só confere a fiação: exigirCargaInicial na diária, sem trava no backfill) ---

function repositorioEmMemoria() {
  const linhas = [];
  return {
    linhas,
    async buscarUltimasVersoes(seriesCode) {
      const mapa = new Map();
      for (const l of linhas.filter((x) => x.series_code === seriesCode)) {
        const atual = mapa.get(l.observed_at);
        if (!atual || l.revision_seq > atual.revision_seq) mapa.set(l.observed_at, l);
      }
      return mapa;
    },
    async inserirVersoes(novas) {
      linhas.push(...novas);
      return novas.length;
    },
    async listarSeriesEInstantes(sourceCode) {
      const vistos = new Map();
      for (const l of linhas.filter((x) => x.source_code === sourceCode)) vistos.set(`${l.series_code}|${l.published_at.getTime()}`, { series_code: l.series_code, published_at: l.published_at });
      return [...vistos.values()];
    }
  };
}

test("persist (coleta diária) se recusa a gravar com a fonte vazia; persistirBackfill não tem essa trava", async () => {
  const repo = repositorioEmMemoria();
  const validos = coletor.normalize([edicaoComLinhas("2026-08-31", "1", { PRODUCAO: { "2025/26": { valor: 58.04, texto: "58,04", estimativa: true, anoInicial: 2025 } } })]).validos;

  const recusada = await coletor.persist(validos, { execucaoId: "x" }, { observationRepository: repo });
  assert.equal(repo.linhas.length, 0);
  assert.equal(recusada.falhas.length, 1);
  assert.match(recusada.falhas[0].motivo, /backfill:imea-oferta-demanda/);

  const aceita = await coletor.persistirBackfill(validos, { execucaoId: "y" }, { observationRepository: repo });
  assert.equal(aceita.criados, 1);
  assert.equal(repo.linhas.length, 1);
});
