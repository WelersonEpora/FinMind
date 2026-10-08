"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverAnos, dividirEmBlocos } = require("./backfill-wasde");

test("resolverAnos usa 2011 até o ano corrente por padrão", () => {
  assert.deepEqual(resolverAnos({}, 2026), { anoInicial: 2011, anoFinal: 2026 });
});

test("resolverAnos respeita os argumentos", () => {
  assert.deepEqual(resolverAnos({ anoInicial: "2020", anoFinal: "2022" }, 2026), { anoInicial: 2020, anoFinal: 2022 });
});

test("resolverAnos recusa início antes de 2011 (só PDF/TXT no ESMIS) e intervalo invertido", () => {
  assert.throws(() => resolverAnos({ anoInicial: "2010" }, 2026), /só tem PDF\/TXT/);
  assert.throws(() => resolverAnos({ anoInicial: "2025", anoFinal: "2020" }, 2026), /inválido/);
});

test("dividirEmBlocos: 2011 a 2026 vira 4 blocos consecutivos de até 5 anos, sem sobreposição", () => {
  assert.deepEqual(dividirEmBlocos(2011, 2026), [
    { anoInicial: 2011, anoFinal: 2015 },
    { anoInicial: 2016, anoFinal: 2020 },
    { anoInicial: 2021, anoFinal: 2025 },
    { anoInicial: 2026, anoFinal: 2026 }
  ]);
});

test("dividirEmBlocos: --anosPorBloco=99 põe tudo numa execução só (série nova numa fonte já carregada)", () => {
  assert.deepEqual(dividirEmBlocos(2011, 2026, 99), [{ anoInicial: 2011, anoFinal: 2026 }]);
  assert.throws(() => dividirEmBlocos(2011, 2026, 0));
});
