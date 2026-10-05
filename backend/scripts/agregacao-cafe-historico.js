"use strict";

// Agregação determinística do café no histórico (PROPOSTA, ADR 0066): para cada data, os 8 fatores como se sabia até o
// fim dela (metodologia-ativo.service.js::simularFatores, point-in-time, os mesmos da tela e do prompt) e a agregação
// em código (factors/agregacao/agregacao-cafe.js). Não chama a IA e não grava nada: só lê o banco e imprime.
//
// Uso:
//   node scripts/agregacao-cafe-historico.js --data=2026-10-05            (detalhe de uma data)
//   node scripts/agregacao-cafe-historico.js --desde=2024-01-01 --ate=2026-10-02 [--passo=7] [--json=saida.json]
//
// Sem --ate, até hoje; o passo é em dias corridos (padrão 7). Uma data leva ~1 s (os 8 fatores com o histórico).

const fs = require("node:fs");
const { sequelize } = require("../src/models");
const metodologiaAtivoService = require("../src/services/metodologia-ativo.service");
const { agregarCafe } = require("../src/factors/agregacao/agregacao-cafe");

function argumento(nome) {
  const arg = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return arg ? arg.slice(nome.length + 3) : undefined;
}

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function datas(desde, ate, passo) {
  const lista = [];
  const d = new Date(`${desde}T12:00:00Z`);
  while (d.toISOString().slice(0, 10) <= ate) {
    lista.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + passo);
  }
  return lista;
}

async function agregarNaData(data) {
  const { simulacao } = await metodologiaAtivoService.simularFatores("CAFE", { data });
  return agregarCafe(simulacao.fatores, { dataAnalise: data });
}

const num = (n) => (n > 0 ? "+" : "") + n.toFixed(2);
const curtos = { CAFE_CLIMA: "F1", CAFE_SAFRA_BRASIL: "F2", CAFE_ESTOQUES: "F3", CAFE_DOLAR: "F4", CAFE_CUSTO_PRECO_MINIMO: "F5", CAFE_DEMANDA: "F6", CAFE_FUNDOS: "F7", CAFE_JUROS: "F8" };

function imprimirDetalhe(r) {
  console.log(`\nAgregação do café em ${r.dataAnalise} (${r.versao}, ${r.situacao})`);
  console.log(
    "Fatores: " +
      Object.entries(r.fatores)
        .map(([c, f]) => `${curtos[c]} ${f.ausente ? "sem dado" : `${f.direcao}/${f.intensidade} (${num(f.score)})`}`)
        .join(" | ")
  );
  console.log(`Conab: ${r.pregoesDesdeConab ?? "-"} pregão(ões) desde o último levantamento`);
  for (const h of r.horizontes) {
    console.log(`\n  ${h.horizonte}: S = ${num(h.score)} | cobertura ${Math.round(h.cobertura * 100)}% | ${h.tendencia} | ${h.faixa ?? "-"} | confiança ${h.confianca ?? "-"}`);
    for (const fam of h.familias) {
      const extra = fam.detalhe
        ? fam.ativa
          ? ` [membros ${fam.detalhe.membros.map((m) => curtos[m]).join("+")}; F1/F2 ${fam.detalhe.baseF1F2 ?? "sem dado"}${fam.detalhe.conflitoF1F2 ? " (conflito)" : ""}; F3 ${fam.detalhe.papelF3}]`
          : ` [inativa: ${fam.detalhe.motivo}]`
        : "";
      console.log(
        `    ${fam.codigo.padEnd(8)} peso ${Math.round(fam.peso * 100)}% (efetivo ${Math.round(fam.pesoEfetivo * 100)}%) | score ${fam.ausente ? "sem dado" : num(fam.score)} | contribuição ${num(fam.contribuicao)}${extra}`
      );
    }
    if (h.conflito) console.log(`    conflito: ${h.conflito.familias.join(" x ")} (razão ${h.conflito.razao})`);
    console.log(`    F7: ${h.fundos.papel}${h.fundos.motivo ? ` (${h.fundos.motivo})` : ""}`);
    if (h.motivosConfianca.length) console.log(`    motivos: ${h.motivosConfianca.join("; ")}`);
  }
}

function linha(r) {
  const fat = Object.entries(r.fatores)
    .map(([c, f]) => `${curtos[c]}${f.ausente ? "  ." : (f.score > 0 ? "+" : f.score < 0 ? "" : " ") + f.score}`)
    .join(" ");
  const hz = r.horizontes
    .map((h) => `${h.horizonte.slice(0, 3)} ${num(h.score)} ${String(h.faixa ?? "INSUF").padEnd(11)} ${(h.confianca ?? "-").padEnd(5)}${h.conflito ? "C" : " "}${h.fundos.papel === "RISCO_DE_REVERSAO" ? "R" : h.fundos.papel === "EXCESSO" ? "E" : " "}`)
    .join(" | ");
  return `${r.dataAnalise} | ${fat} | ${hz}`;
}

async function main() {
  const data = argumento("data");
  try {
    if (data) {
      imprimirDetalhe(await agregarNaData(data));
      return;
    }
    const desde = argumento("desde");
    if (!desde) throw new Error("Informe --data=AAAA-MM-DD ou --desde=AAAA-MM-DD.");
    const ate = argumento("ate") || hoje();
    const passo = Number(argumento("passo") || 7);
    const resultados = [];
    console.log("data       | fatores (score; . = sem dado)          | por horizonte: S, faixa, confiança, C = conflito, R/E = F7 risco/excesso");
    for (const d of datas(desde, ate, passo)) {
      const r = await agregarNaData(d);
      resultados.push(r);
      console.log(linha(r));
    }
    const json = argumento("json");
    if (json) fs.writeFileSync(json, JSON.stringify(resultados, null, 2));
  } finally {
    await sequelize.close();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
