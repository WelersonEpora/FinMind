"use strict";

// Ticker de futuro da B3: símbolo do produto + letra do mês de
// vencimento + 2 dígitos do ano (ex.: CCMF27 = milho, janeiro/2027; ICFZ26 =
// café arábica, dezembro/2026; GLDZ26 = ouro, dezembro/2026). Usado pelos coletores
// (collectors/b3) e pela leitura da tela de Observáveis. Não conhece a DATA exata de
// vencimento - só o mês. O Brent da NYMEX (BZZ26 = dezembro/2026, pelo Yahoo, ADR 0096)
// segue o mesmo formato e usa o mesmo decodificador.

// Produtos coletados: CCM (milho, ADR 0009), ICF (café arábica, ADR 0028), GLD (ouro, ADR 0044) e BZ (Brent, ADR 0096).
const SIMBOLOS = ["CCM", "ICF", "GLD", "BZ"];
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
