"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { trueRange, calcularAtr } = require("./atr");

const proximo = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("true range: a faixa do dia, ou a distância até o ajuste anterior num gap", () => {
  assert.equal(trueRange({ maxima: 11, minima: 9.5, ajuste: 10.5 }, 10), 1.5);
  assert.equal(trueRange({ maxima: 13, minima: 12, ajuste: 12.5 }, 10), 3);
  // Sem máxima nem mínima (sem negócio; o Brent): o ajuste nas duas.
  proximo(trueRange({ ajuste: 11.6 }, 10.6), 1);
});

test("ATR de Wilder: média simples dos primeiros, depois a suavização", () => {
  const barras = [
    { data: "2026-10-01", ajuste: 10 },
    { data: "2026-10-02", maxima: 11, minima: 9.5, ajuste: 10.5 },
    { data: "2026-10-05", maxima: 10.8, minima: 10.2, ajuste: 10.6 },
    { data: "2026-10-06", ajuste: 11.6 }
  ];
  proximo(calcularAtr(barras, 3), (1.5 + 0.6 + 1) / 3);
  const mais = [...barras, { data: "2026-10-07", maxima: 12, minima: 11, ajuste: 11.5 }];
  proximo(calcularAtr(mais, 3), (((1.5 + 0.6 + 1) / 3) * 2 + 1) / 3);
});

test("ATR: ordena pela data e pede periodo + 1 dias", () => {
  const barras = [
    { data: "2026-10-05", maxima: 10.8, minima: 10.2, ajuste: 10.6 },
    { data: "2026-10-01", ajuste: 10 },
    { data: "2026-10-02", maxima: 11, minima: 9.5, ajuste: 10.5 }
  ];
  proximo(calcularAtr(barras, 2), (1.5 + 0.6) / 2);
  assert.equal(calcularAtr(barras, 3), null);
  assert.equal(calcularAtr([], 14), null);
});
