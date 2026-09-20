"use strict";

const pointInTimeService = require("../services/point-in-time.service");

// FATOR: juro real de 10 anos dos EUA. Único fator derivado desta etapa.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation, coletados, com published_at):
//     FRED.DFII10  - rendimento do Treasury 10a indexado à inflação (TIPS)
//     FRED.DGS10   - rendimento nominal 10a          } só para validação
//     FRED.T10YIE  - inflação implícita (breakeven)  } cruzada
//   fator (calculado sob demanda por esta função, NUNCA gravado em observation):
//     juro_real_10a = DFII10, no mesmo período observado
//
// Propriedades (o que torna o fator utilizável num backtest):
//   - determinístico: a mesma entrada de asOf() dá sempre a mesma saída;
//   - point-in-time: só usa o que era conhecido em `asOf`; e cada ponto
//     informa `disponivelEm` (published_at do insumo) e se ele é estimado;
//   - versionado: FACTOR_VERSION sobe quando a fórmula muda;
//   - sem IA e sem estimativa própria: nenhum valor é gerado, só lido.
//
// Validação cruzada: o FRED define T10YIE = DGS10 - DFII10, então
// DGS10 - T10YIE deve reproduzir DFII10 (a menos de arredondamento).
// `validacaoCruzada.diferenca` expõe qualquer desvio; nulo se faltar insumo.

const FACTOR_ID = "juro_real_10a";
const FACTOR_VERSION = 1;

const SERIE_PRINCIPAL = "FRED.DFII10";
const SERIES_VALIDACAO = { nominal: "FRED.DGS10", breakeven: "FRED.T10YIE" };

function arredondar(n) {
  return Math.round(n * 1e6) / 1e6;
}

// Função PURA: recebe linhas já resolvidas por obterAsOf() (uma por
// série+período) e devolve os pontos do fator.
function derivarJuroReal10a(linhasAsOf) {
  const porPeriodo = new Map();
  for (const linha of linhasAsOf) {
    if (!porPeriodo.has(linha.observedAt)) porPeriodo.set(linha.observedAt, {});
    porPeriodo.get(linha.observedAt)[linha.seriesCode] = linha;
  }

  const pontos = [];
  for (const [observedAt, series] of [...porPeriodo].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const principal = series[SERIE_PRINCIPAL];
    if (!principal) continue;

    const nominal = series[SERIES_VALIDACAO.nominal];
    const breakeven = series[SERIES_VALIDACAO.breakeven];
    const implicito = nominal && breakeven ? arredondar(nominal.value - breakeven.value) : null;

    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      value: principal.value,
      unit: "% a.a.",
      disponivelEm: principal.publishedAt,
      disponivelEmEhEstimado: principal.publishedAtIsEstimated,
      validacaoCruzada: implicito === null ? null : { implicito, diferenca: arredondar(principal.value - implicito) }
    });
  }
  return pontos;
}

async function calcularJuroReal10a({ asOf, observadoDesde, observadoAte, estrito = false }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf(
    { seriesCodes: [SERIE_PRINCIPAL, ...Object.values(SERIES_VALIDACAO)], asOf, observadoDesde, observadoAte, estrito },
    deps
  );
  return derivarJuroReal10a(linhas);
}

module.exports = { FACTOR_ID, FACTOR_VERSION, derivarJuroReal10a, calcularJuroReal10a };
