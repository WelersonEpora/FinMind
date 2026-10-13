"use strict";

const { semanaIso, somarDiasUteis } = require("./calendario");

// As travas da Cartilha (Tabela 3) no motor de fim de dia (ADR 0127, D11). Só bloqueiam NOVAS entradas; reduzir e zerar
// sempre podem (reduzem o risco). Avaliadas na decisão de D, com o patrimônio liquidado até D−1:
//
//   PERDA_DIARIA    o último pregão liquidado perdeu o limite ou mais: sem entradas em D.
//   PERDA_SEMANAL   a semana do último pregão liquidado perdeu o limite ou mais (contra o fechamento da semana anterior):
//                   sem entradas no resto dessa semana.
//   DRAWDOWN        em algum dia desde a última retomada, a queda desde o pico chegou ao limite: a trilha para até uma
//                   retomada manual, com motivo. A retomada zera o pico.
//   PERDAS_SEGUIDAS N operações encerradas seguidas com resultado negativo: pausa de P pregões a partir do seguinte à
//                   N-ésima; a contagem recomeça depois dela. Empate (0R) quebra a sequência.

const pct = (a, b) => (a / b - 1) * 100;

// `serie`: [{ data, patrimonio }] até D−1, em ordem; `encerradas`: [{ dataSaida, resultadoR }]; `retomadas`: as datas
// das retomadas manuais. -> { bloqueiaNovasEntradas, travas: [{ codigo, detalhe, ate? }] }.
function avaliarTravas({ data, serie = [], encerradas = [], retomadas = [], parametros, feriados = [] }) {
  const c = parametros.carteira;
  const travas = [];
  const pontos = [...serie].sort((a, b) => a.data.localeCompare(b.data));
  const ultimo = pontos[pontos.length - 1];

  if (pontos.length >= 2) {
    const variacao = pct(ultimo.patrimonio, pontos[pontos.length - 2].patrimonio);
    if (variacao <= -c.perdaDiariaPct + 1e-9) travas.push({ codigo: "PERDA_DIARIA", detalhe: `${variacao.toFixed(2)}% em ${ultimo.data}` });
  }

  if (ultimo && semanaIso(data) === semanaIso(ultimo.data)) {
    const semana = semanaIso(ultimo.data);
    const anteriores = pontos.filter((p) => semanaIso(p.data) < semana);
    const base = anteriores.length ? anteriores[anteriores.length - 1] : pontos[0];
    const variacao = pct(ultimo.patrimonio, base.patrimonio);
    if (variacao <= -c.perdaSemanalPct + 1e-9) travas.push({ codigo: "PERDA_SEMANAL", detalhe: `${variacao.toFixed(2)}% na semana ${semana}` });
  }

  const ultimaRetomada = [...retomadas].sort().pop() || null;
  let pico = -Infinity;
  for (const p of pontos.filter((x) => !ultimaRetomada || x.data >= ultimaRetomada)) {
    pico = Math.max(pico, p.patrimonio);
    const queda = (1 - p.patrimonio / pico) * 100;
    if (queda >= c.drawdownMaxPct - 1e-9) {
      travas.push({ codigo: "DRAWDOWN", detalhe: `${queda.toFixed(2)}% em ${p.data}; para até uma retomada manual` });
      break;
    }
  }

  let sequencia = 0;
  for (const op of [...encerradas].sort((a, b) => a.dataSaida.localeCompare(b.dataSaida))) {
    sequencia = op.resultadoR < 0 ? sequencia + 1 : 0;
    if (sequencia >= c.perdasSeguidas) {
      sequencia = 0;
      const ate = somarDiasUteis(op.dataSaida, c.pausaPregoes, feriados);
      if (data > op.dataSaida && data <= ate) travas.push({ codigo: "PERDAS_SEGUIDAS", detalhe: `${c.perdasSeguidas} perdas seguidas até ${op.dataSaida}`, ate });
    }
  }

  return { bloqueiaNovasEntradas: travas.length > 0, travas };
}

module.exports = { avaliarTravas };
