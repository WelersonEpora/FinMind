"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { avaliarTravas } = require("./travas");
const { parametrosPadrao } = require("./parametros");

const P = parametrosPadrao("B3", ["MILHO"]);
const codigos = (r) => r.travas.map((t) => t.codigo);

test("sem perdas, nenhuma trava", () => {
  const r = avaliarTravas({ data: "2026-10-13", serie: [{ data: "2026-10-08", patrimonio: 10000 }, { data: "2026-10-09", patrimonio: 10050 }], parametros: P });
  assert.equal(r.bloqueiaNovasEntradas, false);
});

test("perda diária de 4% no último pregão bloqueia as entradas de D", () => {
  const serie = [{ data: "2026-10-12", patrimonio: 10000 }, { data: "2026-10-13", patrimonio: 9600 }];
  assert.ok(codigos(avaliarTravas({ data: "2026-10-14", serie, parametros: P })).includes("PERDA_DIARIA"));
  serie[1].patrimonio = 9601;
  assert.ok(!codigos(avaliarTravas({ data: "2026-10-14", serie, parametros: P })).includes("PERDA_DIARIA"));
});

test("perda semanal: vale no resto da semana, não na seguinte", () => {
  const serie = [
    { data: "2026-10-09", patrimonio: 10000 },
    { data: "2026-10-13", patrimonio: 9700 },
    { data: "2026-10-14", patrimonio: 9450 },
    { data: "2026-10-15", patrimonio: 9200 }
  ];
  assert.ok(codigos(avaliarTravas({ data: "2026-10-16", serie, parametros: P })).includes("PERDA_SEMANAL"));
  assert.ok(!codigos(avaliarTravas({ data: "2026-10-19", serie, parametros: P })).includes("PERDA_SEMANAL"));
});

test("drawdown de 10%: fica até a retomada manual, mesmo se o patrimônio voltar", () => {
  const serie = [
    { data: "2026-09-01", patrimonio: 10000 },
    { data: "2026-09-02", patrimonio: 11000 },
    { data: "2026-09-10", patrimonio: 9900 },
    { data: "2026-09-11", patrimonio: 10400 }
  ];
  assert.ok(codigos(avaliarTravas({ data: "2026-09-14", serie, parametros: P })).includes("DRAWDOWN"));
  const retomada = avaliarTravas({ data: "2026-09-14", serie, retomadas: ["2026-09-11"], parametros: P });
  assert.ok(!codigos(retomada).includes("DRAWDOWN"));
});

test("3 perdas seguidas: pausa de 5 pregões a partir do seguinte; um empate quebra a sequência", () => {
  const encerradas = [
    { dataSaida: "2026-10-01", resultadoR: -1 },
    { dataSaida: "2026-10-02", resultadoR: -1 },
    { dataSaida: "2026-10-05", resultadoR: -0.4 }
  ];
  const em = (data) => codigos(avaliarTravas({ data, encerradas, parametros: P })).includes("PERDAS_SEGUIDAS");
  assert.equal(em("2026-10-05"), false);
  assert.equal(em("2026-10-06"), true);
  assert.equal(em("2026-10-12"), true);
  assert.equal(em("2026-10-13"), false);
  assert.equal(codigos(avaliarTravas({ data: "2026-10-12", encerradas, feriados: ["2026-10-12"], parametros: P })).includes("PERDAS_SEGUIDAS"), true);

  const comEmpate = [encerradas[0], { dataSaida: "2026-10-02", resultadoR: 0 }, encerradas[2]];
  assert.equal(codigos(avaliarTravas({ data: "2026-10-06", encerradas: comEmpate, parametros: P })).includes("PERDAS_SEGUIDAS"), false);
});
