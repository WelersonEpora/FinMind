"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./imea-andamento-milho.collector");

test("normalize: uma série por região e tipo, observed_at = a semana, published_at estimado no próprio dia", () => {
  const { validos, invalidos } = coletor.normalize([
    {
      tipo: "SEMEADURA",
      nome: "Informe de Semeadura - Milho - 25/26",
      safra: "25/26",
      data: "2026-03-20",
      semanas: [{ data: "2026-02-13", valores: { MATO_GROSSO: 46.07, MEDIO_NORTE: 62.24 } }]
    },
    { tipo: "COLHEITA", nome: "Informe de Colheita - Milho - 14/15", safra: "14/15", data: "2015-09-04", erro: "Falha ao ler a tabela: sem região" }
  ]);
  assert.equal(validos.length, 2);
  assert.equal(invalidos.length, 1);
  const mt = validos.find((v) => v.series_code === "IMEA.MILHO.ANDAMENTO.MATO_GROSSO.SEMEADURA");
  assert.equal(mt.value, 46.07);
  assert.equal(mt.unit, "%");
  assert.equal(mt.observed_at, "2026-02-13");
  assert.equal(mt.published_at.toISOString(), "2026-02-13T23:59:59.000Z");
  assert.equal(mt.published_at_is_estimated, true);
  assert.equal(mt.metadata.safra, "25/26");
});

test("parse: um informe ilegível vira erro do informe, sem derrubar os outros", () => {
  const [item] = coletor.parse([{ tipo: "COLHEITA", nome: "x", safra: "14/15", data: "2015-09-04", paginas: [{ itens: [] }] }]);
  assert.match(item.erro, /Falha ao ler a tabela/);
  assert.throws(() => coletor.parse({}));
});
