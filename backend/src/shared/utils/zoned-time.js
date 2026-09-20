"use strict";

// Datas da camada point-in-time: tudo é armazenado em UTC (ver ADR 0008). Só
// os coletores precisam converter um horário "de parede" de uma fonte
// (ex.: 15:30 America/New_York) para UTC - usam estas funções, com
// Intl (sem dependência nova).

function partesNoFuso(instanteMs, timeZone) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(instanteMs));
  const p = Object.fromEntries(partes.map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

// Converte "data ISO + hora de parede num fuso" em um Date (instante UTC).
// dataIso: "YYYY-MM-DD"; horario: "HH:MM" ou "HH:MM:SS".
function zonedParaUtc(dataIso, horario, timeZone) {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const [h, m, s = 0] = horario.split(":").map(Number);
  const alvoComoUtc = Date.UTC(ano, mes - 1, dia, h, m, s);

  // Duas passadas: a primeira estima o offset no instante "ingênuo"; a
  // segunda corrige quando o offset real (DST) difere nesse ponto.
  let chute = alvoComoUtc - (partesNoFuso(alvoComoUtc, timeZone) - alvoComoUtc);
  chute = alvoComoUtc - (partesNoFuso(chute, timeZone) - chute);
  return new Date(chute);
}

module.exports = { zonedParaUtc };
