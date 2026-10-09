"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./bcb-balanco-pagamentos.collector");

// Pontos reais de 2026-10-09 (SGS 22707 e 22701).
const RESPOSTAS = {
  22707: [{ data: "01/07/2026", valor: "5650.2" }, { data: "01/08/2026", valor: "6621.7" }],
  22701: [{ data: "01/12/2025", valor: "-1000.0" }, { data: "01/08/2026", valor: "-5054.7" }]
};

const baixarFn = async (url) => JSON.stringify(RESPOSTAS[/sgs\.(\d+)\//.exec(url)[1]]);

test("as duas séries, a série inteira de cada uma, em US$ milhões, no 1º dia do mês", async () => {
  const urls = [];
  const raw = await collector.download({ baixarFn: async (url) => { urls.push(url); return baixarFn(url); } });
  assert.deepEqual(urls, [
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.22707/dados?formato=json",
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.22701/dados?formato=json"
  ]);
  const { validos, invalidos } = collector.normalize(collector.parse(raw));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value]),
    [
      ["BCB_SGS.BALANCA_COMERCIAL_BP", "2026-07-01", 5650.2],
      ["BCB_SGS.BALANCA_COMERCIAL_BP", "2026-08-01", 6621.7],
      ["BCB_SGS.TRANSACOES_CORRENTES", "2025-12-01", -1000],
      ["BCB_SGS.TRANSACOES_CORRENTES", "2026-08-01", -5054.7]
    ]
  );
  assert.equal(validos[0].unit, "US$ milhões");
});

test("publicação estimada no último dia do mês seguinte (agosto -> 30/09; dezembro -> 31/01 do ano seguinte)", async () => {
  const { validos } = collector.normalize(collector.parse(await collector.download({ baixarFn })));
  const pub = (serie, data) => validos.find((v) => v.series_code === serie && v.observed_at === data).published_at.toISOString();
  assert.equal(pub("BCB_SGS.BALANCA_COMERCIAL_BP", "2026-08-01"), "2026-09-30T23:59:59.000Z");
  assert.equal(pub("BCB_SGS.TRANSACOES_CORRENTES", "2025-12-01"), "2026-01-31T23:59:59.000Z");
  assert.equal(collector.fimDoMesSeguinte("2024-01-01"), "2024-02-29", "ano bissexto");
  assert.ok(validos.every((v) => v.published_at_is_estimated));
});

test("resposta que não é JSON (o SGS às vezes devolve HTML) é falha da fonte; ponto ilegível vira inválido", async () => {
  await assert.rejects(collector.download({ baixarFn: async () => "<html>erro</html>" }), /não é JSON/);
  const { invalidos } = collector.normalize([
    { sgs: 22707, ponto: { data: "15/08/2026", valor: "1" } },
    { sgs: 22707, ponto: { data: "01/08/2026", valor: "" } }
  ]);
  assert.equal(invalidos.length, 2);
});
