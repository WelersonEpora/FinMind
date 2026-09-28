"use strict";

// Ticker de futuro agrícola da B3: símbolo do produto + letra do mês de
// vencimento + 2 dígitos do ano (ex.: CCMF27 = milho, janeiro/2027; ICFZ26 =
// café arábica, dezembro/2026). Usado pelos coletores (collectors/b3) e pela
// leitura da tela de Observáveis. Não conhece a DATA exata de vencimento - só o mês.

// Produtos coletados: CCM (milho, ADR 0009) e ICF (café arábica, ADR 0028).
const SIMBOLOS = ["CCM", "ICF"];
const REGEX_FUTURO = new RegExp(`^(${SIMBOLOS.join("|")})([FGHJKMNQUVXZ])(\\d{2})$`);
const MES_DO_CODIGO = { F: 1, G: 2, H: 3, J: 4, K: 5, M: 6, N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12 };
const MESES_ABREVIADOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// { ticker, simbolo, mes, ano, vencimento: "AAAA-MM", rotulo: "CCMX26 (nov/2026)" } ou null.
// Com `simbolo`, só aceita o ticker daquele produto.
function decodificarFuturoB3(ticker, simbolo) {
  const partes = REGEX_FUTURO.exec(String(ticker));
  if (!partes || (simbolo && partes[1] !== simbolo)) return null;

  const mes = MES_DO_CODIGO[partes[2]];
  const ano = 2000 + Number(partes[3]);
  return {
    ticker,
    simbolo: partes[1],
    mes,
    ano,
    vencimento: `${ano}-${String(mes).padStart(2, "0")}`,
    rotulo: `${ticker} (${MESES_ABREVIADOS[mes - 1]}/${ano})`
  };
}

module.exports = { decodificarFuturoB3 };
