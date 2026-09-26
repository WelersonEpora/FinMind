"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverAnos, dividirEmBlocos } = require("./backfill-comex-milho");

test("resolverAnos usa 2005 até o ano corrente por padrão", () => {
  assert.deepEqual(resolverAnos({}, 2026), { anoInicial: 2005, anoFinal: 2026 });
});

test("resolverAnos respeita os argumentos", () => {
  assert.deepEqual(resolverAnos({ anoInicial: "2020", anoFinal: "2022" }, 2026), { anoInicial: 2020, anoFinal: 2022 });
});

test("resolverAnos recusa início antes de 2005 (NCM não validado) e intervalo invertido", () => {
  assert.throws(() => resolverAnos({ anoInicial: "2000" }, 2026), /não está validado/);
  assert.throws(() => resolverAnos({ anoInicial: "2025", anoFinal: "2020" }, 2026), /inválido/);
});

test("dividirEmBlocos: 2005 a 2026 vira 5 blocos consecutivos de até 5 anos, sem sobreposição", () => {
  assert.deepEqual(dividirEmBlocos(2005, 2026), [
    { anoInicial: 2005, anoFinal: 2009 },
    { anoInicial: 2010, anoFinal: 2014 },
    { anoInicial: 2015, anoFinal: 2019 },
    { anoInicial: 2020, anoFinal: 2024 },
    { anoInicial: 2025, anoFinal: 2026 }
  ]);
});

test("dividirEmBlocos: um único ano vira um bloco", () => {
  assert.deepEqual(dividirEmBlocos(2026, 2026), [{ anoInicial: 2026, anoFinal: 2026 }]);
});
