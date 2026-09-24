"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { URL } = require("node:url");
const { criarColetorVh, fimDaSemana, lerResposta, urlSerie, CULTURAS } = require("./noaa-vh.collector");

const coletor = criarColetorVh("milho");
const MILHO = CULTURAS.milho;
const regiao = (codigo) => MILHO.regioes.find((r) => r.codigo === codigo);

// Respostas no layout real do `get_TS_admin.php` (valores reais de 2026-09-24).
const RESPOSTA_BRASIL =
  "Mean data for BRA ,  from 2026 to 2026, weekly; version='GC_Current'<br>for   area with 'MAIZ' <br>\n" +
  "year,week, SMN,SMT,VCI,TCI, VHI<br>\n" +
  "<tt><pre>2026, 1, 0.384,296.39, 64.38, 35.01, 49.70,\n" +
  "2026,38, 0.309,300.08, 76.67, 50.08, 63.40,\n" +
  "2026,39,-1.000, -1.00, -1.00, -1.00, -1.00,\n" +
  "</pre></tt>";

const RESPOSTA_MT =
  "Mean data for BRA  Province= 11: Mato Grosso,  from 2021 to 2021, weekly; version='GC_Current'for   area with 'MAIZ' \n" +
  "year,week, SMN,SMT,VCI,TCI, VHI\n" +
  "<tt><pre>2021,22, 0.372,297.40, 40.84, 19.72, 30.28,\n</pre></tt>";

test("fimDaSemana: semana N termina no dia do ano 7N (guia da NOAA: semana 17 de 2013 = dias 113 a 119)", () => {
  assert.equal(fimDaSemana(2013, 17), "2013-04-29"); // dia 119
  assert.equal(fimDaSemana(2026, 1), "2026-01-07");
  assert.equal(fimDaSemana(2026, 38), "2026-09-23"); // a última disponível em 24/09/2026
  assert.equal(fimDaSemana(2024, 52), "2024-12-29"); // ano bissexto: dia 364
  assert.equal(fimDaSemana(2026, 0), null);
  assert.equal(fimDaSemana(2026, 53), null);
});

test("parse + normalize: VCI, TCI e VHI por semana; semana sem dado (-1) fica de fora; publicação no dia seguinte", () => {
  const { validos, invalidos } = coletor.normalize(coletor.parse({ respostas: [{ regiao: "BRASIL", texto: RESPOSTA_BRASIL }] }));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.published_at.toISOString()]),
    [
      ["NOAA_VH.MILHO.BRASIL.VCI", "2026-01-07", 64.38, "2026-01-08T23:59:59.000Z"],
      ["NOAA_VH.MILHO.BRASIL.TCI", "2026-01-07", 35.01, "2026-01-08T23:59:59.000Z"],
      ["NOAA_VH.MILHO.BRASIL.VHI", "2026-01-07", 49.7, "2026-01-08T23:59:59.000Z"],
      ["NOAA_VH.MILHO.BRASIL.VCI", "2026-09-23", 76.67, "2026-09-24T23:59:59.000Z"],
      ["NOAA_VH.MILHO.BRASIL.TCI", "2026-09-23", 50.08, "2026-09-24T23:59:59.000Z"],
      ["NOAA_VH.MILHO.BRASIL.VHI", "2026-09-23", 63.4, "2026-09-24T23:59:59.000Z"]
    ]
  );
  const [primeiro] = validos;
  assert.equal(primeiro.source_code, "NOAA_STAR_VH");
  assert.equal(primeiro.unit, "índice 0-100");
  assert.equal(primeiro.published_at_is_estimated, true);
  assert.equal(primeiro.metadata.cultura, "MAIZ");
  assert.equal(primeiro.metadata.pais, "BRA");
  assert.equal(primeiro.metadata.semana, 1);
});

test("estado: confere a província pedida; valor fora de 0-100 é inválido, sem derrubar o lote", () => {
  const itens = coletor.parse({ respostas: [{ regiao: "BR_MT", texto: RESPOSTA_MT }] });
  assert.equal(itens.length, 3);
  itens[0] = { ...itens[0], valor: "101" };
  const { validos, invalidos } = coletor.normalize(itens);
  assert.deepEqual(validos.map((v) => v.series_code), ["NOAA_VH.MILHO.BR_MT.TCI", "NOAA_VH.MILHO.BR_MT.VHI"]);
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /0-100/);
});

test("faixa global: o cabeçalho traz o código da faixa (W65) no lugar do país", () => {
  const resposta =
    "Mean data for W65 ( Global: 55S~65N),  from 2026 to 2026, weekly; version='GC_Current'<br>for   area with 'MAIZ' <br>\n" +
    "year,week, SMN,SMT,VCI,TCI, VHI<br>\n<tt><pre>2026,38, 0.310,297.16, 61.23, 39.01, 50.13,\n</pre></tt>";
  const { validos } = coletor.normalize(coletor.parse({ respostas: [{ regiao: "MUNDO", texto: resposta }] }));
  assert.deepEqual(validos.map((v) => [v.series_code, v.value]), [
    ["NOAA_VH.MILHO.MUNDO.VCI", 61.23],
    ["NOAA_VH.MILHO.MUNDO.TCI", 39.01],
    ["NOAA_VH.MILHO.MUNDO.VHI", 50.13]
  ]);
  assert.throws(() => lerResposta(resposta, MILHO, regiao("HEMISFERIO_SUL")), /cabeçalho esperado para WSH/);
});

test("lerResposta: resposta de outra região, cultura ou província, ou sem as colunas, é erro de fonte", () => {
  assert.throws(() => lerResposta(RESPOSTA_BRASIL, MILHO, regiao("EUA")), /cabeçalho esperado para USA/);
  assert.throws(() => lerResposta(RESPOSTA_BRASIL.replace("'MAIZ'", "'ACOF'"), MILHO, regiao("BRASIL")), /cultura MAIZ/);
  assert.throws(() => lerResposta(RESPOSTA_MT, MILHO, regiao("BR_PR")), /província 16/);
  assert.throws(() => lerResposta(RESPOSTA_BRASIL.replace("VCI,TCI", "X,Y"), MILHO, regiao("BRASIL")), /colunas esperadas/);
  assert.throws(() => coletor.parse({}), /formato inesperado/);
});

test("urlSerie: parâmetros da página da NOAA (país, província, cultura, versão, anos)", () => {
  const url = new URL(urlSerie(MILHO, regiao("EUA_IA"), 1981, 2026));
  assert.equal(url.pathname, "/smcd/emb/vci/VH/get_TS_admin.php");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    provinceID: "16",
    country: "USA",
    adminVHversion: "GC_Current",
    yearlyTag: "Weekly",
    type: "Mean",
    TagCropland: "MAIZ",
    year1: "1981",
    year2: "2026"
  });
});

test("download: uma requisição por região, do ano anterior ao corrente; erro HTTP vira falha de fonte", async () => {
  const fetchOriginal = global.fetch;
  const pedidos = [];
  global.fetch = async (url) => {
    pedidos.push(new URL(url));
    return { ok: true, text: async () => RESPOSTA_BRASIL };
  };
  try {
    const { respostas } = await coletor.download();
    const ano = new Date().getUTCFullYear();
    assert.equal(respostas.length, MILHO.regioes.length);
    assert.deepEqual(new Set(pedidos.map((u) => `${u.searchParams.get("year1")}-${u.searchParams.get("year2")}`)), new Set([`${ano - 1}-${ano}`]));
    assert.deepEqual(respostas.map((r) => r.regiao), MILHO.regioes.map((r) => r.codigo));

    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(() => coletor.download(), /respondeu com status 503/);
  } finally {
    global.fetch = fetchOriginal;
  }
});

test("criarColetorVh: cultura não configurada é erro de programação", () => {
  assert.equal(coletor.codigo, "noaa-vh-milho");
  assert.throws(() => criarColetorVh("cafe"), /não configurada/);
});
