"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolverIntervalo, paraDataBr } = require("./backfill-dolar");

function paraData(dataBr) {
  const [dia, mes, ano] = dataBr.split("/").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

test("paraDataBr formata uma data em DD/MM/AAAA", () => {
  assert.equal(paraDataBr(new Date(Date.UTC(2026, 8, 14))), "14/09/2026");
});

test("resolverIntervalo usa 60 dias por padrão quando nenhum argumento é passado", () => {
  const { dataInicial, dataFinal } = resolverIntervalo({});
  const diffDias = (paraData(dataFinal) - paraData(dataInicial)) / (1000 * 60 * 60 * 24);
  assert.equal(diffDias, 60);
});

test("resolverIntervalo respeita --dias explícito", () => {
  const { dataInicial, dataFinal } = resolverIntervalo({ dias: "10" });
  const diffDias = (paraData(dataFinal) - paraData(dataInicial)) / (1000 * 60 * 60 * 24);
  assert.equal(diffDias, 10);
});

test("resolverIntervalo usa dataInicial/dataFinal explícitos quando fornecidos", () => {
  const resultado = resolverIntervalo({ dataInicial: "01/06/2026", dataFinal: "30/06/2026" });
  assert.deepEqual(resultado, { dataInicial: "01/06/2026", dataFinal: "30/06/2026" });
});

test("resolverIntervalo usa hoje como dataFinal quando só dataInicial é fornecida", () => {
  const { dataInicial, dataFinal } = resolverIntervalo({ dataInicial: "01/06/2026" });
  assert.equal(dataInicial, "01/06/2026");
  assert.equal(dataFinal, paraDataBr(new Date()));
});

const { dividirEmJanelas } = require("./backfill-dolar");

test("dividirEmJanelas: intervalo de até 10 anos vira uma janela só", () => {
  assert.deepEqual(dividirEmJanelas("01/06/2026", "21/09/2026"), [{ dataInicial: "01/06/2026", dataFinal: "21/09/2026" }]);
});

test("dividirEmJanelas: histórico desde o Real vira 4 janelas contíguas, sem sobreposição e cada uma com até 10 anos", () => {
  const janelas = dividirEmJanelas("01/07/1994", "21/09/2026");

  assert.deepEqual(janelas, [
    { dataInicial: "01/07/1994", dataFinal: "30/06/2004" },
    { dataInicial: "01/07/2004", dataFinal: "30/06/2014" },
    { dataInicial: "01/07/2014", dataFinal: "30/06/2024" },
    { dataInicial: "01/07/2024", dataFinal: "21/09/2026" }
  ]);
});

test("dividirEmJanelas: cada janela cobre menos que 10 anos e uma começa no dia seguinte ao fim da anterior", () => {
  const janelas = dividirEmJanelas("29/02/2000", "21/09/2026");

  for (let i = 0; i < janelas.length; i += 1) {
    const inicio = paraData(janelas[i].dataInicial);
    const fim = paraData(janelas[i].dataFinal);
    const limite = new Date(Date.UTC(inicio.getUTCFullYear() + 10, inicio.getUTCMonth(), inicio.getUTCDate()));
    assert.ok(fim < limite, `janela ${i} passa de 10 anos`);
    if (i > 0) {
      const fimAnterior = paraData(janelas[i - 1].dataFinal);
      assert.equal((inicio - fimAnterior) / (1000 * 60 * 60 * 24), 1, `janela ${i} não é contígua`);
    }
  }
  assert.equal(janelas.at(-1).dataFinal, "21/09/2026");
});

test("dividirEmJanelas: dataInicial depois da dataFinal não gera janelas", () => {
  assert.deepEqual(dividirEmJanelas("01/10/2026", "21/09/2026"), []);
});
