"use strict";

// O razão de uma trilha é append-only (ADR 0127, §9): o patrimônio de cada dia é o capital inicial mais a soma dos
// lançamentos até ele. `patrimonio_diario` é só uma projeção disto, recalculável (um registro tardio do operador
// acrescenta lançamentos com a data original, e a série é refeita).

const arred2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// `lancamentos`: [{ data, valor }]; `datas`: os dias da série (os pregões liquidados), em qualquer ordem. Um dia sem
// lançamento repete o patrimônio do anterior. -> [{ data, patrimonio }].
function serieDePatrimonio(capitalInicial, lancamentos, datas) {
  const porDia = new Map();
  for (const l of lancamentos) porDia.set(l.data, (porDia.get(l.data) || 0) + l.valor);
  const dias = [...new Set([...datas, ...porDia.keys()])].sort();
  let patrimonio = capitalInicial;
  return dias.map((data) => {
    patrimonio = arred2(patrimonio + (porDia.get(data) || 0));
    return { data, patrimonio };
  });
}

// O maior recuo desde o pico, em %. -> { pct, pico, vale } (datas), ou pct 0 numa série sem queda.
function drawdownMaximo(serie) {
  let pico = null;
  let pior = { pct: 0, pico: null, vale: null };
  for (const p of serie) {
    if (!pico || p.patrimonio > pico.patrimonio) pico = p;
    const pct = (1 - p.patrimonio / pico.patrimonio) * 100;
    if (pct > pior.pct) pior = { pct, pico: pico.data, vale: p.data };
  }
  return pior;
}

module.exports = { serieDePatrimonio, drawdownMaximo };
