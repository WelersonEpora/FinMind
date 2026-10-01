"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./usda-grain-stocks.collector");

const edicao = (data, valores, extra = {}) => ({ data, slug: data, arquivo: "grst.zip", dataLiberacao: data, titulo: "t", valores, ...extra });

test("normalize: uma série por posição, com a data REAL do release, em ordem cronológica", () => {
  const { validos, invalidos, avisos } = coletor.normalize([
    edicao("2026-01-12", [{ observedAt: "2025-09-01", posicao: "TOTAL", valor: 1551286 }]),
    edicao("2025-09-30", [
      { observedAt: "2025-09-01", posicao: "TOTAL", valor: 1531613 },
      { observedAt: "2025-09-01", posicao: "ON_FARM", valor: 600000, revisado: true }
    ])
  ]);
  assert.equal(invalidos.length, 0);
  assert.equal(avisos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.published_at.toISOString().slice(0, 10), v.value]),
    [
      ["USDA.GRAIN_STOCKS.CORN.TOTAL", "2025-09-30", 1531613],
      ["USDA.GRAIN_STOCKS.CORN.ON_FARM", "2025-09-30", 600000],
      ["USDA.GRAIN_STOCKS.CORN.TOTAL", "2026-01-12", 1551286]
    ]
  );
  assert.equal(validos[0].source_code, "USDA_NASS_GRAIN_STOCKS");
  assert.equal(validos[0].published_at_is_estimated, false);
  assert.equal(validos[1].metadata.marcadoComoRevisado, true);
});

test("normalize: outro relatório vira aviso; data do CSV diferente da listagem e erro de leitura viram inválido", () => {
  const { validos, invalidos, avisos } = coletor.normalize([
    { data: "2003-02-27", slug: "2003-02-27", outroRelatorio: true },
    edicao("2024-06-28", [{ observedAt: "2024-06-01", posicao: "TOTAL", valor: 1 }], { dataLiberacao: "2024-03-28" }),
    { data: "2020-01-10", slug: "2020-01-10", erro: "Falha ao ler o CSV: x" }
  ]);
  assert.equal(validos.length, 0);
  assert.equal(avisos.length, 1);
  assert.equal(invalidos.length, 2);
  assert.match(invalidos[0].motivo, /não confere/);
});

test("parse: edição sem ZIP vira erro da edição, sem derrubar o lote", () => {
  const [item] = coletor.parse([{ data: "2001-06-29", slug: "x", semArquivo: true }]);
  assert.match(item.erro, /não tem o arquivo ZIP/);
  assert.throws(() => coletor.parse({}));
});
