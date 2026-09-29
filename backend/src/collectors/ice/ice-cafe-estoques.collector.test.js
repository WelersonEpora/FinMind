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
const coletor = require("./ice-cafe-estoques.collector");
const { UpstreamServiceError } = require("../../shared/errors");

function xls(asOf, linhas, total) {
  const aoa = [["ICE Futures U.S."], ['COFFEE "C" CERTIFIED WAREHOUSE STOCK REPORT'], [asOf], [null, "ANT", "Total"], ...linhas, ["Total in Bags", total, total]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "biff8" });
}

const resposta = (status, corpo = Buffer.alloc(0), headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  arrayBuffer: async () => corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength)
});

// Repositório fake: só a série do total, com os dias já gravados.
const repoCom = (...dias) => ({ buscarUltimasVersoes: async () => new Map(dias.map((d) => [d, { value: 1 }])) });

function fetchPorDia(respostas, pedidos = []) {
  return async (url) => {
    const data = /(\d{8})\.xls$/.exec(url)[1];
    pedidos.push(data);
    const fila = respostas[data];
    return Array.isArray(fila) ? fila.shift() : fila ?? resposta(404);
  };
}

test("diasUteis pula sábado e domingo; ultimoDiaDisponivel só inclui hoje depois das 18h UTC", () => {
  assert.deepEqual(coletor.diasUteis("2026-09-25", "2026-09-29"), ["2026-09-25", "2026-09-28", "2026-09-29"]);
  assert.equal(coletor.ultimoDiaDisponivel(new Date("2026-09-28T04:00:00Z")), "2026-09-27");
  assert.equal(coletor.ultimoDiaDisponivel(new Date("2026-09-28T18:30:00Z")), "2026-09-28");
  assert.equal(coletor.urlDoDia("2026-09-25"), "https://www.ice.com/publicdocs/futures_us_reports/coffee/coffee_cert_stock_20260925.xls");
});

test("coleta diária: só os dias úteis que faltam no banco, no máximo 3, um por vez com pausa; 404 = sem pregão", async () => {
  const pedidos = [];
  const pausas = [];
  const bruto = await coletor.download({
    agora: new Date("2026-09-29T04:00:00Z"), // último dia disponível: 28/09 (segunda)
    fetchFn: fetchPorDia({ 20260923: resposta(404), 20260924: resposta(200, xls("As of: Sep 24, 2026  1:00:00PM", [], 0)) }, pedidos),
    esperar: async (ms) => pausas.push(ms),
    deps: { observationRepository: repoCom("2026-09-21", "2026-09-22") }
  });
  assert.deepEqual(pedidos, ["20260923", "20260924", "20260925"], "janela de 7 dias, sem os já gravados, no máximo 3");
  assert.deepEqual(bruto.semArquivo, ["2026-09-23", "2026-09-25"]);
  assert.deepEqual(bruto.arquivos.map((a) => a.data), ["2026-09-24"]);
  assert.deepEqual(pausas, [coletor.PAUSA_MS, coletor.PAUSA_MS]);
});

test("429: espera o Retry-After e tenta de novo; se persistir, para e o resto vira aviso (sem falhar a execução)", async () => {
  const esperas = [];
  const ok = resposta(200, xls("As of: Sep 24, 2026  1:00:00PM", [["Brazil", 5, 5]], 5), { "last-modified": "Thu, 24 Sep 2026 17:05:00 GMT" });
  const bruto = await coletor.downloadIntervalo({
    dataInicial: "2026-09-24",
    dataFinal: "2026-09-25",
    fetchFn: fetchPorDia({ 20260924: [resposta(429, undefined, { "retry-after": "30" }), ok], 20260925: resposta(429) }),
    esperar: async (ms) => esperas.push(ms),
    deps: { observationRepository: repoCom() }
  });
  assert.deepEqual(bruto.arquivos.map((a) => a.data), ["2026-09-24"]);
  assert.deepEqual(bruto.naoBaixados, ["2026-09-25"]);
  assert.deepEqual(esperas, [30_000, coletor.PAUSA_MS, 60_000, 120_000, 300_000, 600_000]);

  const { validos, avisos } = coletor.normalize(coletor.parse(bruto));
  assert.equal(validos.length, 2);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].motivo, /429/);
});

test("erro HTTP que não é 404 nem 429 falha a coleta", async () => {
  await assert.rejects(
    coletor.downloadIntervalo({ dataInicial: "2026-09-24", dataFinal: "2026-09-24", fetchFn: async () => resposta(503), esperar: async () => {}, deps: { observationRepository: repoCom() } }),
    UpstreamServiceError
  );
});

test("normalize: origens e total do dia; published_at = Last-Modified (real) ou, sem ele, o As of de Nova York (estimado)", () => {
  const arquivo = (data, asOf, ultimaModificacao) => ({ data, ultimaModificacao, buffer: xls(asOf, [["Brazil", 52791, 52791], ["Honduras", 1000, 1000]], 53791) });
  const { validos, invalidos } = coletor.normalize(
    coletor.parse({
      arquivos: [
        arquivo("2026-09-25", "As of: Sep 25, 2026  1:18:21PM", "Fri, 25 Sep 2026 17:22:12 GMT"),
        arquivo("2016-01-04", "As of: Jan 4, 2016  1:13:50PM", null),
        arquivo("2026-09-24", "As of: Sep 23, 2026  1:00:00PM", null)
      ]
    })
  );
  assert.equal(invalidos.length, 1, "arquivo do dia 24 com As of do dia 23");
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.published_at.toISOString(), v.published_at_is_estimated]),
    [
      ["ICE.CAFE_C.ESTOQUE.BRAZIL.CERTIFICADO", "2026-09-25", 52791, "2026-09-25T17:22:12.000Z", false],
      ["ICE.CAFE_C.ESTOQUE.HONDURAS.CERTIFICADO", "2026-09-25", 1000, "2026-09-25T17:22:12.000Z", false],
      ["ICE.CAFE_C.ESTOQUE.TOTAL.CERTIFICADO", "2026-09-25", 53791, "2026-09-25T17:22:12.000Z", false],
      ["ICE.CAFE_C.ESTOQUE.BRAZIL.CERTIFICADO", "2016-01-04", 52791, "2016-01-04T18:13:50.000Z", true],
      ["ICE.CAFE_C.ESTOQUE.HONDURAS.CERTIFICADO", "2016-01-04", 1000, "2016-01-04T18:13:50.000Z", true],
      ["ICE.CAFE_C.ESTOQUE.TOTAL.CERTIFICADO", "2016-01-04", 53791, "2016-01-04T18:13:50.000Z", true]
    ]
  );
  assert.ok(validos.every((v) => v.unit === "sacas" && v.source_code === "ICE_COFFEE_CERT"));
});

test("normalize: correção republicada fica com a data da correção; sem horário, janela e estimativa pelo dia de Nova York", () => {
  const arquivo = (data, asOf, ultimaModificacao) => ({ data, ultimaModificacao, buffer: xls(asOf, [["Brazil", 7, 7]], 7) });
  const { validos, invalidos } = coletor.normalize(
    coletor.parse({
      arquivos: [
        arquivo("2018-06-06", "As of: Jun 6, 2018  2:10:33PM- Total Correction", "Fri, 08 Jun 2018 11:40:23 GMT"),
        arquivo("2026-06-11", "As of: Jun 11, 2026 ", "Thu, 11 Jun 2026 18:45:43 GMT"),
        arquivo("2026-06-12", "As of: Jun 12, 2026 ", null)
      ]
    })
  );
  assert.equal(invalidos.length, 0);
  const total = (data) => validos.find((v) => v.observed_at === data && v.series_code.endsWith("TOTAL.CERTIFICADO"));
  assert.equal(total("2018-06-06").published_at.toISOString(), "2018-06-08T11:40:23.000Z");
  assert.equal(total("2018-06-06").metadata.observacaoDaFonte, "Total Correction");
  assert.equal(total("2026-06-11").published_at.toISOString(), "2026-06-11T18:45:43.000Z");
  assert.equal(total("2026-06-11").published_at_is_estimated, false);
  assert.equal(total("2026-06-12").published_at.toISOString(), "2026-06-13T03:59:59.000Z", "23:59:59 de Nova York (EDT)");
  assert.equal(total("2026-06-12").published_at_is_estimated, true);
});

test("parse: arquivo com layout inesperado vira inválido daquele dia, sem derrubar os outros", () => {
  const entradas = coletor.parse({ arquivos: [{ data: "2026-09-25", buffer: Buffer.from("<html>bloqueado</html>") }] });
  const { validos, invalidos } = coletor.normalize(entradas);
  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 1);
  assert.equal(invalidos[0].item.data, "2026-09-25");
});
