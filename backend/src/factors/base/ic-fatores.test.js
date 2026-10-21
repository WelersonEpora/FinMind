"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { escoreDaLeitura, spearman, ajustarRolagem, pregaoDepois, intervaloBootstrap, icDoFator } = require("./ic-fatores");

test("IC (ADR 0141): a leitura C em número", () => {
  assert.equal(escoreDaLeitura({ direcao: "ALTA", intensidade: "FORTE" }), 2);
  assert.equal(escoreDaLeitura({ direcao: "BAIXA", intensidade: "MODERADA" }), -1);
  assert.equal(escoreDaLeitura({ direcao: "ALTA", intensidade: "FRACA" }), 0.5);
  assert.equal(escoreDaLeitura({ direcao: "NEUTRA", intensidade: "FRACA" }), 0);
  assert.equal(escoreDaLeitura(null), null);
});

test("Spearman: 1 na mesma ordem, -1 na inversa, com empates; null com poucos pares", () => {
  const x = Array.from({ length: 30 }, (_, i) => i);
  assert.equal(spearman(x, x.map((v) => v * v)), 1);
  assert.equal(spearman(x, x.map((v) => -v)), -1);
  assert.ok(Math.abs(spearman(x.map((v) => Math.floor(v / 3)), x) - 0.989) < 0.01);
  assert.equal(spearman([1, 2, 3], [1, 2, 3]), null);
});

test("a rolagem zera o retorno do dia da troca; o pregão seguinte a uma data", () => {
  const precos = [
    { data: "2026-01-01", valor: 100 },
    { data: "2026-01-02", valor: 110 },
    { data: "2026-02-01", valor: 200 },
    { data: "2026-02-02", valor: 220 }
  ];
  assert.deepEqual(ajustarRolagem(precos, (d) => d.slice(0, 7)).map((v) => Math.round(v)), [100, 110, 110, 121]);
  assert.equal(pregaoDepois(["2026-01-01", "2026-01-02", "2026-01-05"], "2026-01-02"), 2);
  assert.equal(pregaoDepois(["2026-01-01"], "2026-01-02"), -1);
});

test("o IC de um fator que antecipa o preço é positivo, com o intervalo do bootstrap acima de zero", () => {
  // O preço sobe 1% por pregão quando o fator diz alta e cai 1% quando diz baixa, em blocos de 10 pregões.
  const datas = [];
  const ajustado = [100];
  const pontos = [];
  let dia = new Date("2020-01-01T00:00:00Z");
  for (let i = 0; i < 1500; i += 1) {
    datas.push(dia.toISOString().slice(0, 10));
    dia = new Date(dia.getTime() + 86400000);
  }
  const sinal = (i) => (Math.floor(i / 10) % 3 === 0 ? -1 : 1);
  for (let i = 1; i < datas.length; i += 1) ajustado.push(ajustado[i - 1] * (1 + sinal(i) / 100));
  for (let i = 0; i < datas.length - 10; i += 5) pontos.push({ semana: datas[i], disponivelEm: datas[i], escore: sinal(i + 1) });
  const r = icDoFator(pontos, { datas, ajustado }, [1]);
  assert.equal(r.n, pontos.length);
  const [prazo] = r.prazos;
  assert.ok(prazo.ic > 0.5, `ic ${prazo.ic}`);
  assert.ok(prazo.intervalo[0] > 0, `intervalo ${prazo.intervalo}`);
  assert.ok(prazo.janelasPositivas.positivas / prazo.janelasPositivas.total > 0.9);
});

test("bootstrap: sem pares bastantes, sem intervalo; o mesmo intervalo a cada execução", () => {
  assert.equal(intervaloBootstrap([{ escore: 1, retorno: 1 }]), null);
  const pares = Array.from({ length: 200 }, (_, i) => ({ escore: i % 7, retorno: (i * 37) % 11 }));
  assert.deepEqual(intervaloBootstrap(pares), intervaloBootstrap(pares));
});
