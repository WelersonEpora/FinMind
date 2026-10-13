"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dimensionar, planejarEntradaAutomatica, conferirPlanoDoOperador, niveis } = require("./risco");
const { PADRAO_POR_ATIVO } = require("./parametros");

const MILHO = PADRAO_POR_ATIVO.MILHO;
const OURO = PADRAO_POR_ATIVO.OURO;
const proximo = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test("Cartilha, exemplo 1 (milho): stop de R$ 0,50 não cabe com contrato inteiro; R$ 0,40 cabe", () => {
  const largo = dimensionar({ distancia: 0.5, paramAtivo: MILHO, patrimonio: 10000, valorDoPonto: 450 });
  assert.equal(largo.riscoMaximo, 200);
  assert.equal(largo.contratosInteiros.riscoPorContrato, 225);
  assert.equal(largo.contratosInteiros.cabe, false);
  assert.equal(largo.contratosInteiros.quantosCabem, 0);
  proximo(largo.contratosInteiros.capitalMinimo, 11250);
  // Fracionária (D1): o risco fica no máximo, nunca acima.
  assert.equal(largo.quantidade, 0.888888);
  assert.ok(largo.risco1R <= 200);

  const curto = dimensionar({ distancia: 0.4, paramAtivo: MILHO, patrimonio: 10000, valorDoPonto: 450 });
  assert.equal(curto.contratosInteiros.riscoPorContrato, 180);
  assert.equal(curto.contratosInteiros.cabe, true);
  assert.equal(curto.contratosInteiros.quantosCabem, 1);
});

test("Cartilha, exemplo 2 (ouro): 1 oz com stop de US$ 20 cabe em 1,5% de US$ 2.000; o micro (10 oz), não", () => {
  const cfd = dimensionar({ distancia: 20, paramAtivo: OURO, patrimonio: 2000, valorDoPonto: 1 });
  assert.equal(cfd.riscoMaximo, 30);
  assert.equal(cfd.contratosInteiros.cabe, true);
  const micro = dimensionar({ distancia: 20, paramAtivo: OURO, patrimonio: 2000, valorDoPonto: 10 });
  assert.equal(micro.contratosInteiros.cabe, false);
  proximo(micro.contratosInteiros.capitalMinimo, 200 / 0.015);
});

test("o fator overnight reduz o risco máximo", () => {
  const metade = dimensionar({ distancia: 0.5, paramAtivo: MILHO, patrimonio: 10000, valorDoPonto: 450, fatorOvernight: 0.5 });
  assert.equal(metade.riscoMaximo, 100);
});

test("entrada automática: o stop é o piso de 1,5× o ATR", () => {
  const plano = planejarEntradaAutomatica({ atr: 1.12, paramAtivo: MILHO, patrimonio: 10000, valorDoPonto: 450 });
  proximo(plano.distancia, 1.68);
  assert.equal(plano.quantidade, 0.264550);
  assert.equal(plano.contratosInteiros.cabe, false);
  proximo(plano.contratosInteiros.capitalMinimo, 37800);
});

test("níveis: alvos em R a partir da entrada, nos dois lados", () => {
  const c = niveis("COMPRADO", 68.4, 1.8, MILHO);
  proximo(c.stop, 66.6);
  proximo(c.alvo1, 70.2);
  proximo(c.alvo2, 73.8);
  const v = niveis("VENDIDO", 24, 0.6, MILHO);
  proximo(v.stop, 24.6);
  proximo(v.alvo2, 22.2);
});

test("operador: aprova o plano dentro do piso; recusa abaixo do piso e o stop do lado errado", () => {
  const base = { lado: "COMPRADO", entrada: 68.4, atr: 1.12, paramAtivo: MILHO, patrimonio: 10412, valorDoPonto: 450 };
  const ok = conferirPlanoDoOperador({ ...base, stop: 66.6 });
  assert.equal(ok.aprovado, true);
  proximo(ok.plano.alvo1, 70.2);

  const curto = conferirPlanoDoOperador({ ...base, stop: 66.8 });
  assert.equal(curto.aprovado, false);
  assert.equal(curto.verificacoes.find((v) => v.codigo === "PISO_ATR").ok, false);

  const errado = conferirPlanoDoOperador({ ...base, stop: 69 });
  assert.equal(errado.aprovado, false);
  assert.equal(errado.verificacoes.find((v) => v.codigo === "STOP_DO_LADO").ok, false);
  assert.equal(errado.plano, null);

  const semAtr = conferirPlanoDoOperador({ ...base, stop: 66.6, atr: null });
  assert.equal(semAtr.verificacoes.find((v) => v.codigo === "PISO_ATR").ok, false);
});

test("R:R conferido pelo alvo 2 (D10): o ouro passa (3 ≥ 2,5); um alvo 2 abaixo do mínimo, não", () => {
  assert.equal(dimensionar({ distancia: 20, paramAtivo: OURO, patrimonio: 2000, valorDoPonto: 1 }).rrOk, true);
  const curto = { ...OURO, alvo2R: 2 };
  const r = conferirPlanoDoOperador({ lado: "COMPRADO", entrada: 4000, stop: 3880, atr: 70, paramAtivo: curto, patrimonio: 2000, valorDoPonto: 1 });
  assert.equal(r.verificacoes.find((v) => v.codigo === "RR_MINIMO").ok, false);
});
