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

module.exports = { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, classificarNaFaixa, criarClassificador };
