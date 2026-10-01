"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./fred-cpi.collector");

// Trechos reais do ALFRED (output_type=1, realtime completo), consultados em 2026-10-01. Nenhum teste chama o FRED.
const obs = (date, realtime_start, value) => ({ realtime_start, realtime_end: "9999-12-31", date, value });
const RAW = {
  CPIAUCSL: {
    observations: [
      // jan/1990: 1ª versão em 1990-02-21, revisada 4 vezes pelo ajuste sazonal.
      obs("1990-01-01", "1990-02-21", "127.7"),
      obs("1990-01-01", "1991-02-20", "127.6"),
      obs("1990-01-01", "1994-02-17", "127.5"),
      obs("1990-01-01", "1995-02-15", "127.6"),
      obs("1990-01-01", "2002-02-20", "127.5"),
      // jan/1960: antes da 1ª versão guardada (1972-07-21) - a data é um limite superior.
      obs("1960-01-01", "1972-07-21", "29.37"),
      obs("2026-08-01", "2026-09-11", "334.131")
    ]
  },
  CPILFESL: { observations: [obs("2026-08-01", "2026-09-11", "338.2"), obs("2026-09-01", "2026-10-14", ".")] },
  CPIAUCNS: { observations: [] }
};

test("parse: uma linha por (mês, versão); '.' é ausência", () => {
  const itens = coletor.parse(RAW);
  assert.equal(itens.length, 8);
  assert.deepEqual(itens[0], { fredId: "CPIAUCSL", data: "1990-01-01", versao: "1990-02-21", valor: "127.7" });
});

test("parse rejeita uma série sem a lista de observações (formato inesperado)", () => {
  assert.throws(() => coletor.parse({ CPIAUCSL: { observations: [] }, CPILFESL: {} }));
});

test("normalize: cada versão com a data REAL do release, em ordem cronológica", () => {
  const { validos, invalidos } = coletor.normalize(coletor.parse(RAW));
  assert.equal(invalidos.length, 0);

  const jan90 = validos.filter((v) => v.series_code === "FRED.CPIAUCSL" && v.observed_at === "1990-01-01");
  assert.deepEqual(
    jan90.map((v) => [v.published_at.toISOString().slice(0, 10), v.value]),
    [["1990-02-21", 127.7], ["1991-02-20", 127.6], ["1994-02-17", 127.5], ["1995-02-15", 127.6], ["2002-02-20", 127.5]]
  );
  for (const v of validos) {
    assert.equal(v.source_code, "FRED_ALFRED");
    assert.equal(v.published_at_is_estimated, false);
  }
  const datas = validos.map((v) => v.published_at.getTime());
  assert.deepEqual(datas, [...datas].sort((a, b) => a - b));
});

test("normalize: o mês anterior à 1ª versão guardada fica marcado como limite superior; os demais não", () => {
  const { validos } = coletor.normalize(coletor.parse(RAW));
  const achar = (serie, data, versao) => validos.find((v) => v.series_code === serie && v.observed_at === data && v.metadata.versaoAlfred === versao);
  assert.equal(achar("FRED.CPIAUCSL", "1960-01-01", "1972-07-21").metadata.limiteSuperior, true);
  assert.equal(achar("FRED.CPIAUCSL", "1990-01-01", "1990-02-21").metadata.limiteSuperior, undefined);
  // Uma revisão tardia não é a 1ª versão: não vira limite superior.
  assert.equal(achar("FRED.CPIAUCSL", "1990-01-01", "2002-02-20").metadata.limiteSuperior, undefined);
  assert.equal(achar("FRED.CPILFESL", "2026-08-01", "2026-09-11").metadata.limiteSuperior, undefined);
});

test("persist: descarta as datas de versão já gravadas da fonte e grava o resto", async () => {
  const { validos } = coletor.normalize(coletor.parse(RAW));
  const jaGravada = new Date("1990-02-21T23:59:59Z");
  let recebidos = null;
  const deps = {
    observationRepository: { listarSeriesEInstantes: async () => [{ series_code: "FRED.CPIAUCSL", published_at: jaGravada }] },
    pointInTimeService: {
      registrarObservacoes: async (lote) => {
        recebidos = lote;
        return { criados: lote.length, atualizados: 0, ignorados: 0, falhas: [] };
      }
    }
  };
  const r = await coletor.persist(validos, { execucaoId: "x" }, deps);
  assert.equal(recebidos.length, validos.length - 1);
  assert.equal(r.ignorados, 1);
  assert.ok(!recebidos.some((v) => v.published_at.getTime() === jaGravada.getTime()));
});
