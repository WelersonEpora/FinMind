"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./bcb-reservas.collector");

// Pontos reais do SGS 13621 (API, 2026-09-23), com um salto de 08/09 para 22/09 só para o teste: 07/09/2026 foi
// segunda e feriado (sem ponto).
const PONTOS = [
  { data: "03/09/2026", valor: "373396" },
  { data: "04/09/2026", valor: "372881" },
  { data: "08/09/2026", valor: "372836" },
  { data: "22/09/2026", valor: "366890" }
];

test("parse + normalize: publicação estimada na próxima data da própria série; o ponto mais recente fica sem data", () => {
  const { validos, invalidos } = collector.normalize(collector.parse(PONTOS));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.observed_at, v.value, v.published_at?.toISOString() ?? null]),
    [
      ["2026-09-03", 373396, "2026-09-04T23:59:59.000Z"],
      ["2026-09-04", 372881, "2026-09-08T23:59:59.000Z"], // o feriado sai da fonte
      ["2026-09-08", 372836, "2026-09-22T23:59:59.000Z"],
      ["2026-09-22", 366890, null]
    ]
  );
  const [primeiro] = validos;
  assert.equal(primeiro.series_code, "BCB_SGS.RESERVAS_INTERNACIONAIS");
  assert.equal(primeiro.source_code, "BCB_SGS");
  assert.equal(primeiro.unit, "US$ milhões");
  assert.equal(primeiro.published_at_is_estimated, true);
  assert.equal(primeiro.published_at_basis, "lag_rule");
  assert.deepEqual(primeiro.metadata, { fonte: "BCB SGS", serieSgs: 13621, dataOriginal: "03/09/2026", regraPublicacao: "proxima_data_da_serie" });
  assert.equal("published_at" in validos.at(-1), false);
  assert.equal(validos.at(-1).metadata.regraPublicacao, "sem_data_seguinte_na_fonte");
});

test("normalize: data ou valor inválido e data repetida viram inválidos sem derrubar o lote", () => {
  const { validos, invalidos } = collector.normalize(
    collector.parse([
      { data: "03/09/2026", valor: "373396" },
      { data: "03/09/2026", valor: "373396" },
      { data: "2026-09-04", valor: "1" },
      { data: "08/09/2026", valor: "" },
      { data: "09/09/2026", valor: "-5" }
    ])
  );
  assert.equal(validos.length, 1);
  assert.deepEqual(invalidos.map((i) => i.motivo.split(":")[0]), ["Data repetida na resposta do SGS", "Data em formato inesperado", "Valor inválido", "Valor inválido"]);
});

test("parse: resposta que não é lista é falha da fonte", () => {
  assert.throws(() => collector.parse({ erro: "x" }), /formato inesperado/);
});

test("dividirEmJanelas: janelas de até 10 anos civis, sem buraco nem sobreposição", () => {
  assert.deepEqual(collector.dividirEmJanelas("1998-09-01", "2026-09-23"), [
    { dataInicial: "1998-09-01", dataFinal: "2007-12-31" },
    { dataInicial: "2008-01-01", dataFinal: "2017-12-31" },
    { dataInicial: "2018-01-01", dataFinal: "2026-09-23" }
  ]);
  assert.deepEqual(collector.dividirEmJanelas("2026-09-01", "2026-09-23"), [{ dataInicial: "2026-09-01", dataFinal: "2026-09-23" }]);
});

test("downloadIntervalo: resposta que não é JSON é repetida; na 3ª falha seguida, erro da fonte", async () => {
  let chamadas = 0;
  const pontos = await collector.downloadIntervalo({
    dataInicial: "2026-09-01",
    dataFinal: "2026-09-23",
    esperar: async () => {},
    baixarFn: async (url) => {
      chamadas += 1;
      assert.match(url, /dataInicial=01\/09\/2026&dataFinal=23\/09\/2026/);
      return chamadas === 1 ? "<?xml version='1.0'?><erro/>" : JSON.stringify(PONTOS);
    }
  });
  assert.equal(chamadas, 2);
  assert.equal(pontos.length, 4);

  await assert.rejects(
    () => collector.downloadIntervalo({ dataInicial: "2026-09-01", dataFinal: "2026-09-23", esperar: async () => {}, baixarFn: async () => "<html>" }),
    /não é JSON \(<html>\)/
  );
});

test("download: os 10 últimos pontos da série 13621", async () => {
  let pedida = null;
  await collector.download({
    baixarFn: async (url) => {
      pedida = url;
      return "[]";
    }
  });
  assert.equal(pedida, "https://api.bcb.gov.br/dados/serie/bcdata.sgs.13621/dados/ultimos/10?formato=json");
});
