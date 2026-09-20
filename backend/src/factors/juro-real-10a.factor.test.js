"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { derivarJuroReal10a, calcularJuroReal10a, FACTOR_ID, FACTOR_VERSION } = require("./juro-real-10a.factor");

const PUB = new Date("2020-07-15T23:59:59Z");
const linha = (seriesCode, observedAt, value, extra = {}) => ({ seriesCode, observedAt, value, unit: "% a.a.", publishedAt: PUB, publishedAtIsEstimated: true, revisionSeq: 0, ...extra });

test("o fator é o DFII10 do mesmo período, com versão e proveniência (disponivelEm)", () => {
  const pontos = derivarJuroReal10a([linha("FRED.DFII10", "2020-07-14", -0.78)]);

  assert.equal(pontos.length, 1);
  assert.deepEqual(
    { id: pontos[0].factorId, versao: pontos[0].factorVersion, obs: pontos[0].observedAt, valor: pontos[0].value },
    { id: FACTOR_ID, versao: FACTOR_VERSION, obs: "2020-07-14", valor: -0.78 }
  );
  assert.equal(pontos[0].disponivelEm.toISOString(), PUB.toISOString());
  assert.equal(pontos[0].disponivelEmEhEstimado, true);
});

test("validação cruzada: DGS10 - T10YIE reproduz o DFII10 (diferença 0)", () => {
  const [ponto] = derivarJuroReal10a([
    linha("FRED.DFII10", "2020-07-14", -0.78),
    linha("FRED.DGS10", "2020-07-14", 0.63),
    linha("FRED.T10YIE", "2020-07-14", 1.41)
  ]);

  assert.deepEqual(ponto.validacaoCruzada, { implicito: -0.78, diferenca: 0 });
});

test("a validação cruzada expõe divergência em vez de escondê-la", () => {
  const [ponto] = derivarJuroReal10a([
    linha("FRED.DFII10", "2020-07-14", -0.78),
    linha("FRED.DGS10", "2020-07-14", 0.63),
    linha("FRED.T10YIE", "2020-07-14", 1.4)
  ]);

  assert.equal(ponto.validacaoCruzada.diferenca, -0.01);
});

test("sem DFII10 no período não há ponto; sem os insumos de validação, validacaoCruzada é nula", () => {
  const pontos = derivarJuroReal10a([linha("FRED.DGS10", "2020-07-13", 0.6), linha("FRED.DFII10", "2020-07-14", -0.78)]);

  assert.equal(pontos.length, 1, "2020-07-13 só tem DGS10");
  assert.equal(pontos[0].validacaoCruzada, null);
});

test("saída ordenada por período e determinística (mesma entrada, mesma saída)", () => {
  const entrada = [linha("FRED.DFII10", "2020-07-16", -0.7), linha("FRED.DFII10", "2020-07-14", -0.78), linha("FRED.DFII10", "2020-07-15", -0.75)];

  assert.deepEqual(derivarJuroReal10a(entrada).map((p) => p.observedAt), ["2020-07-14", "2020-07-15", "2020-07-16"]);
  assert.deepEqual(derivarJuroReal10a(entrada), derivarJuroReal10a(entrada));
});

test("calcularJuroReal10a pede ao asOf as três séries e repassa asOf/estrito", async () => {
  const chamadas = [];
  const servico = {
    async obterAsOf(params) {
      chamadas.push(params);
      return [linha("FRED.DFII10", "2020-07-14", -0.78)];
    }
  };
  const asOf = new Date("2020-07-15T23:59:59Z");

  const pontos = await calcularJuroReal10a({ asOf, estrito: true }, { pointInTimeService: servico });

  assert.equal(pontos.length, 1);
  assert.deepEqual(chamadas[0].seriesCodes, ["FRED.DFII10", "FRED.DGS10", "FRED.T10YIE"]);
  assert.equal(chamadas[0].asOf, asOf);
  assert.equal(chamadas[0].estrito, true);
});
