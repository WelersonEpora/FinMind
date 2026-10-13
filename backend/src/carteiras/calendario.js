"use strict";

// Dias úteis das carteiras virtuais (ADR 0127): segunda a sexta, menos os feriados recebidos (o calendário da B3 vem de
// quem chama; o domínio não conhece fonte nenhuma). Datas sempre em ISO (AAAA-MM-DD), em UTC, sem hora.

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ehDiaUtil(iso, feriados = []) {
  const dia = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6 && !feriados.includes(iso);
}

// O dia útil a `n` dias úteis de `iso` (sem contar o próprio): n > 0 para frente, n < 0 para trás, n = 0 devolve `iso`.
function somarDiasUteis(iso, n, feriados = []) {
  const passo = n < 0 ? -1 : 1;
  let restantes = Math.abs(n);
  let atual = iso;
  while (restantes > 0) {
    atual = somarDias(atual, passo);
    if (ehDiaUtil(atual, feriados)) restantes -= 1;
  }
  return atual;
}

// Os dias úteis em (de, ate]: de sexta a segunda, 1. Negativo quando `ate` vem antes de `de`.
function diasUteisEntre(de, ate, feriados = []) {
  if (ate < de) return -diasUteisEntre(ate, de, feriados);
  let n = 0;
  for (let d = somarDias(de, 1); d <= ate; d = somarDias(d, 1)) {
    if (ehDiaUtil(d, feriados)) n += 1;
  }
  return n;
}

// A semana ISO 8601 da data ("2026-W42"): as travas semanais da Cartilha contam de segunda a domingo.
function semanaIso(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const diaDaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaDaSemana);
  const inicioDoAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d - inicioDoAno) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

module.exports = { somarDias, ehDiaUtil, somarDiasUteis, diasUteisEntre, semanaIso };
