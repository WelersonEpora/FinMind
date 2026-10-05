"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const comex = require("./comex-exportacao.collector");

const coletor = comex.criarColetorComexExportacao("milho");

// Fixture real (POST /general, monthDetail: true, NCM 10059010, 2026-09-21), reduzida.
const LISTA_2026 = [
  { year: "2026", monthNumber: "08", metricFOB: "1002656682", metricKG: "4653100189" },
  { year: "2026", monthNumber: "01", metricFOB: "925674649", metricKG: "4245185990" },
  { year: "2026", monthNumber: "05", metricFOB: "61044053", metricKG: "249314295" }
];

function resposta(status, corpo) {
  return { status, ok: status >= 200 && status < 300, json: async () => corpo };
}
const ok = (lista) => resposta(200, { data: { list: lista }, success: true, message: null });

test("normalize gera duas séries por mês (kg e US$), em observed_at = dia 1º do mês", () => {
  const { validos, invalidos } = coletor.normalize(coletor.parse(LISTA_2026));

  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 6);

  const agosto = validos.filter((v) => v.observed_at === "2026-08-01");
  assert.deepEqual(
    agosto.map((v) => [v.series_code, v.value, v.unit]),
    [
      ["COMEX.MILHO.EXPORT.KG", 4653100189, "kg"],
      ["COMEX.MILHO.EXPORT.FOB_USD", 1002656682, "USD"]
    ]
  );
  assert.equal(agosto[0].source_code, "MDIC_COMEXSTAT");
  assert.equal(agosto[0].metadata.periodo, "2026-08");
  assert.equal(agosto[0].metadata.ncm, "10059010");
});

test("published_at é ESTIMADO: fim do dia 15 do mês seguinte (inclusive na virada de ano)", () => {
  const { validos } = coletor.normalize([
    { year: "2026", monthNumber: "08", metricFOB: "1", metricKG: "1" },
    { year: "2025", monthNumber: "12", metricFOB: "1", metricKG: "1" }
  ]);

  const agosto = validos.find((v) => v.observed_at === "2026-08-01");
  const dezembro = validos.find((v) => v.observed_at === "2025-12-01");

  assert.equal(agosto.published_at.toISOString(), "2026-09-15T23:59:59.000Z");
  assert.equal(dezembro.published_at.toISOString(), "2026-01-15T23:59:59.000Z");
  assert.equal(agosto.published_at_is_estimated, true);
  assert.equal(agosto.published_at_basis, "lag_rule");
});

test("normalize separa itens inválidos sem abortar o resto", () => {
  const { validos, invalidos } = coletor.normalize([
    { year: "2026", monthNumber: "13", metricFOB: "1", metricKG: "1" },
    { year: "2026", monthNumber: "02", metricFOB: "abc", metricKG: "10" },
    { year: "2026", monthNumber: "03", metricFOB: "5", metricKG: "20" }
  ]);

  // mês 13: 1 inválido; mês 02: FOB inválido (1) e KG válido (1); mês 03: 2 válidos.
  assert.equal(invalidos.length, 2);
  assert.equal(validos.length, 3);
  assert.equal(validos.filter((v) => v.observed_at === "2026-02-01").length, 1);
});

test("parse rejeita resposta que não é lista", () => {
  assert.throws(() => coletor.parse({ erro: true }), /formato inesperado/);
});

test("consultarAno pede o NCM do milho, exportação, com detalhe mensal e o ano inteiro", async () => {
  let corpoEnviado;
  const fetchFn = async (_url, opcoes) => {
    corpoEnviado = JSON.parse(opcoes.body);
    return ok(LISTA_2026);
  };

  const lista = await coletor.consultarAno(2026, { fetchFn });

  assert.equal(lista.length, 3);
  assert.equal(corpoEnviado.flow, "export");
  assert.equal(corpoEnviado.monthDetail, true);
  assert.deepEqual(corpoEnviado.period, { from: "2026-01", to: "2026-12" });
  assert.deepEqual(corpoEnviado.filters, [{ filter: "ncm", values: ["10059010"] }]);
  assert.deepEqual(corpoEnviado.metrics, ["metricFOB", "metricKG"]);
});

test("consultarAno espera e tenta de novo no 429 (rate limit), e depois devolve o dado", async () => {
  const respostas = [resposta(429, { error: { code: 429 } }), ok(LISTA_2026)];
  const esperas = [];

  const lista = await coletor.consultarAno(2026, {
    fetchFn: async () => respostas.shift(),
    esperar: async (ms) => esperas.push(ms)
  });

  assert.equal(lista.length, 3);
  assert.deepEqual(esperas, [comex.ESPERA_429_BASE_MS]);
});

test("consultarAno desiste depois de 5 respostas 429 seguidas, com espera crescente entre elas", async () => {
  let chamadas = 0;
  const esperas = [];
  await assert.rejects(
    () =>
      coletor.consultarAno(2026, {
        fetchFn: async () => {
          chamadas += 1;
          return resposta(429, {});
        },
        esperar: async (ms) => esperas.push(ms)
      }),
    /status 429/
  );
  assert.equal(chamadas, comex.MAX_TENTATIVAS_429);
  assert.deepEqual(esperas, [20000, 40000, 60000, 80000]);
});

test("consultarAno falha em erro HTTP que não é 429 e em corpo sem success", async () => {
  await assert.rejects(() => coletor.consultarAno(2026, { fetchFn: async () => resposta(500, {}) }), /status 500/);
  await assert.rejects(
    () => coletor.consultarAno(2026, { fetchFn: async () => resposta(200, { success: false }) }),
    /formato inesperado/
  );
});

test("baixarAnos consulta um ano por vez, com a pausa do rate limit entre eles (não antes do primeiro)", async () => {
  const anosPedidos = [];
  const esperas = [];
  const fetchFn = async (_url, opcoes) => {
    anosPedidos.push(JSON.parse(opcoes.body).period.from.slice(0, 4));
    return ok([]);
  };

  await coletor.baixarAnos([2024, 2025, 2026], { fetchFn, esperar: async (ms) => esperas.push(ms) });

  assert.deepEqual(anosPedidos, ["2024", "2025", "2026"]);
  assert.deepEqual(esperas, [comex.PAUSA_MS, comex.PAUSA_MS]);
});

test("intervaloDeAnos é inclusivo; o início validado é 2005 no milho e 1997 no café", () => {
  assert.deepEqual(comex.intervaloDeAnos(2005, 2007), [2005, 2006, 2007]);
  assert.equal(coletor.produto.anoInicial, 2005);
  assert.equal(comex.criarColetorComexExportacao("cafe").produto.anoInicial, 1997);
});

test("café: pede o NCM 09011110 e grava COMEX.CAFE.EXPORT.*, num coletor próprio", async () => {
  const cafe = comex.criarColetorComexExportacao("cafe");
  let corpoEnviado;
  await cafe.consultarAno(2024, {
    fetchFn: async (_url, opcoes) => {
      corpoEnviado = JSON.parse(opcoes.body);
      return ok([]);
    }
  });
  assert.deepEqual(corpoEnviado.filters, [{ filter: "ncm", values: ["09011110"] }]);

  // Fixture real (POST /general, NCM 09011110, dez/2024, consultado em 2026-09-28).
  const { validos } = cafe.normalize([{ year: "2024", monthNumber: "12", metricFOB: "1004088771", metricKG: "201847928" }]);
  assert.deepEqual(validos.map((v) => [v.series_code, v.value]), [
    ["COMEX.CAFE.EXPORT.KG", 201847928],
    ["COMEX.CAFE.EXPORT.FOB_USD", 1004088771]
  ]);
  assert.equal(validos[0].metadata.ncm, "09011110");
  assert.equal(cafe.codigo, "comex-cafe-exportacao");
  assert.equal(coletor.codigo, "comex-milho-exportacao");
  assert.throws(() => comex.criarColetorComexExportacao("soja"), /desconhecido/);
});

// Por país de destino (ADR 0034). Fixture real (details: ["country"], NCM 10059010, 2025, 2026-10-01), reduzida.
const LISTA_DESTINO_2025 = [
  { year: "2025", monthNumber: "12", country: "Irã", metricFOB: "368086266", metricKG: "1644538014" },
  { year: "2025", monthNumber: "12", country: "China", metricFOB: "10", metricKG: "20" },
  { year: "2025", monthNumber: "12", country: "País Inventado", metricFOB: "1", metricKG: "1" }
];

test("por destino: o país vira o código da tabela do Comex Stat (Irã = 372, China = 160), duas séries por país", () => {
  const destino = comex.criarColetorComexExportacao("milho-destino");
  assert.equal(destino.codigo, "comex-milho-exportacao-destino");

  const { validos, invalidos } = destino.normalize(destino.parse(LISTA_DESTINO_2025));
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.value]),
    [
      ["COMEX.MILHO.EXPORT_DESTINO.372.KG", 1644538014],
      ["COMEX.MILHO.EXPORT_DESTINO.372.FOB_USD", 368086266],
      ["COMEX.MILHO.EXPORT_DESTINO.160.KG", 20],
      ["COMEX.MILHO.EXPORT_DESTINO.160.FOB_USD", 10]
    ]
  );
  assert.deepEqual(
    [validos[0].metadata.paisDestino, validos[0].metadata.codigoPais, validos[0].observed_at],
    ["Irã", "372", "2025-12-01"]
  );
  // Nome fora da tabela: inválido (pede atualizar comex-pais.js), nunca uma série com o nome no lugar do código.
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /País Inventado/);
});

test("por destino: a consulta pede o detalhe por país; o total continua sem detalhe", async () => {
  const corpos = [];
  const fetchFn = async (_url, { body }) => {
    corpos.push(JSON.parse(body));
    return ok([]);
  };
  await comex.criarColetorComexExportacao("milho-destino").consultarAno(2025, { fetchFn });
  await comex.criarColetorComexExportacao("milho").consultarAno(2025, { fetchFn });
  assert.deepEqual(corpos[0].details, ["country"]);
  assert.deepEqual(corpos[1].details, []);
});

test("adubo (ADR 0074): importação dos 3 NCMs numa consulta, detalhada por NCM; duas séries por adubo", async () => {
  const adubo = comex.criarColetorComexExportacao("adubo");
  let corpo = null;
  // Fixture real (2024, reduzida): a resposta traz o NCM em `coNcm`.
  const lista = [
    { coNcm: "31021010", year: "2024", monthNumber: "03", ncm: "Ureia...", metricFOB: "200000000", metricKG: "600000000" },
    { coNcm: "31042090", year: "2024", monthNumber: "03", ncm: "Outros cloretos de potássio", metricFOB: "300000000", metricKG: "1100000000" },
    { coNcm: "99999999", year: "2024", monthNumber: "03", ncm: "Outro", metricFOB: "1", metricKG: "1" }
  ];
  const linhas = await adubo.consultarAno(2024, {
    fetchFn: async (_url, opcoes) => {
      corpo = JSON.parse(opcoes.body);
      return ok(lista);
    }
  });
  assert.equal(corpo.flow, "import");
  assert.deepEqual(corpo.filters, [{ filter: "ncm", values: ["31021010", "31042090", "31054000"] }]);
  assert.deepEqual(corpo.details, ["ncm"]);

  const { validos, invalidos } = adubo.normalize(adubo.parse(linhas));
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value]),
    [
      ["COMEX.ADUBO.UREIA.IMPORT.KG", "2024-03-01", 600000000],
      ["COMEX.ADUBO.UREIA.IMPORT.FOB_USD", "2024-03-01", 200000000],
      ["COMEX.ADUBO.KCL.IMPORT.KG", "2024-03-01", 1100000000],
      ["COMEX.ADUBO.KCL.IMPORT.FOB_USD", "2024-03-01", 300000000]
    ]
  );
  assert.deepEqual([validos[0].metadata.ncm, validos[0].metadata.fluxo], ["31021010", "import"]);
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /NCM fora do produto/);
});
