"use strict";

// Importa a planilha do Indicador do Café Arábica CEPEA/ESALQ exportada à mão do site do Cepea (ADR 0146): o mesmo
// service da tela de importação (Dados de Mercado > o card do Cepea, admin), que é o caminho no servidor.
//
// Uso (dev):
//   npm run importar:cepea-cafe -- --arquivo=../docs/Docs_Base/CEPEA/cepea-consulta-café-20261023142056.xls
//   (vários: --arquivo=a.xls,b.xls). Reexecutar é seguro: dia repetido é ignorado.

const fs = require("node:fs");
const path = require("node:path");
const { sequelize } = require("../src/models");
const { importarPlanilhasCafe } = require("../src/services/cepea-importacao.service");

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--arquivo="));
  if (!arg) throw new Error("Informe --arquivo=<planilha .xls exportada do Cepea>.");
  const arquivos = arg
    .slice("--arquivo=".length)
    .split(",")
    .map((p) => ({ nome: path.basename(p), conteudo: fs.readFileSync(p) }));
  const { importacao } = await importarPlanilhasCafe(arquivos);
  console.log(JSON.stringify(importacao, null, 2));
  if (importacao.status === "failed") process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
