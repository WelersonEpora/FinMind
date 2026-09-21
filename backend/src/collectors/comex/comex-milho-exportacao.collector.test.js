"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./comex-milho-exportacao.collector");

// Fixture real (POST /general, monthDetail: true, NCM 10059010, 2026-09-21), reduzida.
const LISTA_2026 = [
  { year: "2026", monthNumber: "08", metricFOB: "1002656682", metricKG: "4653100189" },
  { year: "2026", monthNumber: "01", metricFOB: "925674649", metricKG: "4245185990" },
  { year: "2026", monthNumber: "05", metricFOB: "61044053", metricKG: "249314295" }
];

function resposta(status, corpo) {
  return { status, ok: status >= 200 && status < 300, json: async () => corpo };
}
const ok = (lista) => resposta(200, { data: { list: lista }, success: true, message: null });

test("normalize gera duas séries por mês (kg e US$), em observed_at = dia 1º do mês", () => {
  const { validos, invalidos } = coletor.normalize(coletor.parse(LISTA_2026));

  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 6);

  const agosto = validos.filter((v) => v.observed_at === "2026-08-01");
  assert.deepEqual(
    agosto.map((v) => [v.series_code, v.value, v.unit]),
    [
      ["COMEX.MILHO.EXPORT.KG", 4653100189, "kg"],
      ["COMEX.MILHO.EXPORT.FOB_USD", 1002656682, "USD"]
    ]
  );
  assert.equal(agosto[0].source_code, "MDIC_COMEXSTAT");
  assert.equal(agosto[0].metadata.periodo, "2026-08");
  assert.equal(agosto[0].metadata.ncm, "10059010");
});

test("published_at é ESTIMADO: fim do dia 15 do mês seguinte (inclusive na virada de ano)", () => {
  const { validos } = coletor.normalize([
    { year: "2026", monthNumber: "08", metricFOB: "1", metricKG: "1" },
    { year: "2025", monthNumber: "12", metricFOB: "1", metricKG: "1" }
  ]);

  const agosto = validos.find((v) => v.observed_at === "2026-08-01");
  const dezembro = validos.find((v) => v.observed_at === "2025-12-01");

  assert.equal(agosto.published_at.toISOString(), "2026-09-15T23:59:59.000Z");
  assert.equal(dezembro.published_at.toISOString(), "2026-01-15T23:59:59.000Z");
  assert.equal(agosto.published_at_is_estimated, true);
  assert.equal(agosto.published_at_basis, "lag_rule");
});

test("normalize separa itens inválidos sem abortar o resto", () => {
  const { validos, invalidos } = coletor.normalize([
    { year: "2026", monthNumber: "13", metricFOB: "1", metricKG: "1" },
    { year: "2026", monthNumber: "02", metricFOB: "abc", metricKG: "10" },
    { year: "2026", monthNumber: "03", metricFOB: "5", metricKG: "20" }
  ]);

  // mês 13: 1 inválido; mês 02: FOB inválido (1) e KG válido (1); mês 03: 2 válidos.
  assert.equal(invalidos.length, 2);
  assert.equal(validos.length, 3);
  assert.equal(validos.filter((v) => v.observed_at === "2026-02-01").length, 1);
});

test("parse rejeita resposta que não é lista", () => {
  assert.throws(() => coletor.parse({ erro: true }), /formato inesperado/);
});

test("consultarAno pede o NCM do milho, exportação, com detalhe mensal e o ano inteiro", async () => {
  let corpoEnviado;
  const fetchFn = async (_url, opcoes) => {
    corpoEnviado = JSON.parse(opcoes.body);
    return ok(LISTA_2026);
  };

  const lista = await coletor.consultarAno(2026, { fetchFn });

  assert.equal(lista.length, 3);
  assert.equal(corpoEnviado.flow, "export");
  assert.equal(corpoEnviado.monthDetail, true);
  assert.deepEqual(corpoEnviado.period, { from: "2026-01", to: "2026-12" });
  assert.deepEqual(corpoEnviado.filters, [{ filter: "ncm", values: ["10059010"] }]);
  assert.deepEqual(corpoEnviado.metrics, ["metricFOB", "metricKG"]);
});

test("consultarAno espera e tenta de novo no 429 (rate limit), e depois devolve o dado", async () => {
  const respostas = [resposta(429, { error: { code: 429 } }), ok(LISTA_2026)];
  const esperas = [];

  const lista = await coletor.consultarAno(2026, {
    fetchFn: async () => respostas.shift(),
    esperar: async (ms) => esperas.push(ms)
  });

  assert.equal(lista.length, 3);
  assert.deepEqual(esperas, [coletor.ESPERA_429_BASE_MS]);
});

test("consultarAno desiste depois de 5 respostas 429 seguidas, com espera crescente entre elas", async () => {
  let chamadas = 0;
  const esperas = [];
  await assert.rejects(
    () =>
      coletor.consultarAno(2026, {
        fetchFn: async () => {
          chamadas += 1;
          return resposta(429, {});
        },
        esperar: async (ms) => esperas.push(ms)
      }),
    /status 429/
  );
  assert.equal(chamadas, coletor.MAX_TENTATIVAS_429);
  assert.deepEqual(esperas, [20000, 40000, 60000, 80000]);
});

test("consultarAno falha em erro HTTP que não é 429 e em corpo sem success", async () => {
  await assert.rejects(() => coletor.consultarAno(2026, { fetchFn: async () => resposta(500, {}) }), /status 500/);
  await assert.rejects(
    () => coletor.consultarAno(2026, { fetchFn: async () => resposta(200, { success: false }) }),
    /formato inesperado/
  );
});

test("baixarAnos consulta um ano por vez, com a pausa do rate limit entre eles (não antes do primeiro)", async () => {
  const anosPedidos = [];
  const esperas = [];
  const fetchFn = async (_url, opcoes) => {
    anosPedidos.push(JSON.parse(opcoes.body).period.from.slice(0, 4));
    return ok([]);
  };

  await coletor.baixarAnos([2024, 2025, 2026], { fetchFn, esperar: async (ms) => esperas.push(ms) });

  assert.deepEqual(anosPedidos, ["2024", "2025", "2026"]);
  assert.deepEqual(esperas, [coletor.PAUSA_MS, coletor.PAUSA_MS]);
});

test("intervaloDeAnos é inclusivo e o início validado é 2005", () => {
  assert.deepEqual(coletor.intervaloDeAnos(2005, 2007), [2005, 2006, 2007]);
  assert.equal(coletor.ANO_INICIAL, 2005);
});
