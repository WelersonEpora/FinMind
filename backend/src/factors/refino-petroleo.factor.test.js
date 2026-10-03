"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, crack321, sextaDaSemana, derivarRefinoPetroleo, calcularRefinoPetroleo, explicarRefino } = require("./refino-petroleo.factor");

const linha = (serie, observedAt, value) => ({ seriesCode: serie, observedAt, value, publishedAt: new Date(`${observedAt}T23:59:59Z`), publishedAtIsEstimated: true });

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Um dia com os três preços (e o crack que eles dão).
function dia(observedAt, { brent, gasolina, diesel }) {
  return [linha(SERIES.brent, observedAt, brent), linha(SERIES.gasolina, observedAt, gasolina), linha(SERIES.diesel, observedAt, diesel)];
}

test("crack 3-2-1 contra o Brent, em US$ por barril", () => {
  // [(2 × 2,50 + 3,00) × 42 − 3 × 80] ÷ 3 = (336 − 240) ÷ 3 = 32
  assert.equal(crack321({ brent: 80, gasolina: 2.5, diesel: 3 }), 32);
});

test("a semana vai de sábado a sexta e leva a data da sexta", () => {
  assert.equal(sextaDaSemana("2026-09-28"), "2026-10-02");
  assert.equal(sextaDaSemana("2026-10-02"), "2026-10-02");
  assert.equal(sextaDaSemana("2026-10-03"), "2026-10-09");
});

test("A: o crack da semana é a média dos dias com os três preços; dia sem diesel não entra; a utilização é a da sexta", () => {
  const linhas = [
    ...dia("2026-09-28", { brent: 80, gasolina: 2.5, diesel: 3 }), // 32
    ...dia("2026-09-29", { brent: 80, gasolina: 2.5, diesel: 3.5 }), // 39
    linha(SERIES.brent, "2026-09-30", 80),
    linha(SERIES.gasolina, "2026-09-30", 2.5),
    linha(SERIES.utilizacao, "2026-10-02", 92.5)
  ];
  const [semana] = derivarRefinoPetroleo(linhas);
  assert.equal(semana.observedAt, "2026-10-02");
  assert.equal(semana.crack, 35.5);
  assert.equal(semana.diasNaSemana, 2);
  assert.equal(semana.utilizacao, 92.5);
  assert.equal(semana.media5Anos, null);
  assert.equal(semana.decisao, null);
});

test("B e C: desvio em US$ contra a mesma semana dos 5 anos; margem acima do normal é pressão de ALTA", () => {
  const sexta = "2026-10-02";
  const linhas = [];
  for (let k = 1; k <= 5; k += 1) linhas.push(...dia(somarDias(sexta, -364 * k), { brent: 80, gasolina: 2.5, diesel: 3 })); // 32
  linhas.push(...dia(sexta, { brent: 80, gasolina: 2.75, diesel: 3.25 })); // [(5,5 + 3,25) × 42 − 240] ÷ 3 = 42,5
  const ultimo = derivarRefinoPetroleo(linhas).at(-1);
  assert.equal(ultimo.media5Anos, 32);
  assert.equal(ultimo.desvio, 10.5);
  assert.equal(ultimo.decisao.direcao, "ALTA");
  assert.equal(ultimo.decisao.intensidade, "FORTE");
  const passos = explicarRefino(ultimo);
  assert.match(passos[0], /US\$ 42,50 por barril na semana, contra US\$ 32,00 .*: \+10,50 US\$\/barril \(B\)/);
  assert.match(passos[1], /\+10,50 US\$\/barril está acima de \+3,0 US\$\/barril: margem acima do normal eleva a demanda por petróleo → Pressão de alta\./);
});

test("busca o Brent, a gasolina, o diesel e a utilização, o histórico inteiro", async () => {
  let pedido;
  const pointInTimeService = { obterAsOf: async (args) => { pedido = args; return []; } };
  await calcularRefinoPetroleo({ asOf: new Date("2026-10-03T12:00:00Z") }, { pointInTimeService });
  assert.deepEqual(pedido.seriesCodes.sort(), Object.values(SERIES).sort());
});
