"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { medirMomentum, textoMomentum, calcularMomentumKc } = require("./momentum-kc");
const { somarDias } = require("./base/semana-de-dias");
const { primeiroVencimentoKc } = require("./basis-icf-kc");

// Dias úteis a partir de `inicio`, com o valor de cada um por `valorDe(i)`.
function serie(n, valorDe, inicio = "2025-01-06") {
  const out = [];
  let dia = inicio;
  while (out.length < n) {
    if (![0, 6].includes(new Date(`${dia}T00:00:00Z`).getUTCDay())) out.push({ data: dia, valor: valorDe(out.length) });
    dia = somarDias(dia, 1);
  }
  return out;
}

test("momentum (ADR 0139): o retorno de 5, 20 e 60 pregões e o z pela volatilidade de 60; sem 121 pregões, nada", () => {
  // Sobe e desce 1% em dias alternados (volatilidade ~1%), e sobe 2% por dia nos últimos 5 pregões.
  const kc = serie(130, () => 100);
  for (let i = 1; i < kc.length; i += 1) kc[i].valor = kc[i - 1].valor * (i >= 125 ? 1.02 : i % 2 ? 1.01 : 1 / 1.01);
  const m = medirMomentum(kc);
  assert.equal(m.data, kc.at(-1).data);
  assert.deepEqual(m.janelas.map((j) => j.pregoes), [5, 20, 60]);
  const [j5] = m.janelas;
  assert.equal(j5.retornoPct, Math.round((1.02 ** 5 - 1) * 10000) / 100);
  assert.ok(j5.z > 2, `z5 ${j5.z}`);
  assert.equal(medirMomentum(kc.slice(0, 120)), null);
});

test("momentum: a troca de vencimento do KC não conta como movimento", () => {
  // Preço parado, com um salto de 10% no dia em que o 1º vencimento muda (a rolagem), 10 pregões antes do fim.
  const kc = serie(200, () => 100, "2026-01-05");
  const venc = (d) => JSON.stringify(primeiroVencimentoKc(d));
  const rolagens = kc.map((d, i) => (i > 0 && venc(d.data) !== venc(kc[i - 1].data) ? i : null)).filter((i) => i !== null);
  const rolagem = rolagens.at(-1);
  assert.ok(rolagem > kc.length - 60, "a rolagem cai dentro dos últimos 60 pregões");
  for (let i = rolagem; i < kc.length; i += 1) kc[i].valor = 110;
  const m = medirMomentum(kc);
  // Sem nenhum movimento fora da rolagem: retorno 0 e volatilidade 0 (sem z).
  assert.deepEqual(m.janelas.map((j) => j.retornoPct), [0, 0, 0]);
  assert.equal(m.volatilidadeDiariaPct, 0);
});

test("momentum: o texto do prompt diz o tamanho de cada z, a validação e que não é fator; sem dado, diz isso", () => {
  const texto = textoMomentum({ data: "2026-10-20", kc: 311.3, volatilidadeDiariaPct: 2.1, janelas: [{ pregoes: 5, retornoPct: 5.6, z: 1.18 }, { pregoes: 20, retornoPct: 12.1, z: 2.3 }, { pregoes: 60, retornoPct: -0.5, z: -0.05 }] });
  assert.match(texto, /em 20\/10\/2026: 311,30 US¢\/lb/);
  assert.match(texto, /- 5 pregões: \+5,60% \| z \+1,18 \(alta acima do normal\)/);
  assert.match(texto, /- 20 pregões: \+12,10% \| z \+2,30 \(alta extrema\)/);
  assert.match(texto, /- 60 pregões: -0,50% \| z -0,05 \(dentro do normal\)/);
  assert.match(texto, /seguir a tendência NÃO funcionou no café/);
  assert.match(texto, /não entra em fatoresAFavor nem em fatoresContra/);
  assert.match(textoMomentum(null), /^SEM DADO/);
});

test("momentum: lê o KC conhecido no fim do dia da análise (point-in-time)", async () => {
  let pedido = null;
  const obterAsOf = async (args) => {
    pedido = args;
    return serie(130, (i) => 100 + i).map((p) => ({ observedAt: p.data, value: p.valor }));
  };
  const r = await calcularMomentumKc({ data: "2026-10-20" }, { obterAsOf });
  assert.deepEqual(pedido.seriesCodes, ["YAHOO.KC_CONTINUO.SETTLE"]);
  assert.equal(pedido.asOf.toISOString(), "2026-10-21T02:59:59.999Z");
  assert.ok(r.momentum);
  assert.match(r.texto, /^KC de Nova York/);
});
