"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const v = require("./regra-f4f5-validacao");

const ALTA = (intensidade) => ({ direcao: "ALTA", intensidade });

test("os escores congelados (ADR 0147): a R1 ignora a alta fraca; o F5 conta a baixa", () => {
  assert.deepEqual([ALTA("FORTE"), ALTA("MODERADA"), ALTA("FRACA")].map(v.escoreR1), [3, 2, 0]);
  assert.deepEqual([ALTA("FORTE"), ALTA("FRACA"), { direcao: "BAIXA", intensidade: "MODERADA" }, { direcao: "NEUTRA", intensidade: "FRACA" }].map(v.escoreF5), [3, 1, -2, 0]);
  assert.equal(v.escoreF5(null), null);
});

test("retornoDepois: do 1º pregão depois da data até N pregões depois; null sem o período", () => {
  const serie = { datas: ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"], valores: [100, 110, 121, 133.1] };
  assert.equal(Math.round(v.retornoDepois(serie, "2026-01-02", 2) * 100) / 100, 21);
  assert.equal(v.retornoDepois(serie, "2026-01-05", 5), null);
});

test("episodios: um sinal só abre episódio novo com 26 semanas ou mais desde o último", () => {
  const lista = Array.from({ length: 80 }, (_, i) => ({ semana: `s${i}`, escore: [0, 1, 2, 30, 60].includes(i) ? 2 : 0 }));
  assert.deepEqual(v.episodios(lista, (a) => a.escore > 0), ["s0", "s30", "s60"]);
});

test("avaliarLado: passa com a diferença de 10 p.p., o IC positivo e 3 episódios; com menos episódios, inconclusivo", () => {
  const lista = [];
  for (let i = 0; i < 120; i += 1) {
    const sinal = i % 40 === 0;
    lista.push({ semana: `s${i}`, escore: sinal ? 2 : 0, retorno: sinal ? 10 : i % 2 ? 1 : -1 });
  }
  const r = v.avaliar(lista, ["ALTA"]);
  assert.equal(r.lados[0].episodios.length, 3);
  assert.equal(Math.round(r.lados[0].diferencaPp * 10) / 10, 48.7);
  assert.equal(r.lados[0].veredito, "PASSA");
  assert.equal(v.avaliarLado(lista.slice(0, 50), "ALTA", r.ic).veredito, "INCONCLUSIVO");
});
