"use strict";

// Agregação comum aos fatores lidos por semana a partir de séries DIÁRIAS (ADR 0050): o refino (preços à vista) e o
// dólar (índices do Fed). A semana vai de sábado a sexta e leva a data da sexta, como as semanas da EIA.

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// A sexta da semana (sábado a sexta) de um dia.
function sextaDaSemana(dataIso) {
  const diaDaSemana = new Date(`${dataIso}T00:00:00Z`).getUTCDay();
  return somarDias(dataIso, (5 - diaDaSemana + 7) % 7);
}

// As linhas de obterAsOf() de UMA série diária -> Map(sexta -> { media, dias, disponivelEm, estimado }): a média dos
// dias da semana, quantos dias entraram e a disponibilidade mais tardia entre eles (point-in-time).
function mediaSemanal(linhasAsOf, seriesCode) {
  const semanas = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode !== seriesCode) continue;
    const sexta = sextaDaSemana(linha.observedAt);
    if (!semanas.has(sexta)) semanas.set(sexta, { soma: 0, dias: 0, disponivelEm: null, estimado: false });
    const semana = semanas.get(sexta);
    semana.soma += linha.value;
    semana.dias += 1;
    if (!semana.disponivelEm || linha.publishedAt > semana.disponivelEm) semana.disponivelEm = linha.publishedAt;
    semana.estimado = semana.estimado || linha.publishedAtIsEstimated;
  }
  return new Map(
    [...semanas].map(([sexta, s]) => [sexta, { media: s.soma / s.dias, dias: s.dias, disponivelEm: s.disponivelEm, estimado: s.estimado }])
  );
}

module.exports = { somarDias, sextaDaSemana, mediaSemanal };
