"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parametrosPadrao, validarParametros, pendencias, resolverVigente, classificarMudanca } = require("./parametros");
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
  p.ativos.MILHO.diasUteisMinimosAteOLimite = 10;
  const erros = validarParametros(p);
  assert.ok(erros.some((e) => e.includes('"riscoPCT"')));
  assert.ok(erros.some((e) => e.includes("alvo2R")));
  assert.ok(erros.some((e) => e.includes("ativos.OURO: o ativo é da conta INTERNACIONAL")));
  assert.ok(erros.some((e) => e.includes("maxPosicoes")));
  assert.ok(erros.some((e) => e.includes("ativos.MILHO.diasUteisMinimosAteOLimite")));
});

test("o dólar (adendo de 2026-10-15): na conta B3, o risco do agro, 1 tick de slippage e o vencimento próprio", () => {
  const p = parametrosPadrao("B3", ["DOLAR"]);
  assert.deepEqual(validarParametros(p), []);
  const { riscoPct, alvo1R, alvo2R, rrMinimo, slippageTicks, diasUteisMinimosAteOLimite, diasUteisEncerrarAntesDoLimite, liquidezMinima } = p.ativos.DOLAR;
  assert.deepEqual([riscoPct, alvo1R, alvo2R, rrMinimo, slippageTicks], [2, 1, 3, 2, 1]);
  assert.deepEqual([diasUteisMinimosAteOLimite, diasUteisEncerrarAntesDoLimite, liquidezMinima], [3, 2, 100]);
  assert.equal(parametrosPadrao("B3", ["MILHO"]).ativos.MILHO.diasUteisMinimosAteOLimite, 30);
  assert.equal("diasUteisMinimosAteOLimite" in p.execucao, false);
  // Carteira própria: o dólar não se mistura com o agro.
  assert.deepEqual(validarParametros(parametrosPadrao("B3", ["MILHO", "DOLAR"])), ["ativos.DOLAR: roda numa carteira própria, sem outros ativos."]);
  assert.ok(validarParametros(parametrosPadrao("INTERNACIONAL", ["DOLAR"])).some((e) => e.includes("ativos.DOLAR: o ativo é da conta B3")));
  assert.equal(valorDoPonto("DOLAR", "B3"), 10);
});

test("versão gravada antes do adendo: o vencimento da execução vai para cada ativo, na leitura", () => {
  const atual = parametrosPadrao("B3", ["MILHO", "CAFE"]);
  const antigo = structuredClone(atual);
  for (const a of Object.values(antigo.ativos)) {
    delete a.diasUteisMinimosAteOLimite;
    delete a.diasUteisEncerrarAntesDoLimite;
    delete a.liquidezMinima;
  }
  Object.assign(antigo.execucao, { diasUteisMinimosAteOLimite: 30, diasUteisEncerrarAntesDoLimite: 15, liquidezMinima: 100 });
  const versoes = [{ versao: 1, tipo: "INICIAL", vigente_desde: "2026-10-14", parametros: antigo }];
  assert.deepEqual(resolverVigente(versoes, "2026-10-15"), atual);
  assert.equal(antigo.execucao.liquidezMinima, 100, "a versão gravada não muda");
  assert.equal(classificarMudanca(resolverVigente(versoes, "9999-12-31"), atual).erro, "Nada mudou: nenhuma versão nova.");
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

test("versões: o ajuste vale da data dele; a correção de custo vale desde o início, sem trazer o ajuste para trás", () => {
  const v1 = parametrosPadrao("B3", ["MILHO", "CAFE"]);
  const v2 = structuredClone(v1);
  v2.ativos.CAFE.riscoPct = 1.5;
  const v3 = structuredClone(v2);
  v3.ativos.MILHO.custoPorContrato = 1.2;
  const versoes = [
    { versao: 1, tipo: "INICIAL", vigente_desde: "2026-10-14", parametros: v1 },
    { versao: 2, tipo: "AJUSTE", vigente_desde: "2026-11-02", parametros: v2 },
    { versao: 3, tipo: "CORRECAO_CUSTO", vigente_desde: "2026-10-14", parametros: v3 }
  ];
  assert.equal(resolverVigente(versoes, "2026-10-13"), null);
  const antes = resolverVigente(versoes, "2026-10-20");
  assert.equal(antes.ativos.CAFE.riscoPct, 2);
  assert.equal(antes.ativos.MILHO.custoPorContrato, 1.2);
  const depois = resolverVigente(versoes, "2026-11-02");
  assert.equal(depois.ativos.CAFE.riscoPct, 1.5);
  assert.equal(depois.ativos.MILHO.custoPorContrato, 1.2);
  // A resolução não altera a versão guardada.
  assert.equal(v1.ativos.MILHO.custoPorContrato, null);
});

test("mudança: ajuste, correção de custo, as duas juntas (recusada) e nenhuma", () => {
  const atual = parametrosPadrao("B3", ["MILHO"]);
  const ajuste = structuredClone(atual);
  ajuste.carteira.maxPosicoes = 3;
  assert.deepEqual(classificarMudanca(atual, ajuste), { tipo: "AJUSTE" });
  const custo = structuredClone(atual);
  custo.ativos.MILHO.custoPorContrato = 1.2;
  assert.deepEqual(classificarMudanca(atual, custo), { tipo: "CORRECAO_CUSTO" });
  const misto = structuredClone(custo);
  misto.ativos.MILHO.riscoPct = 1;
  assert.match(classificarMudanca(atual, misto).erro, /versão à parte/);
  // A ordem das chaves não conta como mudança.
  const reordenado = { execucao: atual.execucao, carteira: atual.carteira, ativos: atual.ativos, conta: atual.conta, modelo: atual.modelo };
  assert.match(classificarMudanca(atual, reordenado).erro, /Nada mudou/);
});
