"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { serieDePatrimonio, drawdownMaximo } = require("./razao");

test("patrimônio: capital mais os lançamentos; dia sem lançamento repete o anterior", () => {
  const serie = serieDePatrimonio(
    10000,
    [
      { data: "2026-09-02", valor: 50 },
      { data: "2026-09-01", valor: -20.5 },
      { data: "2026-09-02", valor: 5.25 }
    ],
    ["2026-09-01", "2026-09-02", "2026-09-03"]
  );
  assert.deepEqual(serie, [
    { data: "2026-09-01", patrimonio: 9979.5 },
    { data: "2026-09-02", patrimonio: 10034.75 },
    { data: "2026-09-03", patrimonio: 10034.75 }
  ]);
});

test("um lançamento tardio com data antiga refaz a série a partir dele", () => {
  const datas = ["2026-09-01", "2026-09-02"];
  const antes = serieDePatrimonio(10000, [{ data: "2026-09-02", valor: 10 }], datas);
  const depois = serieDePatrimonio(10000, [{ data: "2026-09-02", valor: 10 }, { data: "2026-09-01", valor: 100 }], datas);
  assert.equal(antes[1].patrimonio, 10010);
  assert.equal(depois[1].patrimonio, 10110);
});

test("drawdown máximo: o maior recuo desde o pico", () => {
  const dd = drawdownMaximo([
    { data: "a", patrimonio: 10000 },
    { data: "b", patrimonio: 11000 },
    { data: "c", patrimonio: 9900 },
    { data: "d", patrimonio: 12000 },
    { data: "e", patrimonio: 11400 }
  ]);
  assert.ok(Math.abs(dd.pct - 10) < 1e-9);
  assert.deepEqual([dd.pico, dd.vale], ["b", "c"]);
  assert.equal(drawdownMaximo([{ data: "a", patrimonio: 1 }]).pct, 0);
});
