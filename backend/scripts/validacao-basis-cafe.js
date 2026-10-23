"use strict";

// O teste de convergência do basis B3 × Nova York do café, pré-registrado (ADR 0148). Só roda com 3 desvios ou mais de
// cada lado; antes disso, só conta os episódios e não calcula nenhum retorno. Não chama a IA e não grava nada.
//
// Uso: npm run validacao:basis

const { sequelize } = require("../src/models");
const { calcularBasisIcfKc } = require("../src/factors/basis-icf-kc");
const { calcularSerieContinuaIcf } = require("../src/factors/serie-continua-icf");
const { pregaoDepois } = require("../src/factors/base/ic-fatores");

const EPISODIOS_MINIMOS = 3;
const PREGOES = { MEDIO: 21, CURTO: 5 };
const DIFERENCA_MINIMA_PP = 10;

const fmt = (v, casas = 1) => (v === null || v === undefined ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(casas)}`);

function retorno(serie, data, pregoes) {
  const i = pregaoDepois(serie.datas, data);
  if (i === -1 || i + pregoes >= serie.datas.length) return null;
  return (serie.valores[i + pregoes] / serie.valores[i] - 1) * 100;
}

async function main() {
  const asOf = new Date();
  const { pontos, desvios } = await calcularBasisIcfKc({ asOf });
  const lados = { ABAIXO: desvios.filter((d) => d.lado === "ABAIXO"), ACIMA: desvios.filter((d) => d.lado === "ACIMA") };
  console.log(`Basis com par: ${pontos.length} pregões (${pontos[0]?.data} a ${pontos.at(-1)?.data}).`);
  for (const [lado, lista] of Object.entries(lados)) {
    console.log(`  ${lado === "ABAIXO" ? "ICF barato (z < -2)" : "ICF caro (z > +2)"}: ${lista.length} episódios (${lista.map((d) => d.data).join(", ") || "-"})`);
  }
  if (Object.values(lados).some((l) => l.length < EPISODIOS_MINIMOS)) {
    console.log(`\nO teste só roda com ${EPISODIOS_MINIMOS} episódios ou mais de cada lado (ADR 0148): nenhum retorno calculado.`);
    return;
  }

  const continua = (await calcularSerieContinuaIcf({ asOf })).pontos;
  const serie = { datas: continua.map((p) => p.data), valores: continua.map((p) => p.ajustado) };
  for (const [lado, lista] of Object.entries(lados)) {
    const sentido = lado === "ABAIXO" ? 1 : -1;
    const base = pontos.map((p) => retorno(serie, p.data, PREGOES.MEDIO)).filter((r) => r !== null);
    const basePct = (base.filter((r) => r * sentido > 0).length / base.length) * 100;
    const resultados = lista.map((d) => ({ ...d, medio: retorno(serie, d.data, PREGOES.MEDIO), curto: retorno(serie, d.data, PREGOES.CURTO) })).filter((d) => d.medio !== null);
    const acertoPct = (resultados.filter((d) => d.medio * sentido > 0).length / resultados.length) * 100;
    const medioNoSentido = resultados.reduce((s, d) => s + d.medio * sentido, 0) / resultados.length;
    const diferenca = acertoPct - basePct;
    const veredito =
      resultados.length < EPISODIOS_MINIMOS
        ? "INCONCLUSIVO"
        : diferenca >= DIFERENCA_MINIMA_PP && medioNoSentido > 0
          ? "PASSA"
          : diferenca < 0 || medioNoSentido <= 0
            ? "NAO_PASSA"
            : "INCONCLUSIVO";
    console.log(`\n${lado}: ${resultados.length} episódios com o resultado de ${PREGOES.MEDIO} pregões`);
    for (const d of resultados) console.log(`  ${d.data} z ${fmt(d.z, 2)}: ICF-CA ${fmt(d.medio)}% em ${PREGOES.MEDIO} pregões (${fmt(d.curto)}% em ${PREGOES.CURTO})`);
    console.log(`  no sentido previsto: ${fmt(acertoPct)}% dos episódios, contra ${fmt(basePct)}% da base (${fmt(diferenca)} p.p.); retorno médio no sentido ${fmt(medioNoSentido)}% | ${veredito}`);
  }
}

main()
  .then(() => sequelize.close())
  .catch(async (erro) => {
    console.error(erro);
    await sequelize.close();
    process.exit(1);
  });
