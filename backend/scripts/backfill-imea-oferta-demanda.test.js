"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverAnos, dividirEmBlocos } = require("./backfill-imea-oferta-demanda");

test("resolverAnos usa 2014 até o ano corrente por padrão", () => {
  assert.deepEqual(resolverAnos({}, 2026), { anoInicial: 2014, anoFinal: 2026 });
});

test("resolverAnos respeita os argumentos", () => {
  assert.deepEqual(resolverAnos({ anoInicial: "2020", anoFinal: "2022" }, 2026), { anoInicial: 2020, anoFinal: 2022 });
});

test("resolverAnos recusa início antes de 2014 (catálogo do IMEA não tem edição antes disso) e intervalo invertido", () => {
  assert.throws(() => resolverAnos({ anoInicial: "2013" }, 2026), /catálogo do IMEA não tem/);
  assert.throws(() => resolverAnos({ anoInicial: "2025", anoFinal: "2020" }, 2026), /inválido/);
});

test("dividirEmBlocos: 2014 a 2026 vira 3 blocos consecutivos de até 5 anos, sem sobreposição", () => {
  assert.deepEqual(dividirEmBlocos(2014, 2026), [
    { anoInicial: 2014, anoFinal: 2018 },
    { anoInicial: 2019, anoFinal: 2023 },
    { anoInicial: 2024, anoFinal: 2026 }
  ]);
});
