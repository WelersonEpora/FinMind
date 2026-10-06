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
const centroDecisaoService = require("../src/services/centro-decisao.service");
const { lerContratosPorHorizonte } = require("../src/services/prompt-diario.service");
const { apurarRealizados } = require("../src/services/realizado-analise.service");
const { comparar, persistencia } = require("../src/services/qualidade-ia.service");
const config = require("../src/shared/analise-diaria-milho");
const { agregarMilho } = require("../src/factors/agregacao/agregacao-milho");
const { somarDias } = require("../src/shared/utils/date-utils");

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

// A leitura do motor como uma leitura gravada (analise-diaria.service.js::leituraGravada), com o contrato de cada
// horizonte: o que a avaliação precisa para apurar o realizado.
async function leituraParaAvaliar(data, agora) {
  const serie = centroDecisaoService.ATIVOS.find((a) => a.codigo === "MILHO").series.find((s) => s.codigo === config.PRECO.serie);
  const preco = await centroDecisaoService.lerPreco(serie, { data, agora }, {});
  if (!preco.disponivel) return null;
  const curva = await centroDecisaoService.lerCurva(serie.futuro, { data, agora }, {});
  const porHorizonte = await lerContratosPorHorizonte(serie, { dataAnalise: data, agora, curva, config }, centroDecisaoService, {});
  return {
    data,
    precoReferencia: { serie: "CCM", seriesCode: preco.seriesCode, contrato: preco.contrato, dataReferencia: preco.dataReferencia, valor: preco.valor },
    referenciaHorizontes: { tipo: "DATA_DA_ANALISE", data },
    horizontes: config.HORIZONTES.map(({ codigo, dias }) => {
      const doH = porHorizonte[codigo];
      return {
        codigo,
        dias,
        ...config.FAIXAS[codigo],
        dataAlvo: somarDias(data, dias),
        ...(doH.preco.disponivel
          ? { seriesCode: doH.preco.seriesCode, contrato: doH.preco.contrato, precoRecebido: { valor: doH.preco.valor, dataReferencia: doH.preco.dataReferencia } }
          : {}),
        variacoes: doH.preco.disponivel ? doH.preco.variacoes : null
      };
    })
  };
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

// O acerto de cada previsor por horizonte, nas linhas avaliáveis (o realizado apurado, a base no dia e o motor com
// leitura). Persistência: a variação passada de mesmo prazo no contrato do horizonte, como a IA a receberia.
function resumirAcerto(linhas) {
  console.log("\nAcerto contra o CCM (as mesmas regras da Qualidade da IA): direção | faixa exata | distância média");
  for (const { codigo } of config.HORIZONTES) {
    const doH = linhas.filter((l) => l.horizonte === codigo);
    const medir = (chave) => {
      const v = doH.map((l) => l[chave]).filter(Boolean);
      if (!v.length) return "-";
      const dir = v.filter((x) => x.direcao).length;
      const exata = v.filter((x) => x.faixaExata).length;
      const dist = v.reduce((s, x) => s + x.distancia, 0) / v.length;
      return `${Math.round((dir / v.length) * 100)}% | ${Math.round((exata / v.length) * 100)}% | ${dist.toFixed(2)} (n=${v.length})`;
    };
    const naoLaterais = doH.filter((l) => l.motor && l.motor.faixa !== "LATERAL");
    const dirNaoLat = naoLaterais.filter((l) => l.motor.direcao).length;
    console.log(`  ${codigo.padEnd(8)} motor ${medir("motor")} | sempre lateral ${medir("lateral")} | persistência ${medir("persistencia")}`);
    console.log(`           motor fora do LATERAL: ${naoLaterais.length} leituras, direção certa em ${naoLaterais.length ? Math.round((dirNaoLat / naoLaterais.length) * 100) : "-"}%`);
  }
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
    const acerto = Boolean(argumento("acerto"));
    const agora = new Date();
    const resultados = [];
    const linhasAcerto = [];
    console.log("data       | fatores (score; . = sem dado)       | S, faixa, confiança, C = conflito, R/M = F7 risco/multiplicador");
    for (const d of datas(desde, ate, passo)) {
      const r = await agregarNaData(d);
      resultados.push(r);
      console.log(linha(r));
      if (!acerto) continue;
      const leitura = await leituraParaAvaliar(d, agora);
      if (!leitura) continue;
      const [realizado] = await apurarRealizados([leitura], { agora });
      for (const h of leitura.horizontes) {
        const apurado = realizado.horizontes.find((x) => x.horizonte === h.codigo);
        const motorH = r.horizontes.find((x) => x.horizonte === h.codigo);
        if (apurado?.situacao !== "APURADO" || !apurado.faixa || !apurado.base?.naDataDaAnalise) continue;
        const pers = persistencia(h.variacoes, h);
        linhasAcerto.push({
          data: d,
          horizonte: h.codigo,
          motor: motorH.faixa ? comparar(motorH.faixa, apurado.faixa) : null,
          lateral: comparar("LATERAL", apurado.faixa),
          persistencia: pers ? comparar(pers.faixa, apurado.faixa) : null
        });
      }
    }
    if (acerto) resumirAcerto(linhasAcerto);
    const json = argumento("json");
    if (json) fs.writeFileSync(json, JSON.stringify({ resultados, linhasAcerto }, null, 2));
  } finally {
    await sequelize.close();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
