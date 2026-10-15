"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decidir, liquidar, conferirEntradaDoOperador } = require("./motor");
const { parametrosPadrao } = require("./parametros");
const { somarDiasUteis } = require("./calendario");

const DATA = "2026-10-13";
const PTAX = 5.38;
const proximo = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

function parametros() {
  const p = parametrosPadrao("B3", ["MILHO", "CAFE", "SOJA"]);
  for (const a of Object.values(p.ativos)) a.custoPorContrato = 0;
  return p;
}
const MERCADO = {
  MILHO: { contrato: { ticker: "CCMF27", limite: "2027-01-15" }, atr: 1.12, valorDoPonto: 450 },
  CAFE: { contrato: { ticker: "ICFZ26", limite: "2026-12-15" }, atr: 11.39, valorDoPonto: 100 * PTAX },
  SOJA: { contrato: { ticker: "SJCF27", limite: "2026-12-25" }, atr: 0.41, valorDoPonto: 450 * PTAX }
};
const intencao = (ativo, acao, prioridade = 1, trilha = "DETERMINISTICA") => ({ trilha, ativo, acao, prioridade, origem: "REGRA", referencia: null, plano: null });
const posicao = (ativo, ticker, extra = {}) => ({
  id: `pos-${ativo}`,
  ativo,
  lado: "COMPRADO",
  contrato: { ticker, limite: MERCADO[ativo].contrato.limite },
  entrada: 68,
  distancia: 1.68,
  stop: 66.32,
  alvo1: 69.68,
  alvo2: 73.04,
  quantidadeInicial: 0.264,
  quantidadeAberta: 0.264,
  alvo1Atingido: false,
  reduzida: false,
  ultimoAjuste: 68.5,
  resultadoR: 0,
  resultadoMoeda: 0,
  ...extra
});

// --- decidir

test("entrada automática: tamanho pela fórmula, contrato e distância; nenhum preço na ordem (o de D só na liquidação)", () => {
  const { ordens, bloqueios } = decidir({ data: DATA, estado: { patrimonio: 10095, posicoes: [] }, intencoes: [intencao("SOJA", "ENTRAR_VENDIDO")], mercado: MERCADO, parametros: parametros() });
  assert.deepEqual(bloqueios, []);
  assert.equal(ordens.length, 1);
  const [o] = ordens;
  assert.equal(o.tipo, "ENTRADA");
  assert.equal(o.lado, "VENDIDO");
  assert.equal(o.contrato.ticker, "SJCF27");
  proximo(o.distancia, 0.615);
  proximo(o.quantidade, 201.9 / (0.615 * 450 * PTAX), 1e-6);
  assert.ok(!("preco" in o) && !("stop" in o));
});

test("máximo de 2 posições: bloqueia a 3ª entrada; uma saída no mesmo dia libera a vaga", () => {
  const estado = { patrimonio: 10000, posicoes: [posicao("MILHO", "CCMF27"), posicao("CAFE", "ICFZ26")] };
  const cheio = decidir({ data: DATA, estado, intencoes: [intencao("MILHO", "MANTER"), intencao("CAFE", "MANTER"), intencao("SOJA", "ENTRAR_VENDIDO")], mercado: MERCADO, parametros: parametros() });
  assert.deepEqual(cheio.bloqueios.map((b) => [b.ativo, b.motivo]), [["SOJA", "MAX_POSICOES"]]);

  const liberado = decidir({ data: DATA, estado, intencoes: [intencao("MILHO", "MANTER"), intencao("CAFE", "ZERAR"), intencao("SOJA", "ENTRAR_VENDIDO")], mercado: MERCADO, parametros: parametros() });
  assert.deepEqual(liberado.ordens.map((o) => [o.ativo, o.tipo]), [["CAFE", "SAIDA"], ["SOJA", "ENTRADA"]]);
});

test("a prioridade decide quem fica com a última vaga", () => {
  const estado = { patrimonio: 10000, posicoes: [posicao("MILHO", "CCMF27")] };
  const r = decidir({ data: DATA, estado, intencoes: [intencao("MILHO", "MANTER", 3), intencao("CAFE", "ENTRAR_VENDIDO", 2), intencao("SOJA", "ENTRAR_VENDIDO", 1)], mercado: MERCADO, parametros: parametros() });
  assert.deepEqual(r.ordens.map((o) => o.ativo), ["SOJA"]);
  assert.deepEqual(r.bloqueios.map((b) => [b.ativo, b.motivo]), [["CAFE", "MAX_POSICOES"]]);
});

test("trava bloqueia entrada, nunca reduzir nem zerar", () => {
  const travas = { bloqueiaNovasEntradas: true, travas: [{ codigo: "PERDA_SEMANAL" }] };
  const estado = { patrimonio: 9200, posicoes: [posicao("MILHO", "CCMF27")] };
  const r = decidir({ data: DATA, estado, intencoes: [intencao("MILHO", "ZERAR"), intencao("SOJA", "ENTRAR_VENDIDO")], mercado: MERCADO, parametros: parametros(), travas });
  assert.deepEqual(r.ordens.map((o) => [o.ativo, o.tipo]), [["MILHO", "SAIDA"]]);
  assert.deepEqual(r.bloqueios.map((b) => [b.ativo, b.motivo, b.detalhe]), [["SOJA", "TRAVA", "PERDA_SEMANAL"]]);
});

test("reduzir: metade, uma vez por operação", () => {
  const p = parametros();
  const r = decidir({ data: DATA, estado: { patrimonio: 10000, posicoes: [posicao("MILHO", "CCMF27")] }, intencoes: [intencao("MILHO", "REDUZIR")], mercado: MERCADO, parametros: p });
  assert.equal(r.ordens[0].tipo, "REDUCAO");
  assert.equal(r.ordens[0].quantidade, 0.132);
  const de_novo = decidir({ data: DATA, estado: { patrimonio: 10000, posicoes: [posicao("MILHO", "CCMF27", { reduzida: true })] }, intencoes: [intencao("MILHO", "REDUZIR")], mercado: MERCADO, parametros: p });
  assert.deepEqual(de_novo.bloqueios.map((b) => b.motivo), ["JA_REDUZIDA"]);
});

test("vencimento: sai 15 dias úteis antes do limite, mesmo com a intenção de manter", () => {
  const p = parametros();
  const pos = (limite) => posicao("MILHO", "CCMX26", { contrato: { ticker: "CCMX26", limite } });
  const sai = decidir({ data: DATA, estado: { patrimonio: 10000, posicoes: [pos(somarDiasUteis(DATA, 15))] }, intencoes: [intencao("MILHO", "MANTER")], mercado: MERCADO, parametros: p });
  assert.deepEqual(sai.ordens.map((o) => [o.tipo, o.motivo]), [["SAIDA", "VENCIMENTO"]]);
  const fica = decidir({ data: DATA, estado: { patrimonio: 10000, posicoes: [pos(somarDiasUteis(DATA, 16))] }, intencoes: [intencao("MILHO", "MANTER")], mercado: MERCADO, parametros: p });
  assert.deepEqual(fica.ordens, []);
});

test("vencimento por ativo: o dólar sai 2 dias úteis antes do limite e entra com mais de 3 até ele", () => {
  const p = parametrosPadrao("B3", ["DOLAR"]);
  const mercadoDolar = (limite) => ({ ...MERCADO, DOLAR: { contrato: { ticker: "WDOX26", limite }, atr: 30, valorDoPonto: 10 } });
  const pos = (limite) => ({ ...posicao("MILHO", "WDOX26"), id: "pos-DOLAR", ativo: "DOLAR", contrato: { ticker: "WDOX26", limite } });
  const decide = (limite, intencoes, posicoes = []) => decidir({ data: DATA, estado: { patrimonio: 10000, posicoes }, intencoes, mercado: mercadoDolar(limite), parametros: p });

  assert.deepEqual(decide(somarDiasUteis(DATA, 2), [intencao("DOLAR", "MANTER")], [pos(somarDiasUteis(DATA, 2))]).ordens.map((o) => o.motivo), ["VENCIMENTO"]);
  assert.deepEqual(decide(somarDiasUteis(DATA, 3), [intencao("DOLAR", "MANTER")], [pos(somarDiasUteis(DATA, 3))]).ordens, []);
  assert.equal(decide(somarDiasUteis(DATA, 2), [intencao("DOLAR", "ENTRAR_COMPRADO")]).bloqueios[0].motivo, "VENCIMENTO_PROXIMO");
  assert.deepEqual(decide(somarDiasUteis(DATA, 3), [intencao("DOLAR", "ENTRAR_COMPRADO")]).ordens.map((o) => [o.ativo, o.tipo]), [["DOLAR", "ENTRADA"]]);
});

test("entrada recusada: contrato perto do limite, sem ATR, sem câmbio, ação que não vale no estado, ativo fora da carteira", () => {
  const p = parametros();
  const mercado = {
    MILHO: { ...MERCADO.MILHO, contrato: { ticker: "CCMX26", limite: somarDiasUteis(DATA, 29) } },
    CAFE: { ...MERCADO.CAFE, atr: null },
    SOJA: { ...MERCADO.SOJA, valorDoPonto: null }
  };
  const r = decidir({
    data: DATA,
    estado: { patrimonio: 10000, posicoes: [] },
    intencoes: [intencao("MILHO", "ENTRAR_COMPRADO", 1), intencao("CAFE", "ENTRAR_VENDIDO", 2), intencao("SOJA", "ENTRAR_VENDIDO", 3), intencao("OURO", "ENTRAR_COMPRADO", 4)],
    mercado,
    parametros: p
  });
  assert.deepEqual(r.ordens, []);
  assert.deepEqual(r.bloqueios.map((b) => [b.ativo, b.motivo]), [
    ["OURO", "ATIVO_FORA_DA_CARTEIRA"],
    ["MILHO", "VENCIMENTO_PROXIMO"],
    ["CAFE", "SEM_ATR"],
    ["SOJA", "SEM_CAMBIO"]
  ]);
  const invalida = decidir({ data: DATA, estado: { patrimonio: 10000, posicoes: [posicao("MILHO", "CCMF27")] }, intencoes: [intencao("MILHO", "ENTRAR_COMPRADO")], mercado: MERCADO, parametros: p });
  assert.equal(invalida.bloqueios[0].motivo, "INTENCAO_INVALIDA");
});

// --- liquidar

const estadoMilho = (extra = {}) => ({ patrimonio: 10000, posicoes: [posicao("MILHO", "CCMF27", extra)] });

test("stop tocado pela mínima: sai no stop menos a slippage, −1R", () => {
  const r = liquidar({ data: DATA, estado: estadoMilho(), barras: { CCMF27: { ajuste: 66.9, maxima: 68.6, minima: 66.2 } }, parametros: parametros() });
  assert.equal(r.estado.posicoes.length, 0);
  const [enc] = r.encerradas;
  assert.equal(enc.motivoSaida, "STOP");
  assert.equal(r.eventos[0].preco, 66.3);
  proximo(enc.resultadoR, (66.3 - 68) / 1.68, 1e-4);
  // A marcação realiza do último ajuste (68,50) ao preço de saída.
  assert.equal(r.lancamentos.find((l) => l.tipo === "AJUSTE_DIARIO").valor, Math.round((66.3 - 68.5) * 0.264 * 450 * 100) / 100);
});

test("gap: o dia inteiro abaixo do stop sai ao preço médio do dia", () => {
  const r = liquidar({ data: DATA, estado: estadoMilho(), barras: { CCMF27: { ajuste: 65.5, maxima: 66, minima: 65.1, medio: 65.6 } }, parametros: parametros() });
  assert.equal(r.eventos[0].preco, 65.6);
});

test("stop e alvo no mesmo dia: conta o stop", () => {
  const r = liquidar({ data: DATA, estado: estadoMilho(), barras: { CCMF27: { ajuste: 68, maxima: 70, minima: 66 } }, parametros: parametros() });
  assert.deepEqual(r.eventos.map((e) => e.tipo), ["STOP"]);
});

test("alvo 1: sai 50% e o stop vai para a entrada; alvo 2 encerra em +2R", () => {
  const p = parametros();
  const d1 = liquidar({ data: "2026-10-13", estado: estadoMilho(), barras: { CCMF27: { ajuste: 69.5, maxima: 69.9, minima: 68.4 } }, parametros: p });
  const [pos] = d1.estado.posicoes;
  assert.equal(pos.quantidadeAberta, 0.132);
  assert.equal(pos.alvo1Atingido, true);
  assert.equal(pos.stop, 68);
  proximo(pos.resultadoR, 0.5);
  const d2 = liquidar({ data: "2026-10-14", estado: d1.estado, barras: { CCMF27: { ajuste: 73, maxima: 73.2, minima: 69.4 } }, parametros: p });
  assert.equal(d2.estado.posicoes.length, 0);
  proximo(d2.encerradas[0].resultadoR, 2);
  assert.equal(d2.encerradas[0].motivoSaida, "ALVO2");
});

test("marcação no ajuste, custo por contrato e rendimento do caixa", () => {
  const p = parametros();
  p.ativos.MILHO.custoPorContrato = 1.2;
  const r = liquidar({
    data: DATA,
    estado: estadoMilho(),
    ordens: [{ tipo: "ENTRADA", ativo: "SOJA", lado: "VENDIDO", contrato: MERCADO.SOJA.contrato, quantidade: 0.1, distancia: 0.615 }],
    barras: { CCMF27: { ajuste: 69, maxima: 69.2, minima: 68.4 }, SJCF27: { ajuste: 23.8, maxima: 24, minima: 23.6 } },
    parametros: p,
    cambio: PTAX,
    taxaCaixaDia: 0.0005
  });
  const valor = (tipo, ativo) => r.lancamentos.find((l) => l.tipo === tipo && l.ativo === ativo)?.valor;
  assert.equal(valor("AJUSTE_DIARIO", "MILHO"), 59.4);
  // Venda a 23,78 (ajuste menos 2 ticks), marcada a 23,80: −0,02 × 0,1 × 450 × 5,38.
  assert.equal(valor("AJUSTE_DIARIO", "SOJA"), -4.84);
  assert.equal(r.lancamentos.find((l) => l.tipo === "RENDIMENTO_CAIXA").valor, 5);
  const soja = r.estado.posicoes.find((x) => x.ativo === "SOJA");
  proximo(soja.entrada, 23.78);
  proximo(soja.stop, 24.395);
  proximo(soja.alvo2, 23.78 - 3 * 0.615);
  assert.equal(r.estado.patrimonio, 10000 + 59.4 - 4.84 + 5);
});

test("o custo por contrato entra a cada execução", () => {
  const p = parametros();
  p.ativos.MILHO.custoPorContrato = 2;
  const r = liquidar({ data: DATA, estado: estadoMilho(), ordens: [{ tipo: "SAIDA", motivo: "INTENCAO", ativo: "MILHO", lado: "COMPRADO", posicaoId: "pos-MILHO", contrato: { ticker: "CCMF27" } }], barras: { CCMF27: { ajuste: 69, maxima: 69.2, minima: 68.4 } }, parametros: p });
  assert.equal(r.lancamentos.find((l) => l.tipo === "CUSTO").valor, -0.53);
  assert.equal(r.resolucoes[0].preco, 68.98);
});

test("ordens: sem pregão expira; preço do operador fora da faixa é recusado; saída de posição já parada expira", () => {
  const p = parametros();
  const entrada = { tipo: "ENTRADA", ativo: "MILHO", lado: "COMPRADO", contrato: { ticker: "CCMF27", limite: "2027-01-15" }, quantidade: 0.2, distancia: 1.68 };
  assert.equal(liquidar({ data: DATA, estado: { patrimonio: 10000, posicoes: [] }, ordens: [entrada], barras: {}, parametros: p }).resolucoes[0].motivo, "SEM_PREGAO");
  const operador = { ...entrada, precoInformado: 70, stopInformado: 68 };
  const fora = liquidar({ data: DATA, estado: { patrimonio: 10000, posicoes: [] }, ordens: [operador], barras: { CCMF27: { ajuste: 68.5, maxima: 68.9, minima: 68.1 } }, parametros: p });
  assert.deepEqual([fora.resolucoes[0].situacao, fora.resolucoes[0].motivo], ["REJEITADA", "FORA_DA_FAIXA"]);
  const dentro = liquidar({ data: DATA, estado: { patrimonio: 10000, posicoes: [] }, ordens: [{ ...operador, precoInformado: 68.4, stopInformado: 66.6 }], barras: { CCMF27: { ajuste: 68.5, maxima: 68.9, minima: 68.1 } }, parametros: p });
  const pos = dentro.estado.posicoes[0];
  assert.equal(pos.entrada, 68.4);
  proximo(pos.distancia, 1.8);
  proximo(pos.alvo1, 70.2);

  const saida = { tipo: "SAIDA", motivo: "INTENCAO", ativo: "MILHO", lado: "COMPRADO", posicaoId: "pos-MILHO", contrato: { ticker: "CCMF27" } };
  const parada = liquidar({ data: DATA, estado: estadoMilho(), ordens: [saida], barras: { CCMF27: { ajuste: 66.9, maxima: 68.6, minima: 66.2 } }, parametros: p });
  assert.deepEqual([parada.resolucoes[0].situacao, parada.resolucoes[0].motivo], ["EXPIRADA", "POSICAO_ENCERRADA"]);
});

test("sem a PTAX do dia, a liquidação de café e soja fica pendente", () => {
  const r = liquidar({ data: DATA, estado: { patrimonio: 10000, posicoes: [posicao("CAFE", "ICFZ26")] }, barras: {}, parametros: parametros() });
  assert.deepEqual(r, { pendente: "SEM_CAMBIO" });
});

test("sem barra do contrato, a posição não é avaliada nem marcada", () => {
  const r = liquidar({ data: DATA, estado: estadoMilho(), barras: {}, parametros: parametros() });
  assert.equal(r.estado.posicoes[0].ultimoAjuste, 68.5);
  assert.deepEqual(r.lancamentos, []);
});

test("operador: plano, vagas e travas numa conferência só", () => {
  const p = parametros();
  const base = { data: DATA, ativo: "MILHO", lado: "COMPRADO", entrada: 68.4, stop: 66.6, mercado: MERCADO, parametros: p };
  assert.equal(conferirEntradaDoOperador({ ...base, estado: { patrimonio: 10412, posicoes: [] } }).aprovado, true);
  const cheio = conferirEntradaDoOperador({ ...base, estado: { patrimonio: 10412, posicoes: [posicao("CAFE", "ICFZ26"), posicao("SOJA", "SJCF27")] } });
  assert.equal(cheio.aprovado, false);
  assert.equal(cheio.verificacoes.find((v) => v.codigo === "VAGAS_E_TRAVAS").detalhe, "MAX_POSICOES");
});
