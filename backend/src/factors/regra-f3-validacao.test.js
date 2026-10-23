"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { leituraDaRegra, sinaisMensais, retornoDepois, amostras, avaliar } = require("./regra-f3-validacao");

test("a regra congelada (ADR 0143): abaixo do percentil 10, baixa moderada; do 10 ao 20, baixa fraca; o resto, neutra", () => {
  assert.deepEqual(leituraDaRegra(9.9), { codigo: "BAIXA_MODERADA", escore: -2 });
  assert.deepEqual(leituraDaRegra(10), { codigo: "BAIXA_FRACA", escore: -1 });
  assert.deepEqual(leituraDaRegra(20), { codigo: "NEUTRA", escore: 0 });
  assert.deepEqual(leituraDaRegra(95), { codigo: "NEUTRA", escore: 0 });
  assert.equal(leituraDaRegra(null), null);
});

test("desenho A: a variação mensal e o percentil contra os meses anteriores, só com o mínimo de meses", () => {
  // 40 meses de +1% e um de −10%: o último cai no percentil 0.
  const meses = [];
  let valor = 100;
  for (let i = 0; i < 41; i += 1) {
    valor *= i === 40 ? 0.9 : 1.01;
    meses.push({ mes: `20${String(10 + Math.floor(i / 12)).padStart(2, "0")}-${String((i % 12) + 1).padStart(2, "0")}`, valor, publicadoEm: `d${i}` });
  }
  const sinais = sinaisMensais(meses, { janela: 60, minimo: 36 });
  assert.equal(sinais[0].medida, null);
  assert.equal(sinais[36].leitura, null); // 35 variações anteriores: abaixo do mínimo
  assert.ok(sinais[37].leitura);
  assert.equal(sinais[40].percentil, 0);
  assert.equal(sinais[40].leitura.codigo, "BAIXA_MODERADA");
  assert.equal(sinais[40].data, "d40");
});

test("o retorno parte do 1º pregão depois da data e precisa do período completo", () => {
  const kc = { datas: ["2020-01-01", "2020-01-02", "2020-01-03", "2020-01-04"], ajustado: [100, 110, 121, 133.1] };
  assert.ok(Math.abs(retornoDepois(kc, "2020-01-01", 2) - 21) < 1e-9);
  assert.equal(retornoDepois(kc, "2020-01-02", 2), null);
});

const amostra = (escore, retorno) => ({ leitura: { escore }, retorno });

test("o critério pré-registrado (ADR 0145): passa, não passa e inconclusivo", () => {
  // Sinais em 3 episódios separados, sempre com queda; sem sinal, quase sempre alta.
  const passa = [amostra(-2, -5), amostra(0, 3), amostra(-1, -2), amostra(0, 4), amostra(0, 1), amostra(-2, -3), amostra(0, 2), amostra(0, -1)];
  const r = avaliar(passa);
  assert.equal(r.episodios, 3);
  assert.equal(r.comSinal.subiuPct, 0);
  assert.equal(r.semSinal.subiuPct, 80);
  assert.equal(r.diferencaPp, 80);
  assert.ok(r.ic > 0);
  assert.equal(r.veredito, "PASSA");

  // O sentido oposto: depois do sinal, alta.
  const oposto = passa.map((a) => amostra(a.leitura.escore, a.leitura.escore < 0 ? -a.retorno : -a.retorno));
  assert.equal(avaliar(oposto).veredito, "NAO_PASSA");

  // Dois episódios só: inconclusivo, qualquer que seja o resultado.
  const poucos = [amostra(-2, -5), amostra(-1, -4), amostra(0, 3), amostra(0, 4), amostra(-2, -3), amostra(0, 2)];
  assert.equal(avaliar(poucos).episodios, 2);
  assert.equal(avaliar(poucos).veredito, "INCONCLUSIVO");

  // As amostras sem leitura ou sem retorno ficam de fora.
  const kc = { datas: ["a", "b", "c"], ajustado: [1, 1, 1] };
  assert.equal(amostras([{ data: "a", leitura: null }, { data: "a", leitura: { escore: 0 } }], kc, 1).length, 1);
});
