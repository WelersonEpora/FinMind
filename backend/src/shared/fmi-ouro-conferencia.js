"use strict";

// Conferência de unidade do ouro do FMI (IRFCL, ADR 0036): o coletor marca, o fator dos bancos centrais deixa de fora.
// Alguns países reportam o volume numa unidade errada; só a comparação com o valor em US$ o revela: valor ÷ volume é
// um "preço implícito", que tem de ficar perto do dos demais países no mesmo mês. Uma regra só, usada nos dois lugares.

// Preço implícito fora de [mediana / FATOR, mediana × FATOR] no mesmo mês = volume (ou valor) fora da escala.
const FATOR_FAIXA = 3;
// Abaixo disso, a mediana do mês não é confiável e o mês não é conferido.
const MINIMO_PAISES_NO_MES = 5;

function mediana(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

// `pares`: Map("<pais>|<mes>" -> { VOLUME_MI_OZT, VALOR_MI_USD }) -> Map("<pais>|<mes>" -> { precoImplicito, mediana })
// dos pares fora da faixa.
function paresForaDaFaixa(pares) {
  const porMes = new Map();
  for (const [chave, par] of pares) {
    if (!(par.VOLUME_MI_OZT > 0 && par.VALOR_MI_USD > 0)) continue;
    const mes = chave.split("|")[1];
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push({ chave, preco: par.VALOR_MI_USD / par.VOLUME_MI_OZT });
  }
  const fora = new Map();
  for (const lista of porMes.values()) {
    if (lista.length < MINIMO_PAISES_NO_MES) continue;
    const m = mediana(lista.map((p) => p.preco));
    for (const { chave, preco } of lista) {
      if (preco < m / FATOR_FAIXA || preco > m * FATOR_FAIXA) fora.set(chave, { precoImplicito: preco, mediana: m });
    }
  }
  return fora;
}

module.exports = { FATOR_FAIXA, MINIMO_PAISES_NO_MES, paresForaDaFaixa };
