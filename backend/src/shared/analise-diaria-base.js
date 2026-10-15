"use strict";

// O que a leitura diária de tendência (ADRs 0051, 0052 e 0054) tem de igual em todos os ativos: as faixas de variação
// (os códigos e a tendência de cada uma) e a classificação de uma variação realizada numa faixa. O que muda por ativo
// (horizontes, limites T1 e T2, preço de referência, curva, arquivo do prompt) fica na configuração do ativo
// (`analise-diaria-<ativo>.js`), e o registro dos ativos com leitura diária, em `analise-diaria.js`.

const CODIGOS_FAIXA = Object.freeze(["BAIXA_FORTE", "BAIXA_LEVE", "LATERAL", "ALTA_LEVE", "ALTA_FORTE"]);
const TENDENCIA_DA_FAIXA = Object.freeze({
  BAIXA_FORTE: "BAIXA",
  BAIXA_LEVE: "BAIXA",
  LATERAL: "LATERAL",
  ALTA_LEVE: "ALTA",
  ALTA_FORTE: "ALTA"
});

// A faixa de uma variação realizada (%), para comparar depois com a faixa da leitura. Bordas: |v| < T1 é LATERAL;
// T1 <= |v| < T2 é LEVE; |v| >= T2 é FORTE. Só classifica: não pontua nada.
function classificarNaFaixa(variacaoPct, { t1, t2 }) {
  if (variacaoPct === null || variacaoPct === undefined || !Number.isFinite(variacaoPct)) return null;
  const absoluto = Math.abs(variacaoPct);
  if (absoluto < t1) return "LATERAL";
  const lado = variacaoPct > 0 ? "ALTA" : "BAIXA";
  return absoluto < t2 ? `${lado}_LEVE` : `${lado}_FORTE`;
}

// O classificador de um ativo, pelas faixas dele: (variacaoPct, horizonte) -> a faixa.
function criarClassificador(faixas) {
  return function classificarVariacao(variacaoPct, horizonte) {
    const faixa = faixas[horizonte];
    if (!faixa) throw new Error(`Horizonte desconhecido: ${horizonte}`);
    return classificarNaFaixa(variacaoPct, faixa);
  };
}

// De onde os horizontes contam, gravado com cada leitura (`entrada.referenciaHorizontes`):
//   - DATA_DO_PRECO_RECEBIDO (ADR 0106, desde 2026-10-07): do último preço que a IA recebeu (o pregão anterior à
//     leitura, que roda de madrugada). A base da avaliação é esse preço e a data-alvo é a data dele + os dias, nunca
//     antes da data da análise: o IMEDIATO é o próximo pregão depois do preço (o de sexta + 1 dia cai no sábado; vale a
//     segunda da leitura). Assim o pregão que a IA pode antecipar é o que se avalia. Desde 2026-10-15 (ADR 0106,
//     adendo), com qualquer preço recebido, mesmo mais velho que o pregão anterior (feriado, fonte atrasada): se a
//     leitura entra na métrica, a Qualidade da IA decide depois, pela série de preços (qualidade-ia.service.js);
//   - DATA_DA_ANALISE (ADR 0052, adendo de 2026-10-03): da data da análise, com a base no preço dela, que a IA não viu. É
//     a regra das leituras até 2026-10-07 e a das sem preço; de 2026-10-07 a 2026-10-14, também a das leituras com o
//     preço mais velho que o pregão anterior (o horizonte deslocado, fora da métrica);
//   - DATA_DO_ULTIMO_PRECO: o petróleo v1 (2026-10-03), do último preço, sem o ajuste do próximo pregão.
const REFERENCIA_HORIZONTES = Object.freeze({
  DATA_DO_PRECO_RECEBIDO: "DATA_DO_PRECO_RECEBIDO",
  DATA_DA_ANALISE: "DATA_DA_ANALISE",
  DATA_DO_ULTIMO_PRECO: "DATA_DO_ULTIMO_PRECO"
});

function somarDiasIso(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// A data de onde os horizontes contam.
function dataDeReferenciaDosHorizontes(tipo, { dataAnalise, dataPreco }) {
  return tipo === REFERENCIA_HORIZONTES.DATA_DA_ANALISE ? dataAnalise : dataPreco ?? null;
}

// A data-alvo de um horizonte, pela regra gravada com a leitura. `dataPreco`: a do preço que a IA recebeu (do contrato
// do horizonte, quando ele tem um).
function dataAlvoDoHorizonte(tipo, { dataAnalise, dataPreco, dias }) {
  const referencia = dataDeReferenciaDosHorizontes(tipo, { dataAnalise, dataPreco });
  if (!referencia || !Number.isInteger(dias)) return null;
  const alvo = somarDiasIso(referencia, dias);
  return tipo === REFERENCIA_HORIZONTES.DATA_DO_PRECO_RECEBIDO && dataAnalise && alvo < dataAnalise ? dataAnalise : alvo;
}

module.exports = {
  CODIGOS_FAIXA,
  TENDENCIA_DA_FAIXA,
  REFERENCIA_HORIZONTES,
  classificarNaFaixa,
  criarClassificador,
  dataDeReferenciaDosHorizontes,
  dataAlvoDoHorizonte
};
