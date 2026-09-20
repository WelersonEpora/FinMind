"use strict";

// Aritmética de datas ISO (YYYY-MM-DD) sempre em UTC - sem depender do fuso
// da máquina. Usado pelos coletores para regras documentadas de defasagem
// de publicação (ver ADR 0008).

const REGEX_ISO = /^\d{4}-\d{2}-\d{2}$/;

function paraDate(dataIso) {
  if (!REGEX_ISO.test(dataIso)) throw new Error(`Data ISO inválida: "${dataIso}".`);
  const data = new Date(`${dataIso}T00:00:00Z`);
  if (Number.isNaN(data.getTime())) throw new Error(`Data ISO inválida: "${dataIso}".`);
  return data;
}

function paraIso(data) {
  return data.toISOString().slice(0, 10);
}

function somarDias(dataIso, dias) {
  const data = paraDate(dataIso);
  data.setUTCDate(data.getUTCDate() + dias);
  return paraIso(data);
}

// 1 = segunda ... 7 = domingo
function diaDaSemanaIso(dataIso) {
  const dow = paraDate(dataIso).getUTCDay();
  return dow === 0 ? 7 : dow;
}

// Próximo dia útil (seg-sex) estritamente depois de dataIso. Não conhece
// feriados - a regra que usa isto documenta esse limite.
function proximoDiaUtil(dataIso) {
  let atual = somarDias(dataIso, 1);
  while (diaDaSemanaIso(atual) > 5) atual = somarDias(atual, 1);
  return atual;
}

// Primeira segunda-feira estritamente depois de dataIso.
function proximaSegunda(dataIso) {
  return somarDias(dataIso, 8 - diaDaSemanaIso(dataIso));
}

// Fim do dia em UTC - limite conservador quando a fonte informa só a DATA.
function fimDoDiaUtc(dataIso) {
  return new Date(`${dataIso}T23:59:59Z`);
}

// "YYYY-MM-DD HH:MM:SS" em UTC (formato aceito por DATETIME do MariaDB).
function paraDatetimeSql(data) {
  return data.toISOString().slice(0, 19).replace("T", " ");
}

module.exports = { paraDate, paraIso, somarDias, diaDaSemanaIso, proximoDiaUtil, proximaSegunda, fimDoDiaUtc, paraDatetimeSql };
