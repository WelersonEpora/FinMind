"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { direcaoDaPersistencia, intencoesPersistencia, entradasComprarESegurar } = require("./referencias");
const { liquidar } = require("./motor");
const { parametrosPadrao } = require("./parametros");
const { validarIntencao } = require("./intencao");

test("Persistência: a direção pela faixa LATERAL do ativo", () => {
  assert.equal(direcaoDaPersistencia(2.5, 2), "ALTA");
  assert.equal(direcaoDaPersistencia(-2, 2), "BAIXA");
  assert.equal(direcaoDaPersistencia(1.99, 2), "LATERAL");
  assert.equal(direcaoDaPersistencia(null, 2), null);
});

test("Persistência: entra a favor, reduz quando lateral, prioridade pela força; contrato válido", () => {
  const intencoes = intencoesPersistencia({
    ativos: ["MILHO", "CAFE", "SOJA"],
    variacoes: { MILHO: -3, CAFE: 12, SOJA: 1 },
    t1PorAtivo: { MILHO: 2, CAFE: 5, SOJA: 2.6 },
    posicoes: { SOJA: { lado: "COMPRADO", reduzida: false } }
  });
  assert.deepEqual(intencoes.map((i) => [i.ativo, i.acao, i.prioridade]), [
    ["MILHO", "ENTRAR_VENDIDO", 2],
    ["CAFE", "ENTRAR_COMPRADO", 1],
    ["SOJA", "REDUZIR", 3]
  ]);
  for (const i of intencoes) assert.deepEqual(validarIntencao(i, { comPosicao: i.ativo === "SOJA" }), []);
  assert.equal(intencoesPersistencia({ ativos: ["MILHO"], variacoes: { MILHO: null }, t1PorAtivo: { MILHO: 2 } })[0].acao, "NAO_ENTRAR");
});

test("comprar e segurar: 1/n do patrimônio em cada ativo sem posição, sem stop", () => {
  const mercado = {
    MILHO: { contrato: { ticker: "CCMF27", limite: "2027-01-15" }, ajuste: 74, valorDoPonto: 450 },
    CAFE: { contrato: { ticker: "ICFZ26", limite: "2026-12-15" }, ajuste: 370, valorDoPonto: 500 },
    SOJA: null
  };
  const ordens = entradasComprarESegurar({ ativos: ["MILHO", "CAFE", "SOJA"], estado: { patrimonio: 9000, posicoes: [{ ativo: "CAFE" }] }, mercado });
  assert.equal(ordens.length, 1);
  assert.equal(ordens[0].ativo, "MILHO");
  assert.equal(ordens[0].semStop, true);
  assert.equal(ordens[0].quantidade, Math.floor((3000 / (74 * 450)) * 1e6) / 1e6);
});

test("posição sem stop: não sai por stop nem alvo, só marca no ajuste; sem resultado em R", () => {
  const p = parametrosPadrao("B3", ["MILHO"]);
  const entrada = liquidar({
    data: "2026-10-13",
    estado: { patrimonio: 10000, posicoes: [] },
    ordens: [{ tipo: "ENTRADA", ativo: "MILHO", lado: "COMPRADO", contrato: { ticker: "CCMF27", limite: "2027-01-15" }, quantidade: 0.1, semStop: true }],
    barras: { CCMF27: { ajuste: 74, maxima: 74.5, minima: 73.5 } },
    parametros: p
  });
  const pos = entrada.estado.posicoes[0];
  assert.deepEqual([pos.stop, pos.alvo1, pos.risco1R, pos.resultadoR], [null, null, null, null]);
  const queda = liquidar({ data: "2026-10-14", estado: entrada.estado, barras: { CCMF27: { ajuste: 60, maxima: 61, minima: 50 } }, parametros: p });
  assert.equal(queda.estado.posicoes.length, 1);
  assert.equal(queda.eventos.length, 0);
  assert.equal(queda.lancamentos.find((l) => l.tipo === "AJUSTE_DIARIO").valor, Math.round((60 - 74) * 0.1 * 450 * 100) / 100);
});

test("o câmbio só vai no lançamento do ativo cotado em dólar", () => {
  const p = parametrosPadrao("B3", ["MILHO", "CAFE"]);
  const r = liquidar({
    data: "2026-10-13",
    estado: { patrimonio: 10000, posicoes: [] },
    ordens: [
      { tipo: "ENTRADA", ativo: "MILHO", lado: "COMPRADO", contrato: { ticker: "CCMF27" }, quantidade: 0.1, semStop: true },
      { tipo: "ENTRADA", ativo: "CAFE", lado: "COMPRADO", contrato: { ticker: "ICFZ26" }, quantidade: 0.01, semStop: true }
    ],
    barras: { CCMF27: { ajuste: 74 }, ICFZ26: { ajuste: 370 } },
    parametros: p,
    cambio: 5.38
  });
  const doAtivo = (a) => r.lancamentos.find((l) => l.ativo === a && l.tipo === "AJUSTE_DIARIO");
  assert.equal(doAtivo("MILHO").cambio, null);
  assert.equal(doAtivo("CAFE").cambio, 5.38);
});
