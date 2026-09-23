"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const zip = require("../../shared/utils/zip");
const collector = require("./b3-milho-esalq.collector");

afterEach(() => mock.restoreAll());

// Linhas reais do Indic.txt de 2026-09-22 (109 colunas; o arquivo traz D-1 e D). Os valores batem com a
// página do indicador na CEPEA (69,62 e 69,74).
const INDIC = [
  "0000010010120260921BBIROL                     +00000000000000004435516102                                    ",
  "0000630010120260921IAMIL-AV-R$                +00000000000000000000696202                                    ",
  "0000640010120260922IAMIL-AV-R$                +00000000000000000000697402                                    ",
  "0000650010120260921IAMIL-AV-US$               +00000000000000000000136302                                    ",
  "0000660010120260922IAMIL-AV-US$               +00000000000000000000136502                                    ",
  "0000680010120260922IAMIL-MD-R$                +00000000000000000000695502                                    ",
  "0000720010120260922IAMIL-PZ-VPZ               +00000000000000000000222802                                    ",
  "0000730010120260922IAETH-AV-R$/M3             +00000000000000000026960002                                    "
].join("\r\n");

test("lerLinhaIndic: lê pelas posições do layout oficial", () => {
  assert.deepEqual(collector.lerLinhaIndic(INDIC.split("\r\n")[2]), { data: "2026-09-22", codigo: "IAMIL-AV-R$", valor: 69.74 });
  assert.deepEqual(collector.lerLinhaIndic(INDIC.split("\r\n")[0]), { data: "2026-09-21", codigo: "BBIROL", valor: 443551.61 });
  assert.equal(collector.lerLinhaIndic(""), null);
  assert.equal(collector.lerLinhaIndic("0000010010220260921IAMIL-AV-R$                +00000000000000000000696202"), null); // tipo != 01
});

test("extrairIndicadorMilho: só o valor à vista (R$ e US$) do pregão pedido, não o de D-1", () => {
  assert.deepEqual(collector.extrairIndicadorMilho(INDIC, "2026-09-22"), { situacao: "ok", valores: { AVISTA_BRL: 69.74, AVISTA_USD: 13.65 } });
  assert.deepEqual(collector.extrairIndicadorMilho(INDIC, "2026-09-21"), { situacao: "ok", valores: { AVISTA_BRL: 69.62, AVISTA_USD: 13.63 } });
});

test("extrairIndicadorMilho: arquivo sem o milho na data = sem_indicador; layout irreconhecível = erro", () => {
  assert.deepEqual(collector.extrairIndicadorMilho(INDIC, "2026-09-23"), { situacao: "sem_indicador" });
  assert.equal(collector.extrairIndicadorMilho("<html>manutenção</html>", "2026-09-22").situacao, "erro");
});

test("extrairTextoIndic: zip dentro de zip; zip vazio (dia sem pregão) = null; zip sem Indic.txt = erro", () => {
  mock.method(zip, "lerZip", (buf) => {
    const s = buf.toString();
    if (s === "externo") return [{ nome: "ID260922.ex_", conteudo: Buffer.from("interno") }];
    if (s === "interno") return [{ nome: "Indic.txt", conteudo: Buffer.from(INDIC, "latin1") }];
    if (s === "outro") return [{ nome: "Outro.txt", conteudo: Buffer.from("x") }];
    return [];
  });
  assert.equal(collector.extrairTextoIndic(Buffer.from("externo")), INDIC);
  assert.equal(collector.extrairTextoIndic(Buffer.from("vazio")), null);
  assert.throws(() => collector.extrairTextoIndic(Buffer.from("outro")), /não tem o Indic\.txt/);
});

const resposta = (status, texto = "") => ({
  ok: status >= 200 && status < 300,
  status,
  arrayBuffer: async () => {
    const buf = Buffer.from(texto, "latin1");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
});

test("downloadIntervalo: um arquivo por dia útil, nunca antes de 2018-06-08; pede ID<aammdd>.ex_", async () => {
  const urls = [];
  mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    return resposta(200, url.includes("ID260922") ? "com-dado" : "vazio");
  });
  mock.method(zip, "lerZip", (buf) => (buf.toString() === "com-dado" ? [{ nome: "Indic.txt", conteudo: Buffer.from(INDIC, "latin1") }] : []));

  const dias = await collector.downloadIntervalo({ dataInicial: "2026-09-19", dataFinal: "2026-09-23" });
  assert.deepEqual(dias.map((d) => [d.data, d.situacao]), [["2026-09-21", "sem_arquivo"], ["2026-09-22", "ok"], ["2026-09-23", "sem_arquivo"]]);
  assert.equal(urls[1], "https://www.b3.com.br/pesquisapregao/download?filelist=ID260922.ex_,");

  urls.length = 0;
  await collector.downloadIntervalo({ dataInicial: "2018-06-01", dataFinal: "2018-06-08" });
  assert.deepEqual(urls, ["https://www.b3.com.br/pesquisapregao/download?filelist=ID180608.ex_,"]);
});

test("downloadIntervalo: HTTP 4xx e zip corrompido viram erro daquele dia, sem derrubar o lote", async () => {
  mock.method(globalThis, "fetch", async (url) => resposta(url.includes("ID260921") ? 404 : 200, "lixo"));
  mock.method(zip, "lerZip", () => {
    throw new Error("Arquivo não é um ZIP");
  });
  const dias = await collector.downloadIntervalo({ dataInicial: "2026-09-21", dataFinal: "2026-09-22" });
  assert.deepEqual(dias.map((d) => d.situacao), ["erro", "erro"]);
  assert.match(dias[0].motivo, /HTTP 404/);
  assert.match(dias[1].motivo, /não é um ZIP/);
});

const ok = (data, valores = { AVISTA_BRL: 69.74, AVISTA_USD: 13.65 }) => ({ data, situacao: "ok", url: "u", valores });

test("parse: dia sem arquivo ou sem o milho é ignorado; erro vira item com problema", () => {
  const itens = collector.parse([
    ok("2026-09-18"),
    { data: "2026-09-19", situacao: "sem_arquivo" },
    { data: "2026-09-21", situacao: "sem_indicador" },
    { data: "2026-09-22", situacao: "erro", motivo: "HTTP 404" }
  ]);
  assert.deepEqual(itens.map((i) => [i.data, Boolean(i.problema)]), [["2026-09-18", false], ["2026-09-22", true]]);
});

test("parse: janela de 4+ dias sem nenhum valor do milho = fonte mudou (falha alto)", () => {
  const semArquivo = ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"].map((data) => ({ data, situacao: "sem_arquivo" }));
  assert.throws(() => collector.parse(semArquivo), /não devolveu o arquivo Indic/);
  assert.throws(() => collector.parse(semArquivo.map((d) => ({ ...d, situacao: "sem_indicador" }))), /código IAMIL mudou/);
  assert.throws(() => collector.parse({}), /formato inesperado/);
  // Poucos dias (ex.: feriado prolongado numa janela curta) não é falha.
  assert.deepEqual(collector.parse(semArquivo.slice(0, 3)), []);
});

test("normalize: uma observação por campo, published_at estimado no fim do dia em Brasília", () => {
  const { validos, invalidos } = collector.normalize(collector.parse([ok("2026-09-22")]));
  assert.deepEqual(invalidos, []);
  assert.deepEqual(validos.map((v) => [v.series_code, v.value, v.unit]), [
    ["B3.MILHO_ESALQ.AVISTA_BRL", 69.74, "BRL/saca"],
    ["B3.MILHO_ESALQ.AVISTA_USD", 13.65, "USD/saca"]
  ]);
  const [v] = validos;
  assert.equal(v.observed_at, "2026-09-22");
  assert.equal(v.source_code, "B3");
  assert.equal(v.published_at.toISOString(), "2026-09-23T02:59:59.000Z");
  assert.equal(v.published_at_is_estimated, true);
  assert.equal(v.metadata.indicador, "Indicador do Milho CEPEA/ESALQ");
  assert.equal(v.metadata.codigoFonte, "IAMIL-AV-R$");
});

test("normalize: valor não positivo é inválido; campo ausente no dia não gera observação", () => {
  const { validos, invalidos } = collector.normalize([
    { data: "2026-09-22", url: "u", valores: { AVISTA_BRL: 0 } },
    { data: "2026-09-21", url: "u", valores: { AVISTA_BRL: 69.62 } },
    { data: "2026-09-18", problema: "HTTP 404" }
  ]);
  assert.deepEqual(validos.map((v) => [v.series_code, v.observed_at]), [["B3.MILHO_ESALQ.AVISTA_BRL", "2026-09-21"]]);
  assert.equal(invalidos.length, 2);
  assert.match(invalidos[0].motivo, /valor inválido/);
  assert.match(invalidos[1].motivo, /Pregão 2026-09-18: HTTP 404/);
});
