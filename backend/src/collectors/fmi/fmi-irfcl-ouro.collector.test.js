"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./fmi-irfcl-ouro.collector");

const VOL = "IRFCLDT1_IRFCL56V_FTO";
const USD = "IRFCLDT1_IRFCL56_USD";

// Resposta SDMX JSON real (api.imf.org, 2026-10-01), reduzida: ago/2026 de alguns países.
const PAISES = ["USA", "CHN", "POL", "IND", "BRA", "TUR"];
const VALORES = {
  USA: [261499000, 11041058800],
  CHN: [76080000, 306354000000],
  POL: [20833000, 92398383000],
  IND: [28309311.059, 116251500000],
  BRA: [5544278722.99971, 24558327160.74],
  TUR: [25443000, 112000000000]
};
function respostaSdmx() {
  const series = {};
  PAISES.forEach((pais, p) => {
    series[`${p}:0:0:0`] = { attributes: [0, null, null], observations: { 0: [String(VALORES[pais][0])] } };
    series[`${p}:1:0:0`] = { attributes: [0, null, null], observations: { 0: [String(VALORES[pais][1])] } };
  });
  return {
    data: {
      dataSets: [{ series }],
      structures: [
        {
          attributes: { series: [{ id: "SCALE", values: [{ id: "6" }] }, { id: "DECIMALS_DISPLAYED" }, { id: "OVERLAP" }] },
          dimensions: {
            series: [
              { id: "COUNTRY", values: PAISES.map((id) => ({ id })) },
              { id: "INDICATOR", values: [{ id: VOL }, { id: USD }] },
              { id: "SECTOR", values: [{ id: "S1XS1311" }] },
              { id: "FREQUENCY", values: [{ id: "M" }] }
            ],
            observation: [{ id: "TIME_PERIOD", values: [{ id: "2026-M08", value: "2026-M08" }] }]
          }
        }
      ]
    }
  };
}

test("parse + normalize: duas séries por país, na escala declarada pelo FMI (SCALE 6 = milhões), sem published_at (vale a coleta)", () => {
  const { validos, invalidos } = coletor.normalize(coletor.parse(respostaSdmx()));
  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 12);
  const eua = validos.find((v) => v.series_code === "IMF.IRFCL.OURO.USA.VOLUME_MI_OZT");
  assert.equal(eua.value, 261.499);
  assert.equal(eua.unit, "mi oz troy");
  assert.equal(eua.observed_at, "2026-08-01");
  assert.equal(eua.source_code, "IMF_IRFCL");
  assert.equal(eua.published_at, undefined);
  const valorChina = validos.find((v) => v.series_code === "IMF.IRFCL.OURO.CHN.VALOR_MI_USD");
  assert.equal(valorChina.value, 306354);
  assert.equal(valorChina.unit, "mi USD");
});

test("conferência de unidade: Brasil (volume 1.000×) e EUA (valor contábil) ficam marcados, gravados como publicados; os demais não", () => {
  const { validos, avisos } = coletor.normalize(coletor.parse(respostaSdmx()));
  const bra = validos.find((v) => v.series_code === "IMF.IRFCL.OURO.BRA.VOLUME_MI_OZT");
  assert.equal(bra.value, 5544.278723, "só a escala declarada; o defeito de unidade nunca é corrigido");
  assert.equal(bra.metadata.conferenciaPreco.situacao, "fora_da_faixa");
  assert.equal(bra.metadata.conferenciaPreco.precoImplicitoUsdOz, 4.43);
  assert.ok(validos.find((v) => v.series_code === "IMF.IRFCL.OURO.USA.VOLUME_MI_OZT").metadata.conferenciaPreco);
  for (const pais of ["CHN", "POL", "IND", "TUR"]) {
    assert.equal(validos.find((v) => v.series_code === `IMF.IRFCL.OURO.${pais}.VOLUME_MI_OZT`).metadata.conferenciaPreco, undefined, pais);
  }
  assert.deepEqual(avisos.map((a) => a.item.pais).sort(), ["BRA", "USA"]);
});

test("conferência só vale com ao menos 5 países no mês (senão a mediana não é confiável)", () => {
  const raw = respostaSdmx();
  const poucos = Object.fromEntries(Object.entries(raw.data.dataSets[0].series).filter(([k]) => Number(k.split(":")[0]) < 3));
  raw.data.dataSets[0].series = poucos;
  const { avisos } = coletor.normalize(coletor.parse(raw));
  assert.equal(avisos.length, 0);
});

test("célula vazia é ausência; indicador, período ou escala inesperados viram inválido", () => {
  const { validos, invalidos } = coletor.normalize([
    { pais: "CHN", indicador: VOL, periodo: "2026-M08", valor: null, escala: 6 },
    { pais: "CHN", indicador: "OUTRO", periodo: "2026-M08", valor: "1", escala: 6 },
    { pais: "CHN", indicador: VOL, periodo: "2026-08", valor: "1", escala: 6 },
    { pais: "CHN", indicador: VOL, periodo: "2026-M08", valor: "1", escala: 3 }
  ]);
  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 3);
  assert.match(invalidos[2].motivo, /Escala/);
});

test("parse rejeita resposta fora do formato SDMX", () => {
  assert.throws(() => coletor.parse({ data: {} }));
  assert.throws(() => coletor.parse({ data: { structures: [{ dimensions: { series: [], observation: [] } }], dataSets: [{ series: {} }] } }));
});

test("o valor sai arredondado às 6 casas da coluna: a 2ª coleta não vê revisão onde não há", () => {
  const { validos } = coletor.normalize([{ pais: "G163", indicador: USD, periodo: "2026-M07", valor: "1409798217654.5", escala: 6 }]);
  assert.equal(validos[0].value, Number((1409798217654.5 / 1e6).toFixed(6)));
  assert.ok(String(validos[0].value).split(".")[1].length <= 6);
});
