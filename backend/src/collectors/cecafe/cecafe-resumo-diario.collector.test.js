"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./cecafe-resumo-diario.collector");

// Trecho real da página (2026-10-01), reduzido a 2 linhas por tabela. Nenhum teste chama o Cecafé.
const cabecalho =
  '<tr><th>Unidade</th><th colspan="4">Movimento do Dia</th><th colspan="4">Acumulado</th><th colspan="4">Mês Anterior</th></tr>' +
  "<tr><th>Arábica</th><th>Conillon</th><th>Solúvel</th><th>Total</th><th>Arábica</th><th>Conillon</th><th>Solúvel</th><th>Total</th><th>Arábica</th><th>Conillon</th><th>Solúvel</th><th>Total</th></tr>";
const linha = (...c) => `<tr>${c.map((x) => `<td>${x}</td>`).join("")}</tr>`;
const tabela = (...linhas) => `<table>${cabecalho}${linhas.join("")}</table>`;

const HTML = `<html><body><h1>Resumo Diário – Exportações Brasileiras de Café</h1>
<div>Mês Atual Mês Anterior</div>
<p>Informações recebidas até: 30/09/2026</p><h3>Setembro 2026</h3><p>Volume em sacas de 60 Kg</p>
<h4>Emissão de Certificados de Origem</h4>
${tabela(
  linha("SANTOS", "121.551", "1.653", "14.930", "138.134", "2.180.339", "73.243", "181.777", "2.435.359", "1.915.248", "95.397", "224.125", "2.234.770"),
  linha("TOTAIS", "142.485", "19.391", "20.518", "182.394", "2.895.876", "877.430", "299.093", "4.072.399", "2.574.850", "799.047", "351.196", "3.725.093")
)}
<h4>Unidades de Despachos Aduaneiros</h4>
${tabela(linha("VITÓRIA", "6.880", "13.725", "0", "20.605", "43.784", "540.821", "7.780", "592.385", "50.012", "612.241", "25.521", "687.774"))}
<h4>Unidades de Embarques Marítimos e Rodoviários</h4>
${tabela(linha("REDEX e EADI (MINAS GERAIS)", "0", "0", "0", "0", "93.859", "1.734", "0", "95.593", "146.646", "0", "0", "146.646"))}
<p>Informações recebidas até: 30/09/2026</p><h3>Agosto 2026</h3><p>Volume em sacas de 60 Kg</p>
<h4>Emissão de Certificados de Origem</h4>
${tabela(linha("TOTAIS", "0", "0", "0", "0", "2.616.453", "808.730", "350.745", "3.775.928", "2.018.072", "928.050", "378.706", "3.324.828"))}
<table><tr><td>outra tabela do site</td></tr></table>
</body></html>`;

test("parse: cada linha das 3 tabelas, com a data das informações e o mês da aba", () => {
  const itens = coletor.parse(HTML);
  assert.equal(itens.length, 5);
  assert.deepEqual(
    itens.map((i) => [i.indicador, i.mes, i.unidade]),
    [
      ["CERTIFICADOS", "2026-09-01", "SANTOS"],
      ["CERTIFICADOS", "2026-09-01", "TOTAIS"],
      ["DESPACHOS", "2026-09-01", "VITÓRIA"],
      ["EMBARQUES", "2026-09-01", "REDEX e EADI (MINAS GERAIS)"],
      ["CERTIFICADOS", "2026-08-01", "TOTAIS"]
    ]
  );
  assert.ok(itens.every((i) => i.dataInformacoes === "2026-09-30"));
});

test("normalize: só o ACUMULADO do mês, por tipo, com a data das informações; o movimento do dia e o 'mês anterior' ficam de fora", () => {
  const { validos, invalidos } = coletor.normalize(coletor.parse(HTML));
  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 5 * 4);
  const achar = (serie, mes) => validos.find((v) => v.series_code === serie && v.observed_at === mes);
  assert.equal(achar("CECAFE.CERTIFICADOS.TOTAL.TOTAL", "2026-09-01").value, 4072399);
  assert.equal(achar("CECAFE.CERTIFICADOS.TOTAL.ARABICA", "2026-09-01").value, 2895876);
  assert.equal(achar("CECAFE.CERTIFICADOS.TOTAL.CONILON", "2026-09-01").value, 877430);
  // Agosto pela aba de agosto (3.775.928), não pela coluna "Mês Anterior" da aba de setembro (3.725.093).
  assert.equal(achar("CECAFE.CERTIFICADOS.TOTAL.TOTAL", "2026-08-01").value, 3775928);
  assert.equal(achar("CECAFE.DESPACHOS.VITORIA.CONILON", "2026-09-01").value, 540821);
  assert.equal(achar("CECAFE.EMBARQUES.REDEX_EADI_MG.TOTAL", "2026-09-01").value, 95593);
  const v = achar("CECAFE.CERTIFICADOS.SANTOS.TOTAL", "2026-09-01");
  assert.equal(v.published_at.toISOString(), "2026-09-30T23:59:59.000Z");
  assert.equal(v.unit, "sacas 60 kg");
  assert.ok(!validos.some((x) => [138134, 182394, 3725093].includes(x.value)), "nada do movimento do dia nem do mês anterior");
});

test("unidade nova ou número fora do formato brasileiro vira inválido", () => {
  const { invalidos } = coletor.normalize([
    { indicador: "CERTIFICADOS", dataInformacoes: "2026-09-30", mes: "2026-09-01", unidade: "PARANAGUÁ", valores: Array(12).fill("1") },
    { indicador: "CERTIFICADOS", dataInformacoes: "2026-09-30", mes: "2026-09-01", unidade: "SANTOS", valores: ["0", "0", "0", "0", "1,5", "0", "0", "0", "0", "0", "0", "0"] }
  ]);
  assert.equal(invalidos.length, 2);
});

test("parse rejeita página sem o resumo diário", () => {
  assert.throws(() => coletor.parse("<html>manutenção</html>"));
  assert.throws(() => coletor.parse("<html>Resumo Diário, mas sem tabelas</html>"));
});
