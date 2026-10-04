"use strict";

// Datas de fatores mensais e trimestrais (ADR 0050): o período leva a data do 1º dia (AAAA-MM-01), como nas fontes.

// O 1º dia do mês `k` meses antes ou depois de `mesIso` (AAAA-MM-01).
function somarMeses(mesIso, k) {
  const [ano, mes] = mesIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1 + k, 1)).toISOString().slice(0, 10);
}

module.exports = { somarMeses };
