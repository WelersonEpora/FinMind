"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { montarSerieContinua, pregaoAntes, pregoesEntre } = require("./serie-continua-futuro");
const { ultimoPregaoIcf } = require("../serie-continua-icf");

// Pregões seg-sex a partir de `inicio`.
function pregoes(inicio, quantos) {
  const dias = [];
  const d = new Date(`${inicio}T00:00:00Z`);
  while (dias.length < quantos) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}
const porDia = (dias, valor) => new Map(dias.map((d, i) => [d, typeof valor === "function" ? valor(d, i) : valor]));

test("pregaoAntes e pregoesEntre: seg-sex menos os feriados de data fixa", () => {
  const feriados = new Set(["12-24", "12-25", "12-31"]);
  // 31/12/2025 sem pregão: o último dia útil é 30/12; o 6º antes dele, pulando 24 e 25, é 18/12 (o Z25 de verdade).
  assert.equal(pregaoAntes("2025-12-31", 6, feriados), "2025-12-18");
  assert.equal(pregoesEntre("2025-12-18", "2025-12-30", feriados), 6);
  assert.equal(pregaoAntes("2026-10-17", 0, feriados), "2026-10-16"); // sábado recua para a sexta
});

test("ultimoPregaoIcf: o 6º dia útil antes do último dia útil do mês de vencimento", () => {
  assert.equal(ultimoPregaoIcf({ ano: 2026, mes: 9 }), "2026-09-22");
  assert.equal(ultimoPregaoIcf({ ano: 2025, mes: 12 }), "2025-12-18");
  assert.equal(ultimoPregaoIcf({ ano: 2026, mes: 3 }), "2026-03-23");
  assert.equal(ultimoPregaoIcf({ ano: 2024, mes: 12 }), "2024-12-18");
});

test("rola pela liquidez dentro da janela, pula o vencimento sem negócio e ajusta o passado pela razão", () => {
  const dias = pregoes("2026-07-01", 60); // até 2026-09-22
  const contratos = [
    { ticker: "ICFU26", vencimento: "2026-09", ultimoPregao: "2026-09-22" },
    { ticker: "ICFV26", vencimento: "2026-10", ultimoPregao: "2026-10-22" }, // listado, nunca negocia
    { ticker: "ICFZ26", vencimento: "2026-12", ultimoPregao: "2026-12-17" }
  ];
  const troca = dias[30];
  const ajustes = new Map([
    ["ICFU26", porDia(dias, 400)],
    ["ICFV26", porDia(dias, 390)],
    ["ICFZ26", porDia(dias, 380)]
  ]);
  // Os negócios passam do U para o Z no pregão 30; o V não negocia.
  const negociados = new Map([
    ["ICFU26", porDia(dias, (d, i) => (i < 30 ? 1000 : 10))],
    ["ICFZ26", porDia(dias, (d, i) => (i < 30 ? 10 : 1000))]
  ]);
  const { pontos, trocas } = montarSerieContinua({ contratos, ajustes, negociados }, { pregoesLiquidez: 1 });
  assert.equal(trocas.length, 1);
  assert.deepEqual(
    { data: trocas[0].data, de: trocas[0].de, para: trocas[0].para, motivo: trocas[0].motivo },
    { data: troca, de: "ICFU26", para: "ICFZ26", motivo: "LIQUIDEZ" }
  );
  assert.equal(trocas[0].razao, 380 / 400);
  // O dia da troca já é do Z, com o preço real; antes dela, o U ajustado pela razão (400 × 0,95 = 380): sem salto.
  const doDia = pontos.find((p) => p.data === troca);
  assert.deepEqual([doDia.ticker, doDia.valor, doDia.ajustado], ["ICFZ26", 380, 380]);
  assert.deepEqual([pontos[0].ticker, pontos[0].valor, pontos[0].ajustado], ["ICFU26", 400, 380]);
});

test("fora da janela, negócio maior no seguinte não rola (ruído); a trava rola 10 pregões antes do vencimento", () => {
  const dias = pregoes("2026-06-01", 80); // até 2026-09-18
  const contratos = [
    { ticker: "ICFU26", vencimento: "2026-09", ultimoPregao: "2026-09-22" },
    { ticker: "ICFZ26", vencimento: "2026-12", ultimoPregao: "2026-12-17" }
  ];
  const ajustes = new Map([
    ["ICFU26", porDia(dias, 400)],
    ["ICFZ26", porDia(dias, 380)]
  ]);
  // O Z tem um pouco mais de negócios logo no começo (fora da janela de 40 pregões); depois, nenhum dos dois.
  const negociados = new Map([
    ["ICFU26", porDia(dias.slice(0, 3), 5)],
    ["ICFZ26", porDia(dias.slice(0, 3), 6)]
  ]);
  const { trocas } = montarSerieContinua({ contratos, ajustes, negociados });
  assert.equal(trocas.length, 1);
  assert.equal(trocas[0].motivo, "TRAVA");
  assert.equal(trocas[0].data, pregaoAntes("2026-09-22", 10, new Set()));
});

test("vencimento que passou do último pregão sem troca (buraco nos dados) rola no 1º pregão depois do buraco", () => {
  const antes = pregoes("2023-03-01", 5);
  const depois = pregoes("2023-12-01", 5);
  const contratos = [
    { ticker: "ICFU23", vencimento: "2023-09", ultimoPregao: "2023-09-21" },
    { ticker: "ICFZ23", vencimento: "2023-12", ultimoPregao: "2023-12-19" }
  ];
  const ajustes = new Map([
    ["ICFU23", porDia(antes, 200)],
    ["ICFZ23", porDia([...antes, ...depois], 190)]
  ]);
  const negociados = new Map([["ICFU23", porDia(antes, 100)]]);
  const { pontos, trocas } = montarSerieContinua({ contratos, ajustes, negociados });
  assert.equal(trocas.length, 1);
  assert.deepEqual([trocas[0].data, trocas[0].motivo, trocas[0].precoDe, trocas[0].razao], [depois[0], "TRAVA", null, 190 / 200]);
  assert.equal(pontos.length, 10);
});
