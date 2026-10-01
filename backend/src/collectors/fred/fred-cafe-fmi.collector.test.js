"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./fred-cafe-fmi.collector");
const coletorCpi = require("./fred-cpi.collector");

// Trechos reais do ALFRED (output_type=1, realtime completo), consultados em 2026-10-01. Nenhum teste chama o FRED.
const obs = (date, realtime_start, realtime_end, value) => ({ realtime_start, realtime_end, date, value });
const RAW = {
  PCOFFOTMUSDM: {
    observations: [
      // 1980-01: nas versões antigas, retirado da série em 2019-07-23 (a versão atual é ".").
      obs("1980-01-01", "2015-11-06", "2015-12-06", "168.6700134"),
      obs("1980-01-01", "2015-12-07", "2019-07-22", "168.670013427734"),
      obs("1980-01-01", "2019-07-23", "9999-12-31", "."),
      // 2026-05: 1ª versão em 2026-06-05, revisada em 2026-07-13.
      obs("2026-05-01", "2026-06-05", "2026-07-12", "317.53"),
      obs("2026-05-01", "2026-07-13", "9999-12-31", "315.0595238095238"),
      // 2019-03: 1ª versão 109 dias depois do mês (o FRED ficou de 2017-07 a 2019-06 sem atualizar).
      obs("2019-03-01", "2019-06-18", "9999-12-31", "97.94")
    ]
  },
  PCOFFROBUSDM: { observations: [obs("2026-07-01", "2026-08-17", "9999-12-31", "185.23045454545448")] }
};

test("parse: uma linha por (mês, versão); o mês retirado da versão atual fica marcado", () => {
  const itens = coletor.parse(RAW);
  assert.equal(itens.length, 6);
  assert.deepEqual(
    itens.filter((i) => i.retirado).map((i) => i.versao),
    ["2015-11-06", "2015-12-07"]
  );
  assert.deepEqual(itens[3], { fredId: "PCOFFOTMUSDM", data: "2026-05-01", versao: "2026-07-13", valor: "315.0595238095238" });
});

test("normalize: o mês retirado não é gravado e vira aviso; as versões têm a data real do FRED", () => {
  const { validos, invalidos, avisos } = coletor.normalize(coletor.parse(RAW));
  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 4);
  assert.ok(validos.every((v) => v.observed_at !== "1980-01-01"));
  assert.equal(avisos.length, 1);
  assert.deepEqual(avisos[0].item, { fredId: "PCOFFOTMUSDM", meses: 1, de: "1980-01-01", ate: "1980-01-01" });

  const maio = validos.filter((v) => v.series_code === "FRED.PCOFFOTMUSDM" && v.observed_at === "2026-05-01");
  assert.deepEqual(
    maio.map((v) => [v.published_at.toISOString(), v.value]),
    [["2026-06-05T23:59:59.000Z", 317.53], ["2026-07-13T23:59:59.000Z", 315.0595238095238]]
  );
  for (const v of validos) {
    assert.equal(v.source_code, "FRED_ALFRED_FMI");
    assert.equal(v.unit, "USc/lb");
    assert.equal(v.published_at_is_estimated, false);
  }
});

test("normalize: a 1ª versão mais de 60 dias depois do mês é um limite superior; a revisão não", () => {
  const { validos } = coletor.normalize(coletor.parse(RAW));
  const achar = (data, versao) => validos.find((v) => v.observed_at === data && v.metadata.versaoAlfred === versao);
  assert.equal(achar("2019-03-01", "2019-06-18").metadata.limiteSuperior, true);
  assert.equal(achar("2026-05-01", "2026-06-05").metadata.limiteSuperior, undefined);
  assert.equal(achar("2026-05-01", "2026-07-13").metadata.limiteSuperior, undefined);
});

test("o café tem fonte própria: uma versão do CPI no mesmo dia não descarta a do café", async () => {
  assert.notEqual(coletor.SOURCE_CODE, coletorCpi.SOURCE_CODE);
  assert.equal(coletor.codigo, "fred-cafe-fmi");

  const { validos } = coletor.normalize(coletor.parse(RAW));
  let fonteConsultada = null;
  let recebidos = null;
  const deps = {
    observationRepository: {
      listarSeriesEInstantes: async (sourceCode) => {
        fonteConsultada = sourceCode;
        return [{ series_code: "FRED.PCOFFOTMUSDM", published_at: new Date("2026-06-05T23:59:59Z") }];
      }
    },
    pointInTimeService: {
      registrarObservacoes: async (lote) => {
        recebidos = lote;
        return { criados: lote.length, atualizados: 0, ignorados: 0, falhas: [] };
      }
    }
  };
  const r = await coletor.persist(validos, { execucaoId: "e1" }, deps);
  assert.equal(fonteConsultada, "FRED_ALFRED_FMI");
  assert.equal(r.ignorados, 1, "só a versão de 2026-06-05 já gravada");
  assert.equal(recebidos.length, 3);
});
