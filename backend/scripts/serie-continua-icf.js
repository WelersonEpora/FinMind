"use strict";

// A série contínua do ICF (PROPOSTA da análise do café de 2026-10-19, itens E1 e E11; factors/serie-continua-icf.js):
// imprime as trocas de vencimento, com o motivo, os negócios e a razão do ajuste, para conferir a regra. Só lê o banco;
// nada é gravado. Com --csv=<arquivo>, grava a série (data, contrato, ajuste real e ajustado) nesse arquivo.
//
// Uso:
//   node scripts/serie-continua-icf.js
//   node scripts/serie-continua-icf.js --csv=icf-continuo.csv --pregoesLiquidez=5 --pregoesTrava=10

const fs = require("node:fs");
const { sequelize } = require("../src/models");
const { calcularSerieContinuaIcf, ultimoPregaoIcf, FERIADOS_FIXOS } = require("../src/factors/serie-continua-icf");
const { pregoesEntre } = require("../src/factors/base/serie-continua-futuro");
const { decodificarFuturoB3 } = require("../src/shared/utils/b3-contrato");

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const { csv, ...resto } = parseArgs();
  const parametros = Object.fromEntries(Object.entries(resto).map(([chave, valor]) => [chave, Number(valor)]));
  const { pontos, trocas, parametros: usados } = await calcularSerieContinuaIcf({ parametros });

  console.log(`Série contínua do ICF: ${pontos.length} pregões, de ${pontos[0]?.data} a ${pontos.at(-1)?.data}; parâmetros ${JSON.stringify(usados)}`);
  console.log("Troca      | De     -> Para   | Motivo   | Pregões até o vencimento | Negócios (5 pregões) | Ajustes          | Razão");
  for (const t of trocas) {
    const ultimo = ultimoPregaoIcf(decodificarFuturoB3(t.de, "ICF"));
    const restantes = pregoesEntre(t.data, ultimo, FERIADOS_FIXOS);
    const precos = `${t.precoDe?.toFixed(2) ?? "-"} -> ${t.precoPara.toFixed(2)}`;
    console.log(
      `${t.data} | ${t.de} -> ${t.para} | ${t.motivo.padEnd(8)} | ${String(restantes).padStart(24)} | ${`${t.negociadosDe} x ${t.negociadosPara}`.padStart(20)} | ${precos.padEnd(16)} | ${((t.razao - 1) * 100).toFixed(2)}%`
    );
  }
  if (csv) {
    const linhas = ["data,contrato,ajuste,ajustado", ...pontos.map((p) => `${p.data},${p.ticker},${p.valor},${p.ajustado.toFixed(4)}`)];
    fs.writeFileSync(csv, `${linhas.join("\n")}\n`);
    console.log(`CSV: ${csv}`);
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await sequelize.close();
    });
}
