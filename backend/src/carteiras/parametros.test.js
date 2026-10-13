"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parametrosPadrao, validarParametros, pendencias } = require("./parametros");
const { valorDoPonto } = require("./especificacoes");

test("o padrão da Cartilha v1.0 é válido; o custo sem número real é pendência, não erro", () => {
  const p = parametrosPadrao("B3", ["MILHO", "CAFE", "SOJA"]);
  assert.deepEqual(validarParametros(p), []);
  assert.deepEqual(pendencias(p).map((x) => [x.codigo, x.ativo]), [
    ["CUSTO_PENDENTE", "MILHO"],
    ["CUSTO_PENDENTE", "CAFE"],
    ["CUSTO_PENDENTE", "SOJA"]
  ]);
  p.ativos.MILHO.custoPorContrato = 1.2;
  assert.equal(pendencias(p).length, 2);
  p.ativos.CAFE.custoPorContrato = -1;
  assert.ok(validarParametros(p).some((e) => e.startsWith("ativos.CAFE.custoPorContrato")));
});

test("as perdas diária e semanal seguem a conta", () => {
  assert.equal(parametrosPadrao("B3", ["MILHO"]).carteira.perdaDiariaPct, 4);
  const int = parametrosPadrao("INTERNACIONAL", ["OURO", "PETROLEO"]);
  assert.equal(int.carteira.perdaDiariaPct, 3);
  assert.equal(int.carteira.perdaSemanalPct, 6);
  assert.equal(int.ativos.PETROLEO.riscoPct, 1);
  assert.deepEqual(validarParametros(int), []);
});

test("validação estrita: campo desconhecido, ativo de outra conta, números fora da faixa", () => {
  const p = parametrosPadrao("B3", ["MILHO"]);
  p.ativos.MILHO.riscoPCT = 2;
  p.ativos.MILHO.alvo2R = 0.5;
  p.ativos.OURO = parametrosPadrao("INTERNACIONAL", ["OURO"]).ativos.OURO;
  p.carteira.maxPosicoes = 0;
  p.execucao.diasUteisMinimosAteOLimite = 10;
  const erros = validarParametros(p);
  assert.ok(erros.some((e) => e.includes('"riscoPCT"')));
  assert.ok(erros.some((e) => e.includes("alvo2R")));
  assert.ok(erros.some((e) => e.includes("ativos.OURO: o ativo é da conta INTERNACIONAL")));
  assert.ok(erros.some((e) => e.includes("maxPosicoes")));
  assert.ok(erros.some((e) => e.includes("diasUteisMinimosAteOLimite")));
});

test("sem ativos, ou com quantidade inteira (não implementada na v1), é inválido", () => {
  const p = parametrosPadrao("B3", []);
  p.execucao.quantidade = "INTEIRA";
  const erros = validarParametros(p);
  assert.ok(erros.some((e) => e.startsWith("ativos")));
  assert.ok(erros.some((e) => e.startsWith("execucao.quantidade")));
});

test("valor do ponto: em reais direto; o preço em dólar na B3 pela PTAX; sem câmbio, nulo", () => {
  assert.equal(valorDoPonto("MILHO", "B3"), 450);
  assert.equal(valorDoPonto("CAFE", "B3", 5.38), 538);
  assert.equal(valorDoPonto("SOJA", "B3"), null);
  assert.equal(valorDoPonto("OURO", "INTERNACIONAL"), 1);
});
