"use strict";

// Agregação determinística do milho no histórico (PROPOSTA, ADR 0081): para cada data, os 8 fatores como se sabia até o
// fim dela (metodologia-ativo.service.js::simularFatores, point-in-time, os mesmos da tela) e a agregação em código
// (factors/agregacao/agregacao-milho.js). Com --acerto, também o que o CCM fez em cada horizonte, medido como a
// Qualidade da IA mede uma leitura (o contrato de cada horizonte do ADR 0078, o realizado do ADR 0063 e as comparações
// do ADR 0064), contra os benchmarks Sempre Lateral e Persistência. Não chama a IA e não grava nada.
//
// Uso:
//   node scripts/agregacao-milho-historico.js --data=2026-07-20            (detalhe de uma data)
//   node scripts/agregacao-milho-historico.js --desde=2022-04-04 [--ate=2026-10-02] [--passo=7] [--acerto] [--json=saida.json]

const fs = require("node:fs");
const { sequelize } = require("../src/models");
const metodologiaAtivoService = require("../src/services/metodologia-ativo.service");
const { agregarMilho } = require("../src/factors/agregacao/agregacao-milho");
const { criarAvaliador } = require("./agregacao-acerto");

function argumento(nome) {
  const arg = process.argv.find((a) => a.startsWith(`--${nome}=`) || a === `--${nome}`);
  if (!arg) return undefined;
  return arg.includes("=") ? arg.slice(nome.length + 3) : true;
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
  const { simulacao } = await metodologiaAtivoService.simularFatores("MILHO", { data });
  return agregarMilho(simulacao.fatores, { dataAnalise: data, pesos: simulacao.pesos });
}

const num = (n) => (n > 0 ? "+" : "") + n.toFixed(2);
const curtos = {
  MILHO_CLIMA_SAFRA_EUA: "F1",
  MILHO_SAFRINHA: "F2",
  MILHO_ESTOQUES_WASDE: "F3",
  MILHO_DOLAR_PARIDADE: "F4",
  MILHO_ETANOL: "F5",
  MILHO_INSUMOS: "F6",
  MILHO_FUNDOS: "F7",
  MILHO_POLITICA_COMERCIAL: "F8"
};

function imprimirDetalhe(r) {
  console.log(`\nAgregação do milho em ${r.dataAnalise} (${r.versao}, ${r.situacao}); mês ${r.mes}; colheita de MT ${r.colheitaMtPct ?? "-"}%`);
  for (const [c, f] of Object.entries(r.fatores)) {
    const peso = f.peso !== undefined ? ` | peso ${f.peso ?? "-"} (mês: ${f.pesoDoMes ?? "-"})${f.motivosPeso?.length ? ` [${f.motivosPeso.join("; ")}]` : ""}` : "";
    console.log(`  ${curtos[c]} ${f.ausente ? "sem dado" : `${f.direcao}/${f.intensidade} (${num(f.score)})`}${peso}`);
  }
  const h = r.horizontes[0];
  console.log(`\n  Leitura (a mesma nos 4 horizontes): S = ${num(h.score)} | cobertura ${Math.round(h.cobertura * 100)}% | ${h.tendencia} | ${h.faixa ?? "-"} | confiança ${h.confianca ?? "-"}`);
  for (const fam of h.familias) {
    const extra = fam.detalhe
      ? ` [${[fam.detalhe.papelF3 && `F1/F2 ${fam.detalhe.baseF1F2 ?? "sem dado"}${fam.detalhe.conflitoF1F2 ? " (conflito)" : ""}; F3 ${fam.detalhe.papelF3}`, fam.detalhe.multiplicadoPeloF7 && "×1,25 pelo F7"].filter(Boolean).join("; ")}]`
      : "";
    console.log(`    ${fam.codigo.padEnd(8)} peso ${Math.round(fam.pesoEfetivo * 100)}% | score ${fam.ausente ? "sem dado" : num(fam.score)} | contribuição ${num(fam.contribuicao)}${extra}`);
  }
  if (h.conflito) console.log(`    conflito: ${h.conflito.familias.join(" x ")} (razão ${h.conflito.razao})`);
  console.log(`    F7: ${h.fundos.papel}${h.fundos.motivo ? ` (${h.fundos.motivo})` : ""}`);
  if (h.motivosConfianca.length) console.log(`    motivos: ${h.motivosConfianca.join("; ")}`);
}

function linha(r) {
  const fat = Object.entries(r.fatores)
    .map(([c, f]) => `${curtos[c]}${f.ausente ? "  ." : (f.score > 0 ? "+" : f.score < 0 ? "" : " ") + f.score}`)
    .join(" ");
  const h = r.horizontes[0];
  return `${r.dataAnalise} | ${fat} | S ${num(h.score)} ${String(h.faixa ?? "INSUF").padEnd(11)} ${(h.confianca ?? "-").padEnd(5)}${h.conflito ? "C" : " "}${h.fundos.papel === "RISCO_DE_REVERSAO" ? "R" : h.fundos.papel === "MULTIPLICADOR" ? "M" : " "}`;
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
    const avaliador = argumento("acerto") ? criarAvaliador("MILHO") : null;
    const agora = new Date();
    const resultados = [];
    console.log("data       | fatores (score; . = sem dado)       | S, faixa, confiança, C = conflito, R/M = F7 risco/multiplicador");
    for (const d of datas(desde, ate, passo)) {
      const r = await agregarNaData(d);
      resultados.push(r);
      console.log(linha(r));
      if (avaliador) await avaliador.avaliar(d, r, agora);
    }
    if (avaliador) avaliador.resumir();
    const json = argumento("json");
    if (json) fs.writeFileSync(json, JSON.stringify({ resultados, linhasAcerto: avaliador?.linhas ?? [] }, null, 2));
  } finally {
    await sequelize.close();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
