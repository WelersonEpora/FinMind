"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const collector = require("./conab-cafe.collector");

const BASE = "https://www.gov.br/conab/pt-br/atuacao/informacoes-agropecuarias/safras/safra-de-cafe";
const pasta = (ano, n) => `${BASE}/${n}o-levantamento-de-cafe-safra-${ano}`;
const pagina = (ano, n) => `${pasta(ano, n)}/${n}o-levantamento-de-cafe-safra-${ano}`;

// Página no formato real: conteúdo com o boletim e a planilha (2023-2025: sem extensão), datas no rodapé.
const htmlPagina = (ano, n, { publicado = "04/09/2025 09h00", planilha = "tabela-de-dados-estimativas-da-producao-e-colheita" } = {}) => `
  <nav><a href="${BASE}/outra-coisa/tabela-de-dados-x">link de fora do conteúdo</a></nav>
  <div id="content-core">
    <a href="${pasta(ano, n)}/boletim-cafe-setembro-2025">Boletim</a>
    <a href="${pasta(ano, n)}/${planilha}">Tabela de dados</a>
  </div>
  <p>Publicado em ${publicado} Atualizado em ${publicado}</p>`;

// Planilha mínima no layout real (XLS antigo), com as três abas.
function bufferXls(nota = "setembro/2025") {
  const aba = [
    ["REGIÃO/UF", "ÁREA EM PRODUÇÃO (ha)", null, null, "PRODUTIVIDADE (sc/ha)", null, null, "PRODUÇÃO (mil sacas beneficiadas)", null, null],
    [null, "Safra 2024", "Safra 2025", "VAR. %", "Safra 2024", "Safra 2025", "VAR. %", "Safra 2024", "Safra 2025", "VAR. %"],
    ["BRASIL", 1881173.6, 1853736.6, -1.5, 28.8, 29.8, 3.4, 54215.1, 55203.9, 1.8],
    [`Nota: Estimativa em ${nota}.`]
  ];
  const wb = XLSX.utils.book_new();
  for (const nome of ["1 Café Total", "2 Café Arábica", "3 Café Conilon"]) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aba), nome);
  return XLSX.write(wb, { type: "buffer", bookType: "biff8" });
}

const resposta = (status, corpo) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => String(corpo),
  arrayBuffer: async () => {
    const b = Buffer.isBuffer(corpo) ? corpo : Buffer.from(String(corpo));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
});

test("extrairLinkPlanilha: acha a planilha com ou sem extensão, só dentro da pasta do levantamento", () => {
  const slug = "3o-levantamento-de-cafe-safra-2025";
  assert.equal(collector.extrairLinkPlanilha(htmlPagina(2025, 3), slug), `${pasta(2025, 3)}/tabela-de-dados-estimativas-da-producao-e-colheita`);
  assert.equal(
    collector.extrairLinkPlanilha(htmlPagina(2025, 3, { planilha: "site_previsao-de-safra-cafe-set-2025.xls" }), slug),
    `${pasta(2025, 3)}/site_previsao-de-safra-cafe-set-2025.xls`
  );
  assert.equal(collector.extrairLinkPlanilha('<div id="content-core"><a href="x/boletim.pdf">b</a></div>', slug), null);
});

test("baixarAnos: 404 é levantamento ainda não publicado; página + planilha para os demais", async () => {
  const pedidos = [];
  const fetchFn = async (url) => {
    pedidos.push(url);
    if (url === pagina(2025, 3)) return resposta(200, htmlPagina(2025, 3));
    if (url.endsWith("/tabela-de-dados-estimativas-da-producao-e-colheita")) return resposta(200, bufferXls());
    return resposta(404, "não encontrado");
  };

  const baixados = await collector.baixarAnos([2025], { fetchFn, esperar: async () => {}, tamanhoMinimo: 0 });

  assert.equal(baixados.length, 1);
  assert.equal(baixados[0].numero, 3);
  assert.equal(baixados[0].publicadoEm.toISOString(), "2025-09-04T12:00:00.000Z", "09h00 em Brasília = 12h00 UTC");
  assert.equal(pedidos.filter((u) => u.includes("-levantamento-de-cafe-safra-2025/")).length, 5, "4 páginas + 1 planilha");
});

test("baixarAnos: arquivo que não é XLS (página de erro no lugar da planilha) ou erro HTTP que não é 404 falha a coleta", async () => {
  const comHtmlNoLugar = async (url) => (url === pagina(2025, 1) ? resposta(200, htmlPagina(2025, 1)) : url.includes("tabela-de-dados") ? resposta(200, "<html>erro</html>") : resposta(404, ""));
  await assert.rejects(() => collector.baixarAnos([2025], { fetchFn: comHtmlNoLugar, esperar: async () => {}, tamanhoMinimo: 0 }), /não parece uma planilha XLS/);

  await assert.rejects(() => collector.baixarAnos([2025], { fetchFn: async () => resposta(500, ""), esperar: async () => {} }), /status 500/);
});

test("decidirPublicacao: a data da página vale se cai no mês da nota; se não (página republicada), fim do mês da nota, ESTIMADO", () => {
  const ok = collector.decidirPublicacao({ publicadoEm: new Date("2025-09-04T12:00:00Z"), estimativa: { mes: 9, ano: 2025 } });
  assert.deepEqual(ok, { publishedAt: new Date("2025-09-04T12:00:00Z"), estimado: false, motivo: null });

  // Caso real: 1º levantamento de 2024, página "Publicado em 24/01/2025", nota "janeiro/2024".
  const republicada = collector.decidirPublicacao({ publicadoEm: new Date("2025-01-24T09:00:00Z"), estimativa: { mes: 1, ano: 2024 } });
  assert.equal(republicada.estimado, true);
  assert.equal(republicada.publishedAt.toISOString(), "2024-02-01T02:59:59.000Z", "31/01/2024 23:59:59 em Brasília");
  assert.match(republicada.motivo, /republicada/);

  assert.ok(collector.decidirPublicacao({ publicadoEm: new Date(), estimativa: null }).erro);
});

test("normalize: séries do café com a data real, fonte própria, e o levantamento republicado marcado como estimado", () => {
  const base = { arquivo: "tabela", atualizadoEm: null, invalidos: [] };
  const observacao = (safra) => ({ seriesCode: "CONAB.CAFE.BRASIL.PRODUCAO_TOTAL", observedAt: `${safra}-01-01`, valor: 55000, unidade: "mil sacas", tipo: "TOTAL", regiao: "BRASIL", metrica: "PRODUCAO", safra });
  const { validos, invalidos } = collector.normalize([
    { ...base, ano: 2024, numero: 2, publicadoEm: new Date("2024-05-25T12:00:00Z"), estimativa: { mes: 5, ano: 2024 }, observacoes: [observacao("2024")] },
    { ...base, ano: 2024, numero: 1, publicadoEm: new Date("2025-01-24T09:00:00Z"), estimativa: { mes: 1, ano: 2024 }, observacoes: [observacao("2024")] },
    { ...base, ano: 2023, numero: 1, erro: "Falha ao ler a planilha: x" }
  ]);

  assert.equal(invalidos.length, 1);
  assert.deepEqual(validos.map((v) => v.metadata.levantamento), ["1º levantamento safra 2024", "2º levantamento safra 2024"], "em ordem de publicação");
  const [republicado, normal] = validos;
  assert.equal(republicado.published_at_is_estimated, true);
  assert.equal(republicado.published_at_basis, "lag_rule");
  assert.match(republicado.metadata.motivoPublicacaoEstimada, /republicada/);
  assert.equal(normal.published_at_is_estimated, false);
  assert.equal(normal.published_at_basis, "source");
  assert.equal(normal.source_code, "CONAB_LEVANTAMENTO_CAFE");
  assert.equal(normal.metadata.mesDaEstimativa, "2024-05");
});

test("parse lê a planilha baixada; planilha ilegível vira erro do levantamento, sem abortar os outros", () => {
  const [bom, ruim] = collector.parse([
    { ano: 2025, numero: 3, buffer: bufferXls() },
    { ano: 2025, numero: 4, buffer: Buffer.from("não é planilha") }
  ]);
  assert.equal(bom.observacoes.length, 6 * 3, "3 métricas x 2 safras x 3 abas");
  assert.deepEqual(bom.estimativa, { mes: 9, ano: 2025 });
  assert.match(ruim.erro, /Falha ao ler a planilha/);
});

function depsFake({ carregadas = [], escritas = [] } = {}) {
  return {
    observationRepository: { listarSeriesEInstantes: async () => carregadas },
    pointInTimeService: {
      registrarObservacoes: async (obs) => {
        escritas.push(...obs);
        return { criados: obs.length, atualizados: 0, ignorados: 0, falhas: [] };
      }
    }
  };
}

const validosDeTeste = () =>
  collector.normalize(collector.parse([{ ano: 2025, numero: 3, arquivo: "tabela", publicadoEm: new Date("2025-09-04T12:00:00Z"), atualizadoEm: null, buffer: bufferXls() }])).validos;

test("persist diário: com a fonte vazia se recusa a gravar e manda rodar o backfill (ordem de carga)", async () => {
  const escritas = [];
  const resultado = await collector.persist(validosDeTeste(), { execucaoId: "x" }, depsFake({ escritas }));

  assert.equal(escritas.length, 0);
  assert.equal(resultado.criados, 0);
  assert.match(resultado.falhas[0].motivo, /npm run backfill:conab-cafe/);
});

test("persistirBackfill grava com a fonte vazia; depois, o levantamento já ingerido é descartado pela coleta diária", async () => {
  const escritas = [];
  const validos = validosDeTeste();
  const carga = await collector.persistirBackfill(validos, { execucaoId: "x" }, depsFake({ escritas }));
  assert.equal(carga.criados, validos.length);

  const carregadas = [...new Set(validos.map((v) => v.series_code))].map((series_code) => ({ series_code, published_at: validos[0].published_at }));
  const diaria = await collector.persist(validos, { execucaoId: "x" }, depsFake({ carregadas, escritas: [] }));
  assert.equal(diaria.criados, 0);
  assert.equal(diaria.ignorados, validos.length);
});
