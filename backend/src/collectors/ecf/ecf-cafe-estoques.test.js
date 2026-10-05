"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerRelatorio } = require("./ecf-cafe-estoques.parser");
const coletor = require("./ecf-cafe-estoques.collector");

// Itens no layout real (arquivo de ago/2026, página 3): o cabeçalho tem cada pedaço da data num item ("31" "-" "Jan"
// "-" "2" "6"), e as colunas de maio e junho ficam 1 ponto acima do rótulo.
const X_MES = [197.3, 260.7, 323.7, 391.2, 453.1, 522.8];
const X_NUMERO = [191.3, 256.5, 321.7, 387, 452.1, 517.3];

function bloco(y, datas, linhas, { deslocarUltimas = 1.1 } = {}) {
  const itens = [{ str: "Type of coffee", x: 75.7, y }];
  datas.forEach((data, i) => {
    const [dia, mes, ano] = data.split("-");
    itens.push({ str: dia, x: X_MES[i] - 14, y }, { str: "-", x: X_MES[i] - 3, y }, { str: mes, x: X_MES[i], y }, { str: "-", x: X_MES[i] + 16, y });
    itens.push({ str: ano[0], x: X_MES[i] + 19, y }, { str: ano[1], x: X_MES[i] + 25, y });
  });
  linhas.forEach(([rotulo, ...valores], j) => {
    const yl = y - 15 - j * 15.2;
    itens.push({ str: rotulo, x: 75.7, y: yl });
    valores.forEach((v, i) => itens.push({ str: v, x: X_NUMERO[i], y: i >= 4 ? yl + deslocarUltimas : yl }));
  });
  return itens;
}

const DATAS_1 = ["31-Jan-26", "28-Feb-26", "31-Mar-26", "30-Apr-26", "31-May-26", "30-Jun-26"];
const LINHAS_1 = [
  ["Robusta", "162,450", "150,126", "139,093", "150,565", "162,990", "178,584"],
  ["Natural Arabica", "138,941", "127,113", "124,663", "122,046", "123,462", "117,421"],
  ["Washed Arabica", "139,933", "130,913", "132,721", "136,406", "142,430", "146,014"],
  ["Total Europe", "441,323", "408,152", "396,476", "409,018", "428,881", "442,019"]
];

test("lê o bloco por tipo: 6 meses, números de 2 colunas 1 ponto acima do rótulo, total fecha com a soma (±3 t)", () => {
  const { meses, avisos, problemas } = lerRelatorio([{ itens: bloco(462.3, DATAS_1, LINHAS_1) }]);
  assert.equal(meses.length, 6);
  assert.deepEqual(meses[0], { mes: "2026-01", valores: { ROBUSTA: 162450, NATURAL_ARABICA: 138941, WASHED_ARABICA: 139933, TOTAL: 441323 } });
  assert.deepEqual(meses[5].valores.ROBUSTA, 178584);
  assert.deepEqual([avisos, problemas], [[], []]);
});

test("meses ainda sem dado ficam de fora; bloco de jul-dez vazio não é problema", () => {
  const vazio = bloco(372.4, ["31-Jul-26", "31-Aug-26", "30-Sep-26", "31-Oct-26", "30-Nov-26", "31-Dec-26"], [["Robusta"], ["Natural Arabica"], ["Washed Arabica"], ["Total Europe"]]);
  const parcial = LINHAS_1.map((l) => l.slice(0, 3));
  const { meses, problemas } = lerRelatorio([{ itens: [...bloco(462.3, DATAS_1, parcial), ...vazio] }]);
  assert.deepEqual(meses.map((m) => m.mes), ["2026-01", "2026-02"]);
  assert.deepEqual(problemas, []);
});

test("defeitos reais: ano digitado errado (\"31-May-24\" em 2025), número quebrado (\"193\" \",\" \"274\") e milhar com ponto", () => {
  const datas = ["31-Jan-25", "28-Feb-25", "31-Mar-25", "30-Apr-25", "31-May-24", "30-Jun-25"];
  const linhas = [
    ["Robusta", "173.748", "152,094", "140,613", "156,060", "184,870", "193"],
    ["Natural Arabica", "152,787", "151,982", "142,717", "134,596", "137,056", "140,810"],
    ["Washed Arabica", "156,882", "139,489", "126,909", "133,748", "126,167", "140,882"],
    ["Total Europe", "483,417", "443,565", "410,239", "424,403", "448,094", "474,966"]
  ];
  const itens = bloco(462.3, datas, linhas);
  itens.push({ str: ",", x: X_NUMERO[5] + 17.4, y: 462.3 - 15 + 1.1 }, { str: "274", x: X_NUMERO[5] + 19.9, y: 462.3 - 15 + 1.1 });
  const { meses, avisos, problemas } = lerRelatorio([{ itens }]);
  assert.deepEqual(meses.map((m) => m.mes), ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"]);
  assert.equal(meses[0].valores.ROBUSTA, 173748);
  assert.equal(meses[5].valores.ROBUSTA, 193274);
  assert.match(avisos[0], /ano digitado errado na fonte \("31-may-24"\): lido como 2025/);
  assert.deepEqual(problemas, []);
});

test("total que não fecha deixa o mês de fora, com o motivo; arquivo sem tabela por tipo (até 2019) é erro", () => {
  const linhas = LINHAS_1.map((l) => (l[0] === "Total Europe" ? [l[0], "999,999", ...l.slice(2)] : l));
  const { meses, problemas } = lerRelatorio([{ itens: bloco(462.3, DATAS_1, linhas) }]);
  assert.equal(meses.length, 5);
  assert.match(problemas[0], /2026-01: a soma dos tipos \(441324\) não fecha com o total \(999999\)/);
  assert.throws(() => lerRelatorio([{ itens: [{ str: "Port", x: 75, y: 400 }] }]), /nenhuma tabela/);
});

test("página da ECF: um PDF por ano e, do ano corrente, as versões anteriores; em ordem de upload", () => {
  const html = [
    '<a href="https://www.ecf-coffee.org/wp-content/uploads/2026/08/2026-Stocks-European-Ports.pdf">',
    '<a href="https://www.ecf-coffee.org/wp-content/uploads/2026/06/2026-Stocks-European-Ports.pdf">',
    '<a href="https://www.ecf-coffee.org/wp-content/uploads/2021/11/2021-Stocks-European-Ports_updated.pdf">',
    '<a href="https://www.ecf-coffee.org/wp-content/uploads/2026/08/2026-Stocks-European-Ports.pdf">'
  ].join("\n");
  assert.deepEqual(
    coletor.extrairEdicoes(html).map((e) => [e.ano, e.upload]),
    [
      [2021, "2021-11"],
      [2026, "2026-06"],
      [2026, "2026-08"]
    ]
  );
});

test("published_at: Last-Modified real; sem ele (ou antes da pasta de upload), o fim do mês da pasta, estimado", () => {
  const real = coletor.publicacao("2026-08", "Mon, 10 Aug 2026 09:00:00 GMT");
  assert.deepEqual([real.published_at.toISOString(), real.published_at_is_estimated], ["2026-08-10T09:00:00.000Z", false]);
  const estimado = coletor.publicacao("2026-08", null);
  assert.deepEqual([estimado.published_at.toISOString(), estimado.published_at_is_estimated], ["2026-08-31T23:59:59.000Z", true]);
  assert.equal(coletor.publicacao("2026-08", "Mon, 10 Jul 2026 09:00:00 GMT").published_at_is_estimated, true);
});

test("normalize: 4 séries por mês em toneladas, em ordem de publicação; avisos e problemas da leitura", () => {
  const edicao = (upload, lm, meses, extra = {}) => ({ url: `https://x/${upload}/2026-Stocks-European-Ports.pdf`, ano: 2026, upload, ultimaModificacao: lm, meses, avisos: [], problemas: [], ...extra });
  const abril = (robusta) => [{ mes: "2026-04", valores: { ROBUSTA: robusta, NATURAL_ARABICA: 1, WASHED_ARABICA: 2, TOTAL: robusta + 3 } }];
  const { validos, invalidos, avisos } = coletor.normalize(
    coletor.parse([
      edicao("2026-08", "Mon, 10 Aug 2026 09:00:00 GMT", abril(150565), { avisos: ["ano digitado errado"] }),
      edicao("2026-06", "Mon, 01 Jun 2026 09:00:00 GMT", abril(150769), { problemas: ["2026-03: não fecha"] }),
      { url: "https://x/2025-Stocks.pdf", upload: "2026-01", erro: "Falha ao ler o PDF: x" }
    ])
  );
  const robusta = validos.filter((v) => v.series_code === "ECF.CAFE.ESTOQUE_ROBUSTA");
  assert.deepEqual(robusta.map((v) => [v.observed_at, v.value, v.published_at.toISOString()]), [
    ["2026-04-01", 150769, "2026-06-01T09:00:00.000Z"],
    ["2026-04-01", 150565, "2026-08-10T09:00:00.000Z"]
  ]);
  assert.equal(validos.length, 8);
  assert.ok(validos.every((v) => v.unit === "toneladas" && v.source_code === "ECF_STOCKS"));
  assert.deepEqual(invalidos.map((i) => i.motivo), ["2026-03: não fecha", "Falha ao ler o PDF: x"]);
  assert.deepEqual(avisos.map((a) => a.motivo), ["ano digitado errado"]);
});
