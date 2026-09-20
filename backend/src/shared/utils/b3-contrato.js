"use strict";

// Ticker de futuro de milho da B3 (CCM): CCM + letra do mês de vencimento +
// 2 dígitos do ano (ex.: CCMF27 = janeiro/2027). Usado pelo coletor
// (collectors/b3) e pela leitura da tela de Observáveis. Não conhece a DATA
// exata de vencimento - só o mês.

const REGEX_FUTURO_CCM = /^CCM([FGHJKMNQUVXZ])(\d{2})$/;
const MES_DO_CODIGO = { F: 1, G: 2, H: 3, J: 4, K: 5, M: 6, N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12 };
const MESES_ABREVIADOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// { ticker, mes, ano, vencimento: "AAAA-MM", rotulo: "CCMX26 (nov/2026)" } ou null.
function decodificarFuturoCcm(ticker) {
  const partes = REGEX_FUTURO_CCM.exec(String(ticker));
  if (!partes) return null;

  const mes = MES_DO_CODIGO[partes[1]];
  const ano = 2000 + Number(partes[2]);
  return {
    ticker,
    mes,
    ano,
    vencimento: `${ano}-${String(mes).padStart(2, "0")}`,
    rotulo: `${ticker} (${MESES_ABREVIADOS[mes - 1]}/${ano})`
  };
}

module.exports = { decodificarFuturoCcm };
