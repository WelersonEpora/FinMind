"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { METODO, retornosDiarios, diferencasDiarias, intervaloBootstrap, veredito, somarMeses, segmentar, medirSegmento, mudancasDasLeituras } = require("./medicao");

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test("retornos em % do capital inicial; a diferença IA − Determinística só nos dias das duas", () => {
  const r = retornosDiarios([{ data: "2026-10-15", patrimonio: 10100 }, { data: "2026-10-14", patrimonio: 10050 }], 10000);
  perto(r.get("2026-10-14"), 0.5);
  perto(r.get("2026-10-15"), 0.5);
  const d = diferencasDiarias(
    [{ data: "2026-10-14", patrimonio: 10100 }, { data: "2026-10-15", patrimonio: 10100 }],
    [{ data: "2026-10-14", patrimonio: 10000 }, { data: "2026-10-15", patrimonio: 9900 }, { data: "2026-10-16", patrimonio: 9900 }],
    10000
  );
  assert.deepEqual(d.map((x) => x.data), ["2026-10-14", "2026-10-15"]);
  perto(d[0].diferenca, 1);
  perto(d[1].diferenca, 1);
});

test("bootstrap: reprodutível (semente fixa), contém a média, nulo com poucos dias", () => {
  const valores = Array.from({ length: 60 }, (_, i) => Math.sin(i) * 0.3 + 0.05);
  const a = intervaloBootstrap(valores);
  const b = intervaloBootstrap(valores);
  assert.deepEqual(a, b);
  assert.ok(a.inferior < a.media && a.media < a.superior);
  assert.equal(intervaloBootstrap(valores.slice(0, METODO.minimoDias - 1)), null);
});

test("veredito: agrega, não agrega, inconclusivo", () => {
  assert.equal(veredito({ inferior: 0.01, superior: 0.2 }), "AGREGA");
  assert.equal(veredito({ inferior: -0.2, superior: -0.01 }), "NAO_AGREGA");
  assert.equal(veredito({ inferior: -0.1, superior: 0.1 }), "INCONCLUSIVO");
  assert.equal(veredito(null), null);
  // Uma diferença sempre positiva e estável agrega.
  assert.equal(veredito(intervaloBootstrap(Array.from({ length: 40 }, (_, i) => 0.1 + (i % 3) * 0.01))), "AGREGA");
});

test("somar meses: o dia que falta vira o último do mês", () => {
  assert.equal(somarMeses("2026-10-14", 6), "2027-04-14");
  assert.equal(somarMeses("2026-10-14", 12), "2027-10-14");
  assert.equal(somarMeses("2026-08-31", 6), "2027-02-28");
  assert.equal(somarMeses("2027-11-30", 3), "2028-02-29");
});

test("segmentos: parâmetros, modelo ou prompt novos reiniciam; o dia sem informação herda", () => {
  const s = segmentar([
    { data: "2026-10-14", parametrosVersao: 1, modelo: "m1", versaoPrompt: "v1" },
    { data: "2026-10-15", parametrosVersao: null, modelo: null, versaoPrompt: null },
    { data: "2026-10-16", parametrosVersao: 1, modelo: "m1", versaoPrompt: "v1" },
    { data: "2026-10-19", parametrosVersao: 2, modelo: "m1", versaoPrompt: "v1" },
    { data: "2026-10-20", parametrosVersao: 2, modelo: "m2", versaoPrompt: "v1" }
  ]);
  assert.deepEqual(
    s.map((x) => [x.inicio, x.fim, x.mudou]),
    [
      ["2026-10-14", "2026-10-16", []],
      ["2026-10-19", "2026-10-19", ["parametrosVersao"]],
      ["2026-10-20", "2026-10-20", ["modelo"]]
    ]
  );
  // O modelo não fixado (nulo) no começo não abre segmento quando passa a ser conhecido.
  assert.equal(segmentar([{ data: "2026-10-14", parametrosVersao: 1, modelo: null }, { data: "2026-10-15", parametrosVersao: 1, modelo: "m1" }]).length, 1);
});

test("medir: antes de 6 meses, parcial sem veredito; depois, a avaliação congelada com os dias antes da data", () => {
  const dias = [];
  for (let d = new Date("2026-10-14T00:00:00Z"); dias.length < 200; d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) dias.push({ data: d.toISOString().slice(0, 10), diferenca: 0.05 + (dias.length % 5) * 0.01 });
  }
  const antes = medirSegmento({ diferencas: dias, inicio: "2026-10-14", hoje: "2027-01-10" });
  assert.deepEqual(antes.datas, { descritiva: "2027-01-14", avaliacao: "2027-04-14", final: "2027-10-14" });
  assert.equal(antes.avaliacao, null);
  assert.equal(antes.parcial.dias, 200);
  assert.ok(antes.parcial.intervalo);
  const depois = medirSegmento({ diferencas: dias, inicio: "2026-10-14", hoje: "2027-04-14" });
  assert.equal(depois.avaliacao.veredito, "AGREGA");
  assert.ok(depois.avaliacao.dias < 200);
  assert.ok(depois.serie.length === 200);
  perto(depois.serie[1].acumulada, dias[0].diferenca + dias[1].diferenca);
});

test("mudanças das leituras: a referência é a última antes do início; só as do segmento entram", () => {
  const l = (data, ativo, versaoPrompt, modelo = "g1") => ({ data, ativo, versaoPrompt, modelo });
  const r = mudancasDasLeituras(
    [l("2026-10-10", "MILHO", "v1"), l("2026-10-12", "MILHO", "v2"), l("2026-10-15", "MILHO", "v2"), l("2026-10-16", "MILHO", "v3", "g2"), l("2026-10-16", "CAFE", "c1")],
    "2026-10-14"
  );
  assert.deepEqual(r, [
    { data: "2026-10-16", ativo: "MILHO", campo: "versaoPrompt", de: "v2", para: "v3" },
    { data: "2026-10-16", ativo: "MILHO", campo: "modelo", de: "g1", para: "g2" }
  ]);
});
