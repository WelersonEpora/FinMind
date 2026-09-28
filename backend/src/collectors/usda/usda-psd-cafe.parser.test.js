"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerLinhaCsv, extrairPsdCafe } = require("./usda-psd-cafe.parser");

// Cabeçalho e linhas no layout REAL do arquivo de 2026-09-28 (aspas só em alguns campos).
const CABECALHO =
  "Commodity_Code,Commodity_Description,Country_Code,Country_Name,Market_Year,Calendar_Year,Month,Attribute_ID,Attribute_Description,Unit_ID,Unit_Description,Value";
const linha = ({ pais = "BR", nome = "Brazil", safra = "2025", ano = "2026", mes = "07", id = "028", atributo = "Production", unidade = "(1000 60 KG BAGS)", valor = "63000.0000" } = {}) =>
  `0711100,"Coffee, Green",${pais},"${nome}",${safra},${ano},${mes},${id},"${atributo}",02,"${unidade}",${valor}`;
const csv = (...linhas) => [CABECALHO, ...linhas].join("\r\n");

test("lerLinhaCsv respeita vírgula dentro de aspas e aspas duplicadas", () => {
  assert.deepEqual(lerLinhaCsv('a,"Rst,Ground Dom. Consum",b'), ["a", "Rst,Ground Dom. Consum", "b"]);
  assert.deepEqual(lerLinhaCsv('"diz ""oi""",2'), ['diz "oi"', "2"]);
});

test("extrai os 7 atributos coletados e ignora os demais", () => {
  const { observacoes, invalidos, ignorados } = extrairPsdCafe(
    csv(
      linha(),
      linha({ id: "029", atributo: "Arabica Production", valor: "38000.0000" }),
      linha({ id: "141", atributo: "Rst,Ground Dom. Consum", valor: "1.0000" }),
      linha({ id: "086", atributo: "Total Supply", valor: "70000.0000" })
    )
  );
  assert.equal(invalidos.length, 0);
  assert.equal(ignorados, 2);
  assert.deepEqual(
    observacoes.map((o) => [o.seriesCode, o.observedAt, o.valor, o.safra, o.mesRevisao]),
    [
      ["USDA.PSD.CAFE.BR.PRODUCAO", "2025-01-01", 63000, "2025/26", "2026-07"],
      ["USDA.PSD.CAFE.BR.PRODUCAO_ARABICA", "2025-01-01", 38000, "2025/26", "2026-07"]
    ]
  );
});

test("Month 00 com Calendar_Year igual à safra = valor sem mês de revisão (não é inválido)", () => {
  const { observacoes, invalidos } = extrairPsdCafe(csv(linha({ safra: "1999", ano: "1999", mes: "00", valor: "30800" })));
  assert.equal(invalidos.length, 0);
  assert.equal(observacoes[0].mesRevisao, null);
  assert.equal(observacoes[0].safra, "1999/00");
});

test("Month 00 com outro ano, unidade trocada ou ID com outro significado vão para os inválidos", () => {
  const { observacoes, invalidos } = extrairPsdCafe(
    csv(
      linha({ safra: "2020", ano: "2021", mes: "00" }),
      linha({ pais: "CO", unidade: "(1000 MT)" }),
      linha({ pais: "VM", atributo: "Bean Exports" }),
      linha({ pais: "ET", valor: "" })
    )
  );
  assert.equal(observacoes.length, 0);
  assert.equal(invalidos.length, 4);
});

test("a mesma chave repetida: igual vira uma, diferente vai para os inválidos", () => {
  const iguais = extrairPsdCafe(csv(linha(), linha()));
  assert.equal(iguais.observacoes.length, 1);
  const diferentes = extrairPsdCafe(csv(linha(), linha({ valor: "64000" })));
  assert.equal(diferentes.observacoes.length, 0);
  assert.equal(diferentes.invalidos.length, 1);
});

test("cabeçalho diferente do conhecido derruba a leitura", () => {
  assert.throws(() => extrairPsdCafe("Commodity,Country,Value\r\n1,2,3"), /Cabeçalho/);
  assert.doesNotThrow(() => extrairPsdCafe(`\uFEFF${CABECALHO}\n`));
});
