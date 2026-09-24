"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./bcb-focus.collector");

// Registros reais do IPCA 2026 (API Olinda, 2026-09-23): 07/09/2026 foi segunda e feriado (sem pesquisa).
const IPCA_2026 = [
  ["2026-08-31", 5, 141],
  ["2026-09-01", 5, 141],
  ["2026-09-02", 5, 141],
  ["2026-09-03", 5, 144],
  ["2026-09-04", 5, 145],
  ["2026-09-08", 5, 144],
  ["2026-09-09", 5, 144],
  ["2026-09-10", 5, 145],
  ["2026-09-11", 4.9, 147],
  ["2026-09-14", 4.9094, 145]
].map(([Data, Mediana, numeroRespondentes]) => ({
  Indicador: "IPCA",
  IndicadorDetalhe: null,
  Data,
  DataReferencia: "2026",
  Mediana,
  numeroRespondentes,
  baseCalculo: 0
}));

const resposta = (indicador, registros) => ({ indicador, url: `https://exemplo/${indicador}`, corpo: { value: registros } });

test("mapearBoletins: último dia com pesquisa da semana; publicação no 1º dia com pesquisa seguinte (feriado sai da fonte)", () => {
  const boletins = collector.mapearBoletins(IPCA_2026.map((r) => r.Data));
  assert.deepEqual([...boletins], [
    ["2026-09-04", "2026-09-08"], // segunda 07/09 feriado: o boletim saiu na terça
    ["2026-09-11", "2026-09-14"],
    ["2026-09-14", null] // semana mais recente: a fonte ainda não tem o dia seguinte
  ]);
});

test("mapearBoletins: sexta feriado -> o boletim é a quinta", () => {
  // Semana da Sexta-feira Santa de 2026 (03/04): última pesquisa na quinta 02/04.
  const boletins = collector.mapearBoletins(["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-06"]);
  assert.deepEqual([...boletins], [["2026-04-02", "2026-04-06"], ["2026-04-06", null]]);
});

test("parse + normalize: uma observação por boletim, observed_at = pesquisa, published_at estimado separado", () => {
  const { validos, invalidos } = collector.normalize(collector.parse([resposta("IPCA", IPCA_2026)]));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.observed_at, v.value, v.published_at?.toISOString() ?? null]),
    [
      ["2026-09-04", 5, "2026-09-08T23:59:59.000Z"],
      ["2026-09-11", 4.9, "2026-09-14T23:59:59.000Z"],
      ["2026-09-14", 4.9094, null]
    ]
  );

  const [primeiro] = validos;
  assert.equal(primeiro.series_code, "BCB_FOCUS.ANUAL.2026.IPCA");
  assert.equal(primeiro.source_code, "BCB_FOCUS");
  assert.equal(primeiro.unit, "%");
  assert.equal(primeiro.published_at_is_estimated, true);
  assert.equal(primeiro.published_at_basis, "lag_rule");
  assert.equal(primeiro.metadata.dataPesquisa, "2026-09-04");
  assert.equal(primeiro.metadata.anoReferencia, "2026");
  assert.equal(primeiro.metadata.numeroRespondentes, 145);
  assert.equal(primeiro.metadata.regraPublicacao, "primeiro_dia_com_pesquisa_apos_a_semana");

  // Sem dia seguinte na fonte: nenhuma data de publicação inventada (o serviço usa collected_at).
  const ultimo = validos.at(-1);
  assert.equal("published_at" in ultimo, false);
  assert.equal(ultimo.metadata.regraPublicacao, "sem_dia_seguinte_na_fonte");
});

test("normalize: um código de série por indicador e ano-alvo, com a unidade de cada indicador", () => {
  const registro = (Indicador, DataReferencia, Mediana) => ({ Indicador, IndicadorDetalhe: null, Data: "2026-09-18", DataReferencia, Mediana, numeroRespondentes: 100, baseCalculo: 0 });
  const { validos } = collector.normalize(
    collector.parse([
      resposta("IPCA", [registro("IPCA", "2027", 4.3)]),
      resposta("Selic", [registro("Selic", "2027", 12)]),
      resposta("Câmbio", [registro("Câmbio", "2027", 5.275)])
    ])
  );
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.unit, v.value]),
    [
      ["BCB_FOCUS.ANUAL.2027.IPCA", "%", 4.3],
      ["BCB_FOCUS.ANUAL.2027.SELIC", "% a.a.", 12],
      ["BCB_FOCUS.ANUAL.2027.CAMBIO", "R$/US$", 5.275]
    ]
  );
});

test("normalize: registro fora do esperado vira inválido sem derrubar o lote", () => {
  const base = { Indicador: "IPCA", IndicadorDetalhe: null, Data: "2026-09-18", Mediana: 4.3, numeroRespondentes: 1, baseCalculo: 0 };
  const { validos, invalidos } = collector.normalize(
    collector.parse([
      resposta("IPCA", [
        { ...base, DataReferencia: "2027" },
        { ...base, DataReferencia: "2027" }, // repetido
        { ...base, DataReferencia: "2028", Mediana: null },
        { ...base, DataReferencia: "2029", IndicadorDetalhe: "Fim do ano" },
        { ...base, DataReferencia: "2030", baseCalculo: 1 },
        { ...base, DataReferencia: "12/2027" },
        { ...base, Data: "18/09/2026", DataReferencia: "2027" }
      ])
    ])
  );
  assert.equal(validos.length, 1);
  assert.equal(invalidos.length, 6);
  const motivos = invalidos.map((i) => i.motivo).join("\n");
  for (const esperado of [/repetido/, /Mediana inválida/, /IndicadorDetalhe/, /baseCalculo/, /Ano de referência/, /Data da pesquisa/]) {
    assert.match(motivos, esperado);
  }
});

test("parse: resposta sem lista ou no limite de linhas é falha da fonte", () => {
  assert.throws(() => collector.parse({}), /formato inesperado/);
  assert.throws(() => collector.parse([resposta("IPCA", undefined)]), /sem a lista/);
  assert.throws(() => collector.parse([resposta("IPCA", new Array(100000).fill({}))]), /limite pedido/);
});

test("montarUrl: só o indicador pedido, base 30 dias, intervalo de datas e campos mínimos", () => {
  const url = decodeURIComponent(collector.montarUrl(collector.INDICADORES[2], { dataInicial: "2026-08-19", dataFinal: "2026-09-23" }));
  assert.match(url, /ExpectativasMercadoAnuais\?/);
  assert.match(url, /Indicador eq 'Câmbio' and baseCalculo eq 0 and Data ge '2026-08-19' and Data le '2026-09-23'/);
  assert.match(url, /\$select=Indicador,IndicadorDetalhe,Data,DataReferencia,Mediana,numeroRespondentes,baseCalculo/);
});

test("download: janela de 35 dias, uma requisição por indicador (IPCA, Selic, Câmbio)", async () => {
  const urls = [];
  const raw = await collector.download({
    hoje: "2026-09-23",
    baixarFn: async (url) => {
      urls.push(decodeURIComponent(url));
      return { value: [] };
    }
  });
  assert.deepEqual(raw.map((r) => r.indicador), ["IPCA", "Selic", "Câmbio"]);
  assert.ok(urls.every((u) => u.includes("Data ge '2026-08-19'")));
});
