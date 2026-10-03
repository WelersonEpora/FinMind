"use strict";

// Medida comum aos fatores lidos pelo crescimento anual de uma série semanal (ADR 0050): a produção e a demanda de
// petróleo dos EUA. A semana isolada da EIA é estimativa e oscila (feriados, arredondamento), por isso a medida é a
// média de 4 semanas contra a média das mesmas 4 semanas do ano anterior (52 semanas antes), que tira a sazonalidade.
//
//   media4Semanas       = média da série nas semanas t, t-1, t-2 e t-3 (nula se faltar uma)
//   mediaAnoAnterior    = media4Semanas(t - 52 semanas)
//   crescimentoAnualPct = media4Semanas / mediaAnoAnterior - 1, em %

const DIAS_SEMANA = 7;
const SEMANAS_ANO = 52;
const SEMANAS_MEDIA = 4;

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// Função pura: as linhas de obterAsOf() de uma série -> uma entrada por semana, em ordem, com a linha original
// (para o valor da semana e a data de disponibilidade).
function crescimentoAnualSemanal(linhasAsOf, seriesCode) {
  const porData = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode === seriesCode) porData.set(linha.observedAt, linha);
  }

  const media4 = (data) => {
    let soma = 0;
    for (let k = 0; k < SEMANAS_MEDIA; k += 1) {
      const linha = porData.get(somarDias(data, -DIAS_SEMANA * k));
      if (!linha) return null;
      soma += linha.value;
    }
    return soma / SEMANAS_MEDIA;
  };

  return [...porData.keys()].sort().map((observedAt) => {
    const media = media4(observedAt);
    const anterior = media4(somarDias(observedAt, -DIAS_SEMANA * SEMANAS_ANO));
    return {
      observedAt,
      linha: porData.get(observedAt),
      media4Semanas: media === null ? null : arredondar(media, 1),
      mediaAnoAnterior: anterior === null ? null : arredondar(anterior, 1),
      crescimentoAnualPct: media !== null && anterior ? arredondar((media / anterior - 1) * 100, 2) : null
    };
  });
}

module.exports = { crescimentoAnualSemanal, somarDias, arredondar, DIAS_SEMANA };
