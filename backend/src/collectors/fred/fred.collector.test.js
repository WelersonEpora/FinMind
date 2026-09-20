"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarColetorFred, parse } = require("./fred.collector");

// Fixture real (fredgraph.csv, 2026-09-20). Nenhum teste chama o FRED.
const CSV_DFII10 = `observation_date,DFII10
2026-09-10,2.55
2026-09-11,2.60
2026-09-14,2.60
2026-09-07,.
2026-09-17,2.61
`;

test("parse descarta o cabeçalho e os dias sem valor ('.'), que são ausência e não observação", () => {
  assert.deepEqual(parse(CSV_DFII10), [
    ["2026-09-10", "2.55"],
    ["2026-09-11", "2.60"],
    ["2026-09-14", "2.60"],
    ["2026-09-17", "2.61"]
  ]);
});

test("parse rejeita resposta que não é CSV", () => {
  assert.throws(() => parse({ erro: true }));
  assert.throws(() => parse("<html>sem virgula</html>"));
});

test("DFII10: observação vira FRED.DFII10, com published_at ESTIMADO = fim do próximo dia útil", () => {
  const coletor = criarColetorFred("DFII10");
  const { validos, invalidos } = coletor.normalize(parse(CSV_DFII10));

  assert.equal(invalidos.length, 0);
  assert.equal(coletor.codigo, "fred-dfii10");

  const sexta = validos.find((v) => v.observed_at === "2026-09-11");
  assert.equal(sexta.series_code, "FRED.DFII10");
  assert.equal(sexta.value, 2.6);
  assert.equal(sexta.unit, "% a.a.");
  assert.equal(sexta.source_code, "FRED");
  assert.equal(sexta.published_at_is_estimated, true);
  assert.equal(sexta.published_at.toISOString(), "2026-09-14T23:59:59.000Z", "sexta -> segunda, não sábado");
});

test("DTWEXBGS é diária mas divulgada semanalmente: published_at = próxima segunda", () => {
  const coletor = criarColetorFred("DTWEXBGS");
  const { validos } = coletor.normalize([
    ["2026-09-08", "118.5"], // terça
    ["2026-09-11", "118.2126"] // sexta
  ]);

  assert.equal(validos[0].published_at.toISOString(), "2026-09-14T23:59:59.000Z");
  assert.equal(validos[1].published_at.toISOString(), "2026-09-14T23:59:59.000Z", "a semana inteira sai junta");
  assert.equal(validos[1].unit, "INDEX");
  assert.equal(validos[1].metadata.regraPublicacao, "proxima_segunda_h10_semanal");
});

test("normalize separa data/valor inválidos sem abortar o resto", () => {
  const { validos, invalidos } = criarColetorFred("DGS10").normalize([
    ["10/09/2026", "4.5"],
    ["2026-09-10", "abc"],
    ["2026-09-11", "4.6"]
  ]);

  assert.equal(validos.length, 1);
  assert.equal(invalidos.length, 2);
});

test("série FRED desconhecida falha cedo", () => {
  assert.throws(() => criarColetorFred("XYZ"), /desconhecida/);
});
