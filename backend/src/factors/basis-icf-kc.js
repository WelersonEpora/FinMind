"use strict";

const observationRepository = require("../repositories/observation.repository");
const { decodificarFuturoB3 } = require("../shared/utils/b3-contrato");
const { pregaoAntes } = require("./base/serie-continua-futuro");

// Basis B3 × Nova York do café arábica (análise do café de 2026-10-19, item E1): o ICF da B3 contra o KC da ICE
// convertido para US$/saca, no MESMO mês de vencimento, com a posição do basis no próprio histórico. INFORMAÇÃO,
// calculada sob demanda e NUNCA gravada: não entra em nenhum fator, no prompt nem no Centro de Decisão (o basis como
// fator é decisão do Comitê, item E10).
//
// O par de cada pregão: o 1º vencimento de Nova York (KC=F, a contínua do Yahoo, ADR 0129) e o ICF do mesmo mês. O
// KC=F é a única série de Nova York com os vencimentos que já saíram; o mês dele num dia é o 1º cujo último pregão ainda
// não passou (o KC=F rola no pregão seguinte, conferido em 21/09/2026). Onde o Yahoo tem o vencimento (os ativos), vale
// o dele. Os dois ajustes saem com ~1h30 de diferença (ICE às 13:30 de Nova York; B3 no fim do pregão).
//
// basis = ICF − KC × 1,32277 (US$/saca; 60 kg = 132,277 lb e o KC é em centavos por libra-peso); em % = ICF ÷ (KC ×
// 1,32277) − 1. A posição é o percentil do basis em % entre todos os pregões anteriores com par (o histórico começa em
// 2022-03, com o ICF), em % porque o preço do café mais que dobrou no período.

const LIBRAS_POR_SACA_CENTAVOS = 1.32277;
const LETRAS_KC = "HKNUZ";
const LETRAS_DOS_MESES = "FGHJKMNQUVXZ";
// Os dias fixos sem pregão na ICE de Nova York ("MM-DD"); os móveis dos EUA ficam de fora (só mudariam um dia útil).
const FERIADOS_ICE = new Set(["01-01", "07-04", "12-25"]);

// O último pregão de um vencimento do KC: 8 dias úteis antes do último dia útil do mês de vencimento (um dia antes do
// last notice day da ICE). Conferido: o KCU26 negociou até 18/09/2026.
function ultimoPregaoKc(ano, mes) {
  const ultimoDoMes = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return pregaoAntes(ultimoDoMes, 8, FERIADOS_ICE);
}

// O mês do 1º vencimento do KC em `data`: { ano, mes, letra }.
function primeiroVencimentoKc(data) {
  let [ano, mes] = data.split("-").map(Number);
  for (let i = 0; i < 12; i += 1, mes += 1) {
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    const letra = LETRAS_DOS_MESES[mes - 1];
    if (LETRAS_KC.includes(letra) && data <= ultimoPregaoKc(ano, mes)) return { ano, mes, letra };
  }
  return null;
}

// O percentil de `valor` entre `anteriores` (0 a 100): a fração dos anteriores abaixo dele, com metade dos empates.
function percentil(valor, anteriores) {
  if (!anteriores.length) return null;
  let abaixo = 0;
  let iguais = 0;
  for (const v of anteriores) {
    if (v < valor) abaixo += 1;
    else if (v === valor) iguais += 1;
  }
  return Math.round(((abaixo + iguais / 2) / anteriores.length) * 1000) / 10;
}

const arredondar = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;

// Função PURA: as linhas de buscarAsOf (ICF por vencimento, KC por vencimento e o KC=F) -> um ponto por pregão com par.
function medirBasis(linhas) {
  const porSerie = new Map();
  for (const l of linhas) {
    if (!porSerie.has(l.series_code)) porSerie.set(l.series_code, new Map());
    porSerie.get(l.series_code).set(l.observed_at, Number(l.value));
  }
  const kcContinuo = porSerie.get("YAHOO.KC_CONTINUO.SETTLE") || new Map();
  const pontos = [];
  for (const data of [...kcContinuo.keys()].sort()) {
    const venc = primeiroVencimentoKc(data);
    if (!venc) continue;
    const sufixo = `${venc.letra}${String(venc.ano % 100).padStart(2, "0")}`;
    const icf = porSerie.get(`B3.ICF.ICF${sufixo}.SETTLE`)?.get(data);
    if (icf === undefined) continue;
    const kcCentavos = porSerie.get(`YAHOO.KC.KC${sufixo}.SETTLE`)?.get(data) ?? kcContinuo.get(data);
    const kcSaca = kcCentavos * LIBRAS_POR_SACA_CENTAVOS;
    pontos.push({
      data,
      contratoIcf: `ICF${sufixo}`,
      contratoKc: `KC${sufixo}`,
      icf,
      kcCentavos,
      kcSaca: arredondar(kcSaca, 2),
      basis: arredondar(icf - kcSaca, 2),
      basisPct: arredondar((icf / kcSaca - 1) * 100, 2)
    });
  }
  pontos.forEach((p, i) => {
    p.percentil = i < 20 ? null : percentil(p.basisPct, pontos.slice(0, i).map((q) => q.basisPct));
  });
  return pontos;
}

// O basis com o que se sabia em `asOf`. -> { pontos, ultimo }.
async function calcularBasisIcfKc({ asOf = new Date() } = {}, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const [icf, kc] = await Promise.all([
    repo.listarUltimasDatasItens({ prefixoSerie: "B3.ICF", campoReferencia: "SETTLE" }),
    repo.listarUltimasDatasItens({ prefixoSerie: "YAHOO.KC", campoReferencia: "SETTLE" })
  ]);
  const series = [
    ...icf.filter((i) => decodificarFuturoB3(i.codigo, "ICF")).map((i) => `B3.ICF.${i.codigo}.SETTLE`),
    ...kc.filter((i) => decodificarFuturoB3(i.codigo, "KC")).map((i) => `YAHOO.KC.${i.codigo}.SETTLE`),
    "YAHOO.KC_CONTINUO.SETTLE"
  ];
  const pontos = medirBasis(await repo.buscarAsOf({ seriesCodes: series, asOf }));
  return { pontos, ultimo: pontos.at(-1) || null };
}

module.exports = { LIBRAS_POR_SACA_CENTAVOS, ultimoPregaoKc, primeiroVencimentoKc, percentil, medirBasis, calcularBasisIcfKc };
