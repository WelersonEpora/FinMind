"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./noaa-cpc-enso.collector");

const RONI = `SEAS   YR  ANOM
DJF  1950 -1.19
NDJ  1950 -0.81
JAS  2026  1.69
`;
const ONI = ` SEAS  YR   TOTAL   ANOM
  JAS 2026  29.12   2.16
`;

test("ENSO (ADR 0134): o trimestre vira o mês central e a publicação estimada no dia 14 do mês seguinte ao fim", () => {
  assert.deepEqual(coletor.datasDoTrimestre("JAS", 2026), { observedAt: "2026-08-01", publishedAt: new Date("2026-10-14T23:59:59Z") });
  // DJF/1950 é dez/1949 a fev/1950, centrado em jan/1950; NDJ/1950, em dez/1950 (sai em fev/1951).
  assert.equal(coletor.datasDoTrimestre("DJF", 1950).observedAt, "1950-01-01");
  assert.deepEqual(coletor.datasDoTrimestre("NDJ", 1950), { observedAt: "1950-12-01", publishedAt: new Date("1951-02-14T23:59:59Z") });
  assert.equal(coletor.datasDoTrimestre("XYZ", 2026), null);
});

test("ENSO: o RONI e o ONI, a anomalia da última coluna, em °C, com a data estimada", () => {
  const itens = coletor.parse([
    { campo: "RONI", texto: RONI },
    { campo: "ONI", texto: ONI }
  ]);
  const { validos, invalidos } = coletor.normalize(itens);
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value]),
    [
      ["NOAA_CPC.ENSO.RONI", "1950-01-01", -1.19],
      ["NOAA_CPC.ENSO.RONI", "1950-12-01", -0.81],
      ["NOAA_CPC.ENSO.RONI", "2026-08-01", 1.69],
      ["NOAA_CPC.ENSO.ONI", "2026-08-01", 2.16]
    ]
  );
  assert.equal(validos[2].published_at_is_estimated, true);
  assert.equal(validos[2].metadata.trimestre, "JAS/2026");
});

test("ENSO: cabeçalho fora do formato é falha da fonte; linha com valor estranho, item inválido", () => {
  assert.throws(() => coletor.parse([{ campo: "RONI", texto: "<html>erro</html>" }]), /formato inesperado/);
  const { validos, invalidos } = coletor.normalize([{ campo: "RONI", trimestre: "JAS", ano: "2026", anomalia: "-99.9" }]);
  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 1);
});
