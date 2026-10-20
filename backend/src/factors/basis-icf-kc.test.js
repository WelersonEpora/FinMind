"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { medirBasis, percentil, primeiroVencimentoKc, ultimoPregaoKc } = require("./basis-icf-kc");

test("ultimoPregaoKc: 8 dias úteis antes do último dia útil do mês (o KCU26 negociou até 18/09/2026)", () => {
  assert.equal(ultimoPregaoKc(2026, 9), "2026-09-18");
  // Dezembro de 2025: último dia útil 31/12; 8 antes, pulando o Natal, é 18/12.
  assert.equal(ultimoPregaoKc(2025, 12), "2025-12-18");
});

test("primeiroVencimentoKc: o 1º mês do KC cujo último pregão não passou", () => {
  assert.deepEqual(primeiroVencimentoKc("2026-09-18"), { ano: 2026, mes: 9, letra: "U" });
  assert.deepEqual(primeiroVencimentoKc("2026-09-21"), { ano: 2026, mes: 12, letra: "Z" });
  assert.deepEqual(primeiroVencimentoKc("2026-12-21"), { ano: 2027, mes: 3, letra: "H" });
});

test("percentil: a fração dos anteriores abaixo, com metade dos empates", () => {
  assert.equal(percentil(5, [1, 2, 3, 4]), 100);
  assert.equal(percentil(2, [1, 2, 3, 4]), 37.5);
  assert.equal(percentil(1, []), null);
});

test("medirBasis: o ICF contra o KC do mesmo mês em US$/saca; o vencimento do Yahoo vale sobre o KC=F; sem par, sem ponto", () => {
  const linha = (serie, data, valor) => ({ series_code: serie, observed_at: data, value: String(valor) });
  const pontos = medirBasis([
    // 16/10/2026, valores reais: o ICFZ26 a 377,10 e o KCZ26 a 305,60 c/lb.
    linha("YAHOO.KC_CONTINUO.SETTLE", "2026-10-16", 305.6),
    linha("YAHOO.KC.KCZ26.SETTLE", "2026-10-16", 305.6),
    linha("B3.ICF.ICFZ26.SETTLE", "2026-10-16", 377.1),
    // Sem o ICF do mesmo mês no dia: sem ponto.
    linha("YAHOO.KC_CONTINUO.SETTLE", "2026-10-19", 315.7)
  ]);
  assert.equal(pontos.length, 1);
  assert.deepEqual(pontos[0], {
    data: "2026-10-16",
    contratoIcf: "ICFZ26",
    contratoKc: "KCZ26",
    icf: 377.1,
    kcCentavos: 305.6,
    kcSaca: 404.24,
    basis: -27.14,
    basisPct: -6.71,
    percentil: null
  });
});
