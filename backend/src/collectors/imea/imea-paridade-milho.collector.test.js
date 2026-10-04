"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./imea-paridade-milho.collector");

const dias = (datas, valores) => datas.map((data, i) => ({ data, valor: valores[i], texto: String(valores[i]) }));
const edicao = (data, d, extra = {}) => ({ id: `id-${data}`, nome: "Boletim Semanal - Milho", data, urlPublica: null, contrato: "jul/22", dias: d, invalidos: [], ...extra });

test("normalize: um valor por dia, published_at = o fim do dia da edição (data real do catálogo)", () => {
  const { validos, invalidos, avisos } = coletor.normalize(
    [edicao("2021-07-12", dias(["2021-07-05", "2021-07-06"], [59.65, 56.34]))],
    new Date("2026-10-04T12:00:00Z")
  );
  assert.equal(invalidos.length, 0);
  assert.equal(avisos.length, 0);
  assert.equal(validos.length, 2);
  assert.equal(validos[0].series_code, "IMEA.MILHO.PARIDADE_EXPORTACAO");
  assert.equal(validos[0].observed_at, "2021-07-05");
  assert.equal(validos[0].unit, "R$/sc");
  assert.equal(validos[0].published_at.toISOString(), "2021-07-12T23:59:59.000Z");
  assert.equal(validos[0].published_at_is_estimated, false);
  assert.equal(validos[0].metadata.contratoReferencia, "jul/22");
});

test("defeito da fonte: a semana com os valores da anterior e datas novas é pulada, com aviso (2021-07-19)", () => {
  const valores = [59.65, 56.34, 56.07, 56.17, 54.05];
  const { validos, avisos } = coletor.normalize([
    edicao("2021-07-19", dias(["2021-07-12", "2021-07-13", "2021-07-14", "2021-07-15", "2021-07-16"], valores)),
    edicao("2021-07-12", dias(["2021-07-05", "2021-07-06", "2021-07-07", "2021-07-08", "2021-07-09"], valores))
  ]);
  assert.equal(validos.length, 5);
  assert.ok(validos.every((v) => v.metadata.dataPublicacao === "2021-07-12"));
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].motivo, /repete os valores da edição de 2021-07-12/);
});

test("data com erro de digitação vira aviso; edição ilegível vira inválido sem derrubar as outras", () => {
  const { validos, invalidos, avisos } = coletor.normalize([
    edicao("2021-12-06", dias(["2021-11-29"], [67.12]), { invalidos: [{ data: "2021-11-01", motivo: "fora da semana" }] }),
    { id: "x", nome: "Boletim Semanal - Milho", data: "2025-10-06", erro: "Falha ao ler a paridade: sem cabeçalho" }
  ]);
  assert.equal(validos.length, 1);
  assert.equal(avisos.length, 1);
  assert.equal(invalidos.length, 1);
});

test("listagem: só o Boletim Semanal - Milho em PDF, uma edição por data, desde 2021-06-07", () => {
  assert.equal(coletor.ehEdicaoValida({ Nome: "Boletim Semanal - Milho", MimeType: "application/pdf", Path: "p" }), true);
  assert.equal(coletor.ehEdicaoValida({ Nome: "Boletim Semanal - Soja", MimeType: "application/pdf", Path: "p" }), false);
  const [e] = coletor.escolherUmaPorData([{ id: "100", data: "2026-09-28" }, { id: "99", data: "2026-09-28" }]);
  assert.equal(e.id, "100");
  assert.equal(coletor.DATA_INICIAL, "2021-06-07");
  assert.throws(() => coletor.parse({}));
});
