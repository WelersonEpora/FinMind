"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { ValidationError } = require("../../shared/errors");
const coletor = require("./cepea-cafe-planilha.collector");
const servico = require("../../services/cepea-importacao.service");

// Uma planilha no layout da exportação do Cepea (conferido no arquivo real de 2026-10-23): XLS, aba "Plan 1".
function planilha(linhas, titulo = "Café | INDICADOR DO CAFÉ ARÁBICA CEPEA/ESALQ") {
  const dados = [
    [titulo],
    ["Nota", "por saca de 60kg líqüido, bica corrida, tipo 6, bebida dura para melhor"],
    ["Fonte", "Cepea"],
    ["Data", "À vista R$", "À vista US$"],
    ...linhas
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), "Plan 1");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[null]]), "Worksheet");
  return XLSX.write(wb, { type: "buffer", bookType: "xls" });
}

test("lerNumero e lerData: o formato brasileiro da planilha", () => {
  assert.equal(coletor.lerNumero("1.620,92"), 1620.92);
  assert.equal(coletor.lerNumero("123,09"), 123.09);
  assert.ok(Number.isNaN(coletor.lerNumero("")));
  assert.ok(Number.isNaN(coletor.lerNumero("1,620.92")));
  assert.equal(coletor.lerData("22/10/2026"), "2026-10-22");
  assert.equal(coletor.lerData("31/02/2026"), null);
  assert.equal(coletor.lerData("2026-10-22"), null);
});

test("lerPlanilha: lê as linhas de dado e recusa outro indicador ou outro layout", () => {
  const { linhas } = coletor.lerPlanilha(planilha([["21/10/2026", "1.620,92", "322,38"], ["22/10/2026", "1.619,85", "321,72"]]));
  assert.deepEqual(linhas, [["21/10/2026", "1.620,92", "322,38"], ["22/10/2026", "1.619,85", "321,72"]]);

  assert.throws(() => coletor.lerPlanilha(planilha([], "Milho | INDICADOR DO MILHO ESALQ/BM&FBOVESPA"), "milho.xls"), (err) => {
    assert.ok(err instanceof ValidationError);
    assert.match(err.message, /"milho.xls" não é o Indicador do Café Arábica/);
    return true;
  });
  const semUsd = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(semUsd, XLSX.utils.aoa_to_sheet([["Café | INDICADOR DO CAFÉ ARÁBICA CEPEA/ESALQ"], [], [], ["Data", "Média"]]), "Plan 1");
  assert.throws(() => coletor.lerPlanilha(XLSX.write(semUsd, { type: "buffer", bookType: "xls" })), /colunas fora do layout/);
  assert.throws(() => coletor.lerPlanilha(Buffer.from("não é planilha")), ValidationError);
});

test("normalize: duas séries por dia, publicação estimada no fim do dia em Brasília", () => {
  const { validos, invalidos } = coletor.normalize([{ arquivo: "a.xls", linha: ["22/10/2026", "1.619,85", "321,72"] }]);
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.unit, v.source_code]),
    [
      ["CEPEA.CAFE_ARABICA.AVISTA_BRL", "2026-10-22", 1619.85, "BRL/saca", "CEPEA"],
      ["CEPEA.CAFE_ARABICA.AVISTA_USD", "2026-10-22", 321.72, "USD/saca", "CEPEA"]
    ]
  );
  assert.equal(validos[0].published_at.toISOString(), "2026-10-23T02:59:59.000Z");
  assert.equal(validos[0].published_at_is_estimated, true);
});

test("normalize: arquivos sobrepostos - o mesmo valor entra uma vez; valores diferentes, nenhum; linha ruim é inválida", () => {
  const { validos, invalidos } = coletor.normalize([
    { arquivo: "a.xls", linha: ["21/10/2026", "1.620,92", "322,38"] },
    { arquivo: "b.xls", linha: ["21/10/2026", "1.620,92", "322,38"] },
    { arquivo: "a.xls", linha: ["22/10/2026", "1.619,85", "321,72"] },
    { arquivo: "b.xls", linha: ["22/10/2026", "1.600,00", "321,72"] },
    { arquivo: "b.xls", linha: ["23/10/2026", "", "321,72"] }
  ]);
  assert.deepEqual([...new Set(validos.map((v) => v.observed_at))], ["2026-10-21"]);
  assert.equal(invalidos.length, 2);
  assert.match(invalidos.map((i) => i.motivo).join(" "), /2026-10-22: valores diferentes/);
  assert.match(invalidos.map((i) => i.motivo).join(" "), /Linha fora do formato em "b.xls"/);
});

test("importarPlanilhasCafe: confere os arquivos antes de gravar e resume a execução", async () => {
  await assert.rejects(() => servico.importarPlanilhasCafe([]), /Nenhum arquivo enviado/);
  let executou = false;
  const executarColetor = async () => {
    executou = true;
    return { id: "e1", status: "success", records_read: 2, records_created: 4, records_updated: 0, records_skipped: 0, records_failed: 0 };
  };
  await assert.rejects(
    () => servico.importarPlanilhasCafe([{ nome: "m.xls", conteudo: planilha([], "Milho | X") }], {}, { executarColetor }),
    /não é o Indicador do Café/
  );
  assert.equal(executou, false);

  const arquivo = planilha([["22/10/2026", "1.619,85", "321,72"], ["02/09/1996", "123,09", "121,15"]]);
  const { importacao } = await servico.importarPlanilhasCafe([{ nome: "c.xls", conteudo: arquivo }], { usuarioId: "u1" }, { executarColetor });
  assert.deepEqual(importacao.periodo, { de: "1996-09-02", ate: "2026-10-22" });
  assert.equal(importacao.valores.criados, 4);
  assert.equal(importacao.status, "success");
});

test("o coletor da importação lê os arquivos recebidos (nunca uma requisição ao Cepea)", async () => {
  const c = coletor.criarColetorCepeaCafePlanilha({ arquivos: [{ nome: "c.xls", conteudo: planilha([["22/10/2026", "1.619,85", "321,72"]]) }] });
  const itens = c.parse(await c.download({}));
  assert.deepEqual(itens, [{ arquivo: "c.xls", linha: ["22/10/2026", "1.619,85", "321,72"] }]);
});
