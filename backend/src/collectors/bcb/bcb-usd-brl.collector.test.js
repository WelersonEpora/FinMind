"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./bcb-usd-brl.collector");

// Fixture real, capturada de uma chamada à API do BCB (ver docs/adr/0001) -
// nenhum teste chama a API de verdade.
const FIXTURE_RESPOSTA_BCB = [
  { data: "04/09/2026", valor: "5.1253" },
  { data: "08/09/2026", valor: "5.0856" },
  { data: "09/09/2026", valor: "5.0979" }
];

test("codigo identifica o coletor", () => {
  assert.equal(collector.codigo, "bcb-usd-brl-venda");
});

test("parse aceita um array e rejeita qualquer outro formato", () => {
  assert.deepEqual(collector.parse(FIXTURE_RESPOSTA_BCB), FIXTURE_RESPOSTA_BCB);
  assert.throws(() => collector.parse({ erro: "formato inesperado" }));
});

test("normalize converte data BR->ISO e valor pt-BR->number para itens válidos", () => {
  const { validos, invalidos } = collector.normalize(FIXTURE_RESPOSTA_BCB);

  assert.equal(validos.length, 3);
  assert.equal(invalidos.length, 0);
  assert.deepEqual(validos[0], {
    instrument_code: "USD_BRL",
    source_code: "BCB_SGS_1",
    modality: "venda",
    reference_date: "2026-09-04",
    value: 5.1253,
    unit: "BRL",
    metadata: { fonte: "BCB SGS", serie: 1, dataOriginal: "04/09/2026" }
  });
});

test("normalize descarta item com data em formato inesperado", () => {
  const { validos, invalidos } = collector.normalize([{ data: "2026-09-04", valor: "5.10" }]);

  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /Data em formato inesperado/);
});

test("normalize descarta item com valor não numérico ou zero/negativo", () => {
  const { validos, invalidos } = collector.normalize([
    { data: "04/09/2026", valor: "não é número" },
    { data: "05/09/2026", valor: "0" },
    { data: "06/09/2026", valor: "-1.5" }
  ]);

  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 3);
});

test("download lança UpstreamServiceError quando a API responde com status de erro", async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });

  try {
    await assert.rejects(() => collector.download({}), /status 503/);
  } finally {
    global.fetch = fetchOriginal;
  }
});

test("download lança UpstreamServiceError em falha de rede", async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => {
    throw new Error("ECONNRESET");
  };

  try {
    await assert.rejects(() => collector.download({}), /Falha de rede/);
  } finally {
    global.fetch = fetchOriginal;
  }
});

test("download retorna o JSON da resposta quando a API responde com sucesso", async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => FIXTURE_RESPOSTA_BCB });

  try {
    const resultado = await collector.download({});
    assert.deepEqual(resultado, FIXTURE_RESPOSTA_BCB);
  } finally {
    global.fetch = fetchOriginal;
  }
});

test("downloadIntervalo consulta a API com dataInicial/dataFinal e retorna o JSON (usado pelo backfill)", async () => {
  const fetchOriginal = global.fetch;
  let urlChamada;
  global.fetch = async (url) => {
    urlChamada = url;
    return { ok: true, json: async () => FIXTURE_RESPOSTA_BCB };
  };

  try {
    const resultado = await collector.downloadIntervalo({ dataInicial: "01/06/2026", dataFinal: "30/06/2026" });
    assert.deepEqual(resultado, FIXTURE_RESPOSTA_BCB);
    assert.match(urlChamada, /dataInicial=01\/06\/2026/);
    assert.match(urlChamada, /dataFinal=30\/06\/2026/);
  } finally {
    global.fetch = fetchOriginal;
  }
});
