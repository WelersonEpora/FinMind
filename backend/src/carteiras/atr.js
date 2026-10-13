"use strict";

// ATR (average true range) de Wilder, o do piso do stop da Cartilha (Tabela 2: 1,5× o ATR(14) diário).
//
//   true range do dia = o maior entre: máxima − mínima; |máxima − ajuste anterior|; |mínima − ajuste anterior|
//   ATR inicial      = a média simples dos `periodo` primeiros true ranges
//   ATR seguinte     = (ATR anterior × (periodo − 1) + true range do dia) / periodo
//
// Um dia sem máxima nem mínima (contrato sem negócio na B3; o Brent, que só tem o ajuste) usa o ajuste nas duas: o true
// range vira |ajuste − ajuste anterior|. O 1º dia da série só serve de ajuste anterior. Precisa de `periodo + 1` dias;
// com menos, null (o motor bloqueia a entrada: SEM_ATR). Cada vencimento é uma série própria, nada é emendado.

function trueRange(barra, ajusteAnterior) {
  const maxima = barra.maxima ?? barra.ajuste;
  const minima = barra.minima ?? barra.ajuste;
  return Math.max(maxima - minima, Math.abs(maxima - ajusteAnterior), Math.abs(minima - ajusteAnterior));
}

// `barras`: [{ data, ajuste, maxima?, minima? }], em qualquer ordem (ordena pela data). -> o ATR no último dia, ou null.
function calcularAtr(barras, periodo = 14) {
  const ordenadas = [...barras].filter((b) => Number.isFinite(b?.ajuste)).sort((a, b) => a.data.localeCompare(b.data));
  if (ordenadas.length < periodo + 1) return null;
  const ranges = [];
  for (let i = 1; i < ordenadas.length; i += 1) ranges.push(trueRange(ordenadas[i], ordenadas[i - 1].ajuste));
  let atr = ranges.slice(0, periodo).reduce((soma, tr) => soma + tr, 0) / periodo;
  for (let i = periodo; i < ranges.length; i += 1) atr = (atr * (periodo - 1) + ranges[i]) / periodo;
  return atr;
}

module.exports = { trueRange, calcularAtr };
