"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  SERIE_ESTOQUE,
  SERIES_CONTEXTO,
  PARAMETROS_PADRAO,
  decidirEstoques,
  exemplosEstoques,
  derivarEstoquesPetroleoEia,
  calcularEstoquesPetroleoEia
} = require("./estoques-petroleo-eia.factor");

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const estoque = (observedAt, value) => ({
  seriesCode: SERIE_ESTOQUE,
  observedAt,
  value,
  publishedAt: new Date(`${somarDias(observedAt, 5)}T23:59:59Z`),
  publishedAtIsEstimated: true
});

// A semana de 2026-09-25 e as "mesmas semanas" dos 5 anos anteriores (52, 104, ... 260 semanas antes).
const SEMANA = "2026-09-25";
const MESMAS_SEMANAS = [1, 2, 3, 4, 5].map((k) => somarDias(SEMANA, -364 * k));

test("variação semanal, média da mesma semana dos 5 anos anteriores e desvio", () => {
  const linhas = [
    ...MESMAS_SEMANAS.map((data, i) => estoque(data, 400000 + i * 1000)), // média = 402000
    estoque(somarDias(SEMANA, -7), 420000),
    estoque(SEMANA, 422010)
  ];
  const ponto = derivarEstoquesPetroleoEia(linhas, { observadoDesde: SEMANA }).at(-1);
  assert.equal(ponto.observedAt, SEMANA);
  assert.equal(ponto.estoque, 422010);
  assert.equal(ponto.variacaoSemanal, 2010);
  assert.equal(ponto.media5Anos, 402000);
  assert.equal(ponto.desvio, 20010);
  assert.equal(ponto.desvioPct, 4.98);
  assert.equal(ponto.disponivelEmEhEstimado, true);
});

test("sem uma das 5 mesmas semanas, a média e o desvio ficam nulos (nunca uma média de 4 anos)", () => {
  const linhas = [...MESMAS_SEMANAS.slice(1).map((data) => estoque(data, 400000)), estoque(SEMANA, 410000)];
  const ponto = derivarEstoquesPetroleoEia(linhas, { observadoDesde: SEMANA })[0];
  assert.equal(ponto.media5Anos, null);
  assert.equal(ponto.desvio, null);
  assert.equal(ponto.desvioPct, null);
  assert.equal(ponto.variacaoSemanal, null);
});

test("só devolve as semanas a partir de observadoDesde, em ordem", () => {
  const linhas = [estoque("2026-09-25", 3), estoque("2026-09-11", 1), estoque("2026-09-18", 2)];
  assert.deepEqual(derivarEstoquesPetroleoEia(linhas, { observadoDesde: "2026-09-18" }).map((p) => p.observedAt), ["2026-09-18", "2026-09-25"]);
});

test("contexto (v2): o desvio de Cushing, gasolina e destilados contra a mesma média, sem mudar a decisão", () => {
  const de = (serie, data, value) => ({ ...estoque(data, value), seriesCode: serie });
  const linhas = [
    ...MESMAS_SEMANAS.map((data) => estoque(data, 400000)),
    estoque(SEMANA, 400000),
    ...MESMAS_SEMANAS.map((data) => de(SERIES_CONTEXTO.desvioDestiladosPct, data, 100000)),
    de(SERIES_CONTEXTO.desvioDestiladosPct, SEMANA, 87000),
    de(SERIES_CONTEXTO.desvioGasolinaPct, SEMANA, 200000) // sem as 5 mesmas semanas: nulo
  ];
  const ponto = derivarEstoquesPetroleoEia(linhas, { observadoDesde: SEMANA }).at(-1);
  assert.equal(ponto.desvioDestiladosPct, -13);
  assert.equal(ponto.desvioGasolinaPct, null);
  assert.equal(ponto.desvioCushingPct, null);
  assert.equal(ponto.estoque, 400000);
  assert.equal(ponto.decisao.direcao, "NEUTRA");
});

test("busca o estoque e os de contexto (o preço não entra no fator), com folga de 5 anos, a tendência e 1 semana antes do 1º ponto", async () => {
  let pedido;
  const pointInTimeService = { obterAsOf: async (args) => { pedido = args; return []; } };
  const asOf = new Date("2026-10-02T12:00:00Z");
  await calcularEstoquesPetroleoEia({ asOf, observadoDesde: "2026-01-02" }, { pointInTimeService });
  assert.deepEqual(pedido.seriesCodes, [SERIE_ESTOQUE, ...Object.values(SERIES_CONTEXTO)]);
  assert.equal(pedido.asOf, asOf);
  assert.equal(pedido.observadoDesde, somarDias("2026-01-02", -7 * (260 + PARAMETROS_PADRAO.semanasTendencia + 1)));
});

test("C. direção pelo desvio: neutra dentro da faixa, alta abaixo da média (aperto), baixa acima (sobra)", () => {
  assert.equal(decidirEstoques(2.99, null).direcao, "NEUTRA");
  assert.equal(decidirEstoques(-2.99, null).direcao, "NEUTRA");
  assert.equal(decidirEstoques(-3, null).direcao, "ALTA");
  assert.equal(decidirEstoques(3, null).direcao, "BAIXA");
  assert.equal(decidirEstoques(null, null), null);
});

test("C. intensidade pelos limiares: fraca, moderada e forte", () => {
  assert.equal(decidirEstoques(1, null).intensidade, "FRACA");
  assert.equal(decidirEstoques(-9.99, null).intensidade, "MODERADA");
  assert.equal(decidirEstoques(-10, null).intensidade, "FORTE");
});

test("C. tendência pela mudança do desvio: estável abaixo do limiar, caindo (apertando) ou subindo (afrouxando)", () => {
  assert.deepEqual(decidirEstoques(5, 4), { direcao: "BAIXA", intensidade: "MODERADA", tendencia: "ESTAVEL", mudancaPp: 1 });
  assert.equal(decidirEstoques(5, 8).tendencia, "CAINDO");
  assert.equal(decidirEstoques(5, 2).tendencia, "SUBINDO");
  assert.equal(decidirEstoques(5, null).tendencia, null);
});

test("C. os parâmetros mudam a decisão (o Comitê ajusta sem mexer na fórmula)", () => {
  const parametros = { ...PARAMETROS_PADRAO, limiarModeradoPct: 6, limiarFortePct: 15 };
  assert.equal(decidirEstoques(-5, null, parametros).direcao, "NEUTRA");
  assert.equal(decidirEstoques(-12, null, parametros).intensidade, "MODERADA");
});

test("a tendência usa o desvio de semanasTendencia semanas antes, mesmo antes de observadoDesde", () => {
  const base = (data) => [1, 2, 3, 4, 5].map((k) => estoque(somarDias(data, -364 * k), 100));
  const anterior = somarDias(SEMANA, -28);
  const linhas = [...base(anterior), estoque(anterior, 110), ...base(SEMANA), estoque(SEMANA, 104)];
  const ponto = derivarEstoquesPetroleoEia(linhas, { observadoDesde: SEMANA }).at(-1);
  assert.equal(ponto.desvioPct, 4);
  assert.equal(ponto.decisao.mudancaPp, -6);
  assert.equal(ponto.decisao.tendencia, "CAINDO");
});

test("exemplos: episódios reais pela semana (nulos sem dado) e cenários pela mesma regra, com os parâmetros em uso", () => {
  const pontos = [{ observedAt: "2022-06-24", desvioPct: -12.5, decisao: { direcao: "ALTA" } }];
  const { episodios, cenarios } = exemplosEstoques(pontos);
  assert.equal(episodios.find((e) => e.data === "2022-06-24").decisao.direcao, "ALTA");
  assert.equal(episodios.find((e) => e.data === "2020-06-26").decisao, null);
  assert.ok(cenarios.every((c) => c.decisao && c.rotulo));
  const comOutros = exemplosEstoques([], { ...PARAMETROS_PADRAO, limiarModeradoPct: 7 }).cenarios.find((c) => c.valor === -5);
  assert.equal(comOutros.decisao.direcao, "NEUTRA");
});
