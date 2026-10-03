"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIE_PRODUCAO, PARAMETROS_PADRAO, derivarProducaoPetroleoEua, calcularProducaoPetroleoEua, explicarProducao } = require("./producao-petroleo-eua.factor");

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const linha = (observedAt, value) => ({ seriesCode: SERIE_PRODUCAO, observedAt, value, publishedAt: new Date(), publishedAtIsEstimated: true });

// 70 semanas: as 52 primeiras em 10.000, as seguintes em 10.500 (+5%), a última em 10.600 (recorde).
function historico() {
  const linhas = [];
  for (let i = 0; i < 70; i += 1) {
    const valor = i < 52 ? 10000 : i === 69 ? 10600 : 10500;
    linhas.push(linha(somarDias("2025-01-03", 7 * i), valor));
  }
  return linhas;
}

test("A: média de 4 semanas, recorde até a semana e distância dele", () => {
  const pontos = derivarProducaoPetroleoEua(historico());
  const ultimo = pontos.at(-1);
  assert.equal(ultimo.producao, 10600);
  assert.equal(ultimo.media4Semanas, 10525);
  assert.equal(ultimo.recorde, 10600);
  assert.equal(ultimo.distanciaRecordePct, 0);
  assert.equal(pontos[2].media4Semanas, null);
  const antes = pontos.at(-2);
  assert.equal(antes.recorde, 10500);
});

test("B e C: crescimento contra as mesmas 4 semanas do ano anterior; produção crescendo é pressão de baixa", () => {
  const ultimo = derivarProducaoPetroleoEua(historico()).at(-1);
  assert.equal(ultimo.mediaAnoAnterior, 10000);
  assert.equal(ultimo.crescimentoAnualPct, 5.25);
  assert.equal(ultimo.decisao.direcao, "BAIXA");
  assert.equal(ultimo.decisao.intensidade, "MODERADA");
});

test("sem as 4 semanas do ano anterior, o crescimento e a decisão ficam nulos", () => {
  const pontos = derivarProducaoPetroleoEua(historico().slice(0, 40));
  assert.ok(pontos.every((p) => p.crescimentoAnualPct === null && p.decisao === null));
});

test("a explicação diz se a produção está em recorde ou a quantos % dele", () => {
  const pontos = derivarProducaoPetroleoEua(historico());
  assert.match(explicarProducao(pontos.at(-1))[0], /\+5,25% contra o mesmo período do ano anterior \(B\)\. Está em recorde\./);
  assert.match(explicarProducao(pontos.at(-2))[0], /Está em recorde\./);
  const linhas = [...historico(), linha(somarDias("2025-01-03", 7 * 70), 10388)];
  assert.match(explicarProducao(derivarProducaoPetroleoEua(linhas).at(-1))[0], /Está 2,00% abaixo do recorde\./);
});

test("busca só a produção, o histórico inteiro (o recorde precisa dele), com a janela de tendência padrão de 13 semanas", async () => {
  let pedido;
  const pointInTimeService = { obterAsOf: async (args) => { pedido = args; return []; } };
  await calcularProducaoPetroleoEua({ asOf: new Date("2026-10-03T12:00:00Z") }, { pointInTimeService });
  assert.deepEqual(pedido.seriesCodes, [SERIE_PRODUCAO]);
  assert.equal(pedido.observadoDesde, undefined);
  assert.equal(PARAMETROS_PADRAO.semanasTendencia, 13);
});
