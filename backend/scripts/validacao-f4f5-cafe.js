"use strict";

// O backtest pré-registrado do E8 (R1: o físico do Cepea abaixo do custo) e do E9 (a regra do F5 com o KC em reais), ADR
// 0147. As semanas são as do F5 (derivarCustosCafe); só o preço muda. Não chama a IA e não grava nada.
//
// Uso:
//   npm run validacao:f4f5                  o histórico (2004 em diante)
//   npm run validacao:f4f5 -- --sombra      só as semanas publicadas depois de 2026-10-23 (no servidor)
//   [-- --json=saida.json]

const fs = require("node:fs");
const { sequelize } = require("../src/models");
const observationRepository = require("../src/repositories/observation.repository");
const pointInTimeService = require("../src/services/point-in-time.service");
const { primeiroVencimentoKc } = require("../src/factors/basis-icf-kc");
const { ajustarRolagem } = require("../src/factors/base/ic-fatores");
const custos = require("../src/factors/custos-cafe.factor");
const validacao = require("../src/factors/regra-f4f5-validacao");

const SERIE_CEPEA = "CEPEA.CAFE_ARABICA.AVISTA_BRL";
const PREFIXO_CUSTO = "CONAB.CAFE_CUSTO.ARABICA";
const INICIO_DA_SOMBRA = "2026-10-23";

const argumento = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const fmt = (v, casas = 1) => (v === null || v === undefined ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(casas)}`);
const contrato = (data) => JSON.stringify(primeiroVencimentoKc(data));
const ordenar = (linhas) => linhas.map((l) => ({ data: String(l.observedAt).slice(0, 10), valor: l.value })).sort((a, b) => (a.data < b.data ? -1 : 1));

async function lerSeries(asOf) {
  const kc = ordenar(await pointInTimeService.obterAsOf({ seriesCodes: ["YAHOO.KC_CONTINUO.SETTLE"], asOf }));
  const linhasCepea = await pointInTimeService.obterAsOf({ seriesCodes: [SERIE_CEPEA], asOf });
  const cepea = ordenar(linhasCepea);
  return {
    linhasCepea,
    kc: { nome: "KC de Nova York (ajustado pela rolagem)", datas: kc.map((p) => p.data), valores: ajustarRolagem(kc, contrato) },
    cepea: { nome: "Cepea (físico, R$)", datas: cepea.map((p) => p.data), valores: cepea.map((p) => p.valor) }
  };
}

// As semanas da R1: o mesmo cálculo do F5, com o Cepea como o preço (já em reais).
async function semanasDoCepea(linhasCepea, asOf) {
  const municipios = await observationRepository.listarItens({ prefixoSerie: PREFIXO_CUSTO, campoReferencia: "TOTAL_SACA" });
  const seriesCusto = municipios.flatMap((m) => [`${PREFIXO_CUSTO}.${m.codigo}.OPERACIONAL_SACA`, `${PREFIXO_CUSTO}.${m.codigo}.TOTAL_SACA`]);
  const linhasCusto = await pointInTimeService.obterAsOf({ seriesCodes: seriesCusto, asOf, comMetadata: true });
  const desde2003 = linhasCepea.filter((l) => String(l.observedAt).slice(0, 10) >= "2003-01-01");
  return custos.derivarCustosCafe({ linhasKc: desde2003, linhasCusto, ptax: [] }, { precoEmReais: true });
}

function imprimir(titulo, r) {
  console.log(`\n${titulo}: ${r.n} semanas com o resultado | IC ${fmt(r.ic, 3)}`);
  for (const l of r.lados) {
    console.log(
      `  ${l.lado}: com sinal ${l.comSinal.n} semanas, subiu em ${fmt(l.comSinal.subiuPct)}% (média ${fmt(l.comSinal.retornoMedio)}%) | ` +
        `sem sinal ${l.semSinal.n}, ${fmt(l.semSinal.subiuPct)}% (média ${fmt(l.semSinal.retornoMedio)}%) | ` +
        `a favor ${fmt(l.diferencaPp)} p.p. | episódios ${l.episodios.length} (${l.episodios.join(", ") || "-"}) | ${l.veredito}`
    );
  }
}

async function main() {
  const sombra = process.argv.includes("--sombra");
  const asOf = new Date();
  const series = await lerSeries(asOf);
  const corte = (semanas) => (sombra ? semanas.filter((s) => s.ultimoPregao > INICIO_DA_SOMBRA) : semanas);
  const semanasKc = corte(await custos.METODOLOGIA.calcular({ asOf }));
  const semanasCepea = corte(await semanasDoCepea(series.linhasCepea, asOf));

  const resultado = {};
  for (const serie of [series.kc, series.cepea]) {
    const e9 = validacao.avaliar(validacao.amostras(semanasKc, serie, validacao.escoreF5), ["ALTA", "BAIXA"]);
    const r1 = validacao.avaliar(validacao.amostras(semanasCepea, serie, validacao.escoreR1), ["ALTA"]);
    imprimir(`E9, a regra do F5 (KC em reais) -> ${serie.nome}`, e9);
    imprimir(`E8, R1 (Cepea abaixo do custo) -> ${serie.nome}`, r1);
    resultado[serie.nome] = { e9, r1 };
  }
  const json = argumento("json");
  if (json) fs.writeFileSync(json, JSON.stringify({ geradoEm: asOf.toISOString(), sombra, resultado }, null, 2));
}

main()
  .then(() => sequelize.close())
  .catch(async (erro) => {
    console.error(erro);
    await sequelize.close();
    process.exit(1);
  });
