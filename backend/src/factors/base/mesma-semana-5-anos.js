"use strict";

// Comparação comum aos fatores lidos contra o normal da época (ADR 0050): os estoques e a margem de refino. A
// "mesma semana" de k anos antes é a semana 52k semanas antes (a mesma sexta da semana, sem cair num dia útil
// diferente); a média usa os 5 anos anteriores, como a EIA compara os estoques no relatório, e é nula se faltar
// qualquer um deles (nunca uma média de 4 anos).

const ANOS = 5;
const DIAS_SEMANA = 7;
const SEMANAS_ANO = 52;

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// `valorEm(data)`: o valor da semana (número) ou null/undefined quando não há.
function mediaMesmaSemana(valorEm, data, anos = ANOS) {
  let soma = 0;
  for (let k = 1; k <= anos; k += 1) {
    const valor = valorEm(somarDias(data, -DIAS_SEMANA * SEMANAS_ANO * k));
    if (valor === null || valor === undefined) return null;
    soma += valor;
  }
  return soma / anos;
}

module.exports = { mediaMesmaSemana, ANOS, DIAS_SEMANA, SEMANAS_ANO };
