"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./ico-cafe.collector");
const { resolverIntervalo } = require("../../../scripts/backfill-ico-cafe");
const { UpstreamServiceError } = require("../../shared/errors");

const resposta = (status, corpo = Buffer.alloc(0), headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  arrayBuffer: async () => corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength)
});

test("URL do relatório: a pasta do ano-café do mês e, como 2ª tentativa, a seguinte (set/2024 está em cy2024-25)", () => {
  assert.deepEqual(coletor.urlsDoMes("2026-08"), [
    "https://www.ico.org/documents/cy2025-26/cmr-0826-e.pdf",
    "https://www.ico.org/documents/cy2026-27/cmr-0826-e.pdf"
  ]);
  assert.equal(coletor.urlsDoMes("2025-10")[0], "https://www.ico.org/documents/cy2025-26/cmr-1025-e.pdf");
  assert.equal(coletor.urlsDoMes("2024-09")[1], "https://www.ico.org/documents/cy2024-25/cmr-0924-e.pdf");
});

test("published_at: Last-Modified até 60 dias depois do fim do mês é real; o das migrações do site vira estimativa (+45 dias)", () => {
  const real = coletor.publicacao("2026-08", "Thu, 10 Sep 2026 15:04:08 GMT");
  assert.equal(real.published_at.toISOString(), "2026-09-10T15:04:08.000Z");
  assert.equal(real.published_at_is_estimated, false);
  const migracao = coletor.publicacao("2019-03", "Mon, 20 Feb 2023 13:13:20 GMT");
  assert.equal(migracao.published_at.toISOString(), "2019-05-15T23:59:59.000Z");
  assert.equal(migracao.published_at_is_estimated, true);
  // A data estimada é a da EDIÇÃO: a correção que o relatório seguinte traz fica com a data dele (point-in-time).
  assert.equal(migracao.published_at_basis, "edition_lag_rule");
  assert.equal(coletor.publicacao("2026-08", null).published_at_is_estimated, true);
  assert.equal(coletor.publicacao("2026-08", "Mon, 31 Aug 2026 10:00:00 GMT").published_at_is_estimated, true, "antes do fim do mês");
});

test("coleta diária: só os 2 meses anteriores que faltam no banco; 404 nas duas pastas = ainda não publicado", async () => {
  const pedidos = [];
  const bruto = await coletor.download({
    agora: new Date("2026-10-04T12:00:00Z"),
    fetchFn: async (url) => (pedidos.push(url), resposta(404)),
    esperar: async () => {},
    deps: { observationRepository: { buscarUltimasVersoes: async () => new Map([["2026-08-01", { value: 1 }]]) } }
  });
  assert.deepEqual(pedidos, ["https://www.ico.org/documents/cy2025-26/cmr-0926-e.pdf", "https://www.ico.org/documents/cy2026-27/cmr-0926-e.pdf"]);
  assert.deepEqual(bruto, { relatorios: [], naoPublicados: ["2026-09"] });
});

test("arquivo que não é PDF ou erro HTTP que não é 404 falham a coleta", async () => {
  const opcoes = { mesInicial: "2026-08", mesFinal: "2026-08", esperar: async () => {} };
  await assert.rejects(coletor.downloadIntervalo({ ...opcoes, fetchFn: async () => resposta(200, Buffer.from("<html>erro</html>")) }), /não parece um PDF/);
  await assert.rejects(coletor.downloadIntervalo({ ...opcoes, fetchFn: async () => resposta(503) }), UpstreamServiceError);
});

const relatorio = (mes, ultimaModificacao, precos, estoques = [], problemas = []) => ({ mes, url: `u/${mes}`, ultimaModificacao, precos, estoques, problemas });
const valores = (base) => ({ I_CIP: base, COLOMBIAN_MILDS: 2, OTHER_MILDS: 3, BRAZILIAN_NATURALS: 4, ROBUSTAS: 5, NOVA_YORK: 6, LONDRES: 7 });

test("normalize: 7 preços e 2 estoques por mês, em ordem de publicação; tabela ilegível vira inválido", () => {
  const { validos, invalidos } = coletor.normalize(
    coletor.parse({
      relatorios: [
        relatorio("2026-08", "Thu, 10 Sep 2026 15:04:08 GMT", [{ mes: "2026-07", valores: valores(287.26) }, { mes: "2026-08", valores: valores(287.29) }], [], ["tabela 5: x"]),
        relatorio("2026-07", "Mon, 10 Aug 2026 10:00:00 GMT", [{ mes: "2026-07", valores: valores(287.26) }], [{ mes: "2026-07", valores: { NOVA_YORK: 0.29, LONDRES: 0.69 } }]),
        { mes: "2026-06", erro: "Falha ao ler o PDF: x" }
      ]
    })
  );
  assert.deepEqual(invalidos.map((i) => i.motivo), ["relatório de 2026-08: tabela 5: x", "Falha ao ler o PDF: x"]);
  assert.equal(validos.length, 7 * 3 + 2);
  assert.equal(validos[0].published_at.toISOString(), "2026-08-10T10:00:00.000Z", "o relatório de julho primeiro");
  const icip = validos.filter((v) => v.series_code === "ICO.CAFE.PRECO_I_CIP");
  assert.deepEqual(icip.map((v) => [v.observed_at, v.value]), [["2026-07-01", 287.26], ["2026-07-01", 287.26], ["2026-08-01", 287.29]]);
  const londres = validos.find((v) => v.series_code === "ICO.CAFE.ESTOQUE_LONDRES");
  assert.equal(londres.value, 0.69);
  assert.equal(londres.unit, "milhões de sacas");
  assert.ok(validos.every((v) => v.source_code === "ICO_CMR"));
});

test("backfill: do 1º relatório (2012-10) ao mês anterior", () => {
  assert.deepEqual(resolverIntervalo({}, new Date("2026-10-04T12:00:00Z")), { mesInicial: "2012-10", mesFinal: "2026-09" });
  assert.deepEqual(resolverIntervalo({ desde: "2010-01", ate: "2013-01" }), { mesInicial: "2012-10", mesFinal: "2013-01" });
  assert.throws(() => resolverIntervalo({ desde: "2020-13" }), /Mês inválido/);
  assert.throws(() => resolverIntervalo({ desde: "2020-05", ate: "2020-01" }), /Intervalo vazio/);
});
