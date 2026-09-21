"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const collector = require("./conab-milho.collector");

const BASE = "https://www.gov.br/conab/pt-br/atuacao/informacoes-agropecuarias/safras/safra-de-graos/boletim-da-safra-de-graos";
const xlsxUrl = (n, safra, mes) => `${BASE}/${n}o-levantamento-safra-${safra}/site_previsao_de_safra-por_produto-${mes}.xlsx`;
const paginaUrl = (n, safra) => `${BASE}/${n}o-levantamento-safra-${safra}/${n}o-levantamento-safra-${safra}`;

const HTML_INDICE = `
  <a href="${xlsxUrl(11, "2025-26", "ago-2026")}">planilha</a>
  <a href="/conab/pt-br/atuacao/informacoes-agropecuarias/safras/safra-de-graos/boletim-da-safra-de-graos/12o-levantamento-safra-2025-26/site_previsao_de_safra-por_produto-set-2026.xlsx">planilha (relativo)</a>
  <a href="${xlsxUrl(12, "2024-25", "set-2025")}">planilha</a>
  <a href="${xlsxUrl(11, "2025-26", "ago-2026")}">repetido</a>
  <a href="${BASE}/12o-levantamento-safra-2025-26/e-book.pdf">pdf</a>
  <a href="${BASE}/12o-levantamento-safra-2025-26/outra-planilha.xlsx">xlsx que não é por_produto</a>`;

const HTML_PAGINA = "<html><body><script>var x = 'Publicado em 01/01/2000 00h00'</script><p>Publicado em 15/09/2026 09h00 Atualizado em 28/09/2026 17h30</p></body></html>";

// Planilha mínima e válida no layout real (uma linha por aba), para exercitar parse/normalize.
function bufferDeLevantamento(mesBalanco = "set/26", nota = "setembro/2026") {
  const aba = (dados) => [
    [], [], [], [],
    ["REGIÃO/UF", "ÁREA (Em mil ha)", null, null, "PRODUTIVIDADE (Em kg/ha)", null, null, "PRODUÇÃO (Em mil t)", null, null],
    [null, "Safra 24/25", "Safra 25/26", "VAR. %", "Safra 24/25", "Safra 25/26", "VAR. %", "Safra 24/25", "Safra 25/26", "VAR. %"],
    [null, "(a)", "(b)", "(b/a)", "(c)", "(d)", "(d/c)", "(e)", "(f)", "(f/e)"],
    ...dados,
    ["Fonte: Conab."],
    [`Nota: Estimativa em ${nota}.`]
  ];
  const brasil = [["BRASIL", 21838, 22600.5, 3.5, 6463.85, 6371.96, -1.4, 141157.6, 144009.6, 2]];
  const suprimento = [
    [], ["BRASIL"], ["BALANÇO"], [],
    ["PRODUTO", "SAFRA", null, "ESTOQUE INICIAL", "PRODUÇÃO", "IMPORTAÇÃO", "SUPRIMENTO", "CONSUMO", "EXPORTAÇÃO", "DEMANDA TOTAL", "ESTOQUE FINAL"],
    ["MILHO", "2025/26", mesBalanco, 12063.64, 144009.6, 1700, 157773.24, 98203, 43916.2, 142119.2, 15654.04]
  ];
  const wb = XLSX.utils.book_new();
  for (const nome of ["Milho 1a", "Milho 2a", "Milho 3a", "Milho Total"]) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aba(brasil)), nome);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(suprimento), "Suprimento");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const resposta = (corpo, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  text: async () => corpo,
  arrayBuffer: async () => (Buffer.isBuffer(corpo) ? corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength) : Buffer.from(String(corpo)).buffer)
});

// XLSX "grande o bastante" para passar da guarda de tamanho (assinatura ZIP "PK").
const XLSX_FALSO = Buffer.concat([Buffer.from("PK"), Buffer.alloc(250_000)]);

function fetchFake(rotas, chamadas = []) {
  return async (url) => {
    chamadas.push(url);
    const rota = rotas[url];
    if (rota === undefined) return resposta("", { ok: false, status: 404 });
    return typeof rota === "function" ? rota() : resposta(rota);
  };
}

// --- índice e página ---

test("extrairLevantamentosDoIndice: só planilhas por_produto, sem repetir, com URL absoluta, do mais antigo ao mais novo", () => {
  const lista = collector.extrairLevantamentosDoIndice(HTML_INDICE);

  assert.deepEqual(lista.map((l) => `${l.safra} #${l.numero}`), ["2024/25 #12", "2025/26 #11", "2025/26 #12"]);
  assert.equal(lista[2].urlXlsx, xlsxUrl(12, "2025-26", "set-2026"), "href relativo vira URL absoluta");
  assert.equal(lista[2].urlPagina, paginaUrl(12, "2025-26"));
  assert.equal(lista[2].arquivo, "site_previsao_de_safra-por_produto-set-2026.xlsx");
});

test("extrairDatasDaPagina: 'Publicado em' de Brasília (UTC-3) vira instante UTC; ignora o texto dentro de <script>", () => {
  const { publicadoEm, atualizadoEm } = collector.extrairDatasDaPagina(HTML_PAGINA);

  assert.equal(publicadoEm.toISOString(), "2026-09-15T12:00:00.000Z");
  assert.equal(atualizadoEm.toISOString(), "2026-09-28T20:30:00.000Z");
});

test("extrairDatasDaPagina: página sem as datas devolve null (não inventa)", () => {
  assert.deepEqual(collector.extrairDatasDaPagina("<p>nada aqui</p>"), { publicadoEm: null, atualizadoEm: null });
});

// --- download ---

test("download diário: só o levantamento mais recente (índice + página + planilha)", async () => {
  const chamadas = [];
  const fetchFn = fetchFake(
    {
      [BASE]: HTML_INDICE,
      [paginaUrl(12, "2025-26")]: HTML_PAGINA,
      [xlsxUrl(12, "2025-26", "set-2026")]: XLSX_FALSO
    },
    chamadas
  );

  const baixados = await collector.download({ fetchFn, esperar: async () => {} });

  assert.equal(baixados.length, 1);
  assert.equal(baixados[0].numero, 12);
  assert.equal(baixados[0].safra, "2025/26");
  assert.equal(baixados[0].publicadoEm.toISOString(), "2026-09-15T12:00:00.000Z");
  assert.deepEqual(chamadas, [BASE, paginaUrl(12, "2025-26"), xlsxUrl(12, "2025-26", "set-2026")]);
});

test("downloadTodos: baixa todos, em ordem cronológica, com pausa entre eles", async () => {
  const pausas = [];
  const fetchFn = fetchFake({
    [BASE]: HTML_INDICE,
    [paginaUrl(12, "2024-25")]: HTML_PAGINA,
    [paginaUrl(11, "2025-26")]: HTML_PAGINA,
    [paginaUrl(12, "2025-26")]: HTML_PAGINA,
    [xlsxUrl(12, "2024-25", "set-2025")]: XLSX_FALSO,
    [xlsxUrl(11, "2025-26", "ago-2026")]: XLSX_FALSO,
    [xlsxUrl(12, "2025-26", "set-2026")]: XLSX_FALSO
  });

  const baixados = await collector.downloadTodos({ fetchFn, esperar: async (ms) => pausas.push(ms) });

  assert.deepEqual(baixados.map((b) => `${b.safra} #${b.numero}`), ["2024/25 #12", "2025/26 #11", "2025/26 #12"]);
  assert.deepEqual(pausas, [collector.PAUSA_MS, collector.PAUSA_MS], "1 s entre os downloads (a política de uso da Conab não foi confirmada)");
});

test("download recusa arquivo que não é XLSX (página de erro salva como planilha) e índice sem planilhas", async () => {
  const [lev] = collector.extrairLevantamentosDoIndice(HTML_INDICE);
  const erro = fetchFake({ [lev.urlPagina]: HTML_PAGINA, [lev.urlXlsx]: "<html>erro</html>" });
  await assert.rejects(() => collector.baixarLevantamentos([lev], { fetchFn: erro }), /não parece uma planilha XLSX/);

  await assert.rejects(() => collector.download({ fetchFn: fetchFake({ [BASE]: "<html></html>" }) }), /nenhuma planilha/);
  await assert.rejects(() => collector.download({ fetchFn: fetchFake({}) }), /status 404/);
});

// --- parse / normalize ---

const levantamentoBase = () => ({
  numero: 12,
  safra: "2025/26",
  arquivo: "site_previsao_de_safra-por_produto-set-2026.xlsx",
  publicadoEm: new Date("2026-09-15T12:00:00Z"),
  atualizadoEm: new Date("2026-09-28T20:30:00Z"),
  buffer: bufferDeLevantamento()
});

test("normalize: cada valor sai com o published_at REAL (não estimado) e a origem no metadata", () => {
  const { validos, invalidos } = collector.normalize(collector.parse([levantamentoBase()]));

  assert.equal(invalidos.length, 0);
  const producao = validos.find((v) => v.series_code === "CONAB.MILHO.BRASIL.PRODUCAO_TOTAL" && v.observed_at === "2025-09-01");
  assert.equal(producao.value, 144009.6);
  assert.equal(producao.unit, "mil t");
  assert.equal(producao.source_code, "CONAB_LEVANTAMENTO_SAFRAS");
  assert.equal(producao.published_at.toISOString(), "2026-09-15T12:00:00.000Z");
  assert.equal(producao.published_at_is_estimated, false);
  assert.equal(producao.published_at_basis, "source");
  assert.equal(producao.metadata.levantamento, "12º levantamento safra 2025/26");
  assert.equal(producao.metadata.paginaAtualizadaEm, "2026-09-28T20:30:00.000Z", "a data de atualização da página fica registrada");
  assert.ok(validos.some((v) => v.series_code === "CONAB.MILHO.BALANCO.ESTOQUE_FINAL"));
});

test("normalize: mês do balanço ou da nota diferente da publicação barra o levantamento inteiro", () => {
  const balanco = collector.normalize(collector.parse([{ ...levantamentoBase(), buffer: bufferDeLevantamento("ago/26") }]));
  assert.equal(balanco.validos.length, 0);
  assert.match(balanco.invalidos[0].motivo, /mês do balanço \(8\/2026\) não confere com a publicação \(9\/2026\)/);

  const nota = collector.normalize(collector.parse([{ ...levantamentoBase(), buffer: bufferDeLevantamento("set/26", "agosto/2026") }]));
  assert.equal(nota.validos.length, 0);
  assert.match(nota.invalidos[0].motivo, /nota de estimativa/);
});

test("normalize: publicação às 21h de Brasília do último dia do mês ainda é daquele mês (fuso)", () => {
  const item = { ...levantamentoBase(), publicadoEm: new Date("2026-10-01T00:30:00Z") }; // 21h30 de 30/09 em Brasília
  const { validos } = collector.normalize(collector.parse([item]));
  assert.ok(validos.length > 0, "set/26 em Brasília, não out/26");
});

test("normalize: sem data de publicação o levantamento é inválido (não grava vintage sem data real)", () => {
  const { validos, invalidos } = collector.normalize(collector.parse([{ ...levantamentoBase(), publicadoEm: null }]));

  assert.equal(validos.length, 0);
  assert.match(invalidos[0].motivo, /Publicado em/);
});

test("parse: planilha ilegível vira item inválido e não derruba os demais levantamentos", () => {
  const ruim = { ...levantamentoBase(), numero: 11, buffer: Buffer.from("isto não é um xlsx") };
  const { validos, invalidos } = collector.normalize(collector.parse([ruim, levantamentoBase()]));

  assert.ok(validos.length > 0, "o levantamento bom entra");
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].item.levantamento, /11º levantamento/);
  assert.match(invalidos[0].motivo, /Falha ao ler a planilha/);
});

test("normalize: vários levantamentos saem em ordem cronológica de publicação", () => {
  const agosto = { ...levantamentoBase(), numero: 11, publicadoEm: new Date("2026-08-13T12:00:00Z"), buffer: bufferDeLevantamento("ago/26", "agosto/2026") };
  const { validos } = collector.normalize(collector.parse([levantamentoBase(), agosto]));

  const instantes = validos.map((v) => v.published_at.getTime());
  assert.deepEqual(instantes, [...instantes].sort((a, b) => a - b));
  assert.equal(new Set(instantes).size, 2);
});

// --- persist ---

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

const validosDeTeste = () => collector.normalize(collector.parse([levantamentoBase()])).validos;

test("persist diário: com a fonte vazia se recusa a gravar e manda rodar o backfill (ordem de carga)", async () => {
  const escritas = [];
  const resultado = await collector.persist(validosDeTeste(), { execucaoId: "x" }, depsFake({ escritas }));

  assert.equal(escritas.length, 0);
  assert.equal(resultado.criados, 0);
  assert.match(resultado.falhas[0].motivo, /npm run backfill:conab-milho/);
});

test("persistirBackfill grava mesmo com a fonte vazia (é o que faz a carga histórica)", async () => {
  const escritas = [];
  const validos = validosDeTeste();
  const resultado = await collector.persistirBackfill(validos, { execucaoId: "x" }, depsFake({ escritas }));

  assert.equal(escritas.length, validos.length);
  assert.equal(resultado.falhas.length, 0);
});

test("persist diário: o levantamento já ingerido é descartado (não vira 'conflito'); um novo entra", async () => {
  const validos = validosDeTeste();
  const publicadoEm = validos[0].published_at;
  const carregadas = [...new Set(validos.map((v) => v.series_code))].map((series_code) => ({ series_code, published_at: publicadoEm }));

  const escritas = [];
  const jaGravado = await collector.persist(validos, { execucaoId: "x" }, depsFake({ carregadas, escritas }));
  assert.equal(escritas.length, 0);
  assert.equal(jaGravado.ignorados, validos.length);

  const proximo = validos.map((v) => ({ ...v, published_at: new Date("2026-10-14T12:00:00Z") }));
  await collector.persist(proximo, { execucaoId: "x" }, depsFake({ carregadas, escritas }));
  assert.equal(escritas.length, proximo.length, "levantamento com outro instante de publicação entra");
});
