"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, derivarOfertaNaoOpep, calcularOfertaNaoOpep, explicarOferta } = require("./oferta-nao-opep-petroleo.factor");

const linha = (seriesCode, observedAt, value) => ({ seriesCode, observedAt, value, publishedAt: new Date(`${observedAt}T12:00:00Z`), publishedAtIsEstimated: false });

// Um mês com o Brasil em m³ (uma UF, no mar) que dá `brasil` mil barris/dia, e Noruega e Canadá em mil barris/dia.
function mes(observedAt, brasil, noruega, canada) {
  const [ano, m] = observedAt.split("-").map(Number);
  const dias = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return [
    linha("ANP.PETROLEO_PRODUCAO.RJ.MAR", observedAt, (brasil * 1000 * dias) / 6.28981),
    linha(SERIES.noruega, observedAt, noruega),
    linha(SERIES.canada, observedAt, canada)
  ];
}

// `meses` meses seguidos a partir de jan/2024, o total de cada um vindo de `total(i)` (Brasil 40%, Noruega 20%,
// Canadá 40%).
function historico(meses, total) {
  return Array.from({ length: meses }, (_, i) => {
    const t = total(i);
    return mes(new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10), t * 0.4, t * 0.2, t * 0.4);
  }).flat();
}

test("A: o Brasil vem da ANP em m³ e vira mil barris/dia; o mês só entra com os três países", () => {
  const linhas = [
    linha("ANP.PETROLEO_PRODUCAO.RJ.MAR", "2026-06-01", 3000000),
    linha("ANP.PETROLEO_PRODUCAO.SP.MAR", "2026-06-01", 1500000),
    linha(SERIES.noruega, "2026-06-01", 1800),
    linha(SERIES.canada, "2026-06-01", 4200),
    linha(SERIES.noruega, "2026-07-01", 1790)
  ];
  const pontos = derivarOfertaNaoOpep(linhas);
  assert.equal(pontos.length, 1);
  assert.equal(pontos[0].brasil, Math.round((4500000 * 6.28981) / 30 / 1000));
  assert.equal(pontos[0].total, pontos[0].brasil + 1800 + 4200);
  assert.equal(pontos[0].crescimentoAnualPct, null);
  assert.equal(pontos[0].decisao, null);
});

test("B: o crescimento anual é da média de 3 meses contra os mesmos 3 meses do ano anterior", () => {
  const ultimo = derivarOfertaNaoOpep(historico(15, (i) => (i < 12 ? 10000 : 10500))).at(-1);
  assert.equal(ultimo.media3Meses, 10500);
  assert.equal(ultimo.media3MesesAnoAnterior, 10000);
  assert.equal(ultimo.crescimentoAnualPct, 5);
});

test("C: oferta crescendo além da faixa é pressão de BAIXA; encolhendo, de alta; a tendência é em meses", () => {
  const crescendo = derivarOfertaNaoOpep(historico(18, (i) => (i < 12 ? 10000 : 10800))).at(-1);
  assert.equal(crescendo.decisao.direcao, "BAIXA");
  assert.equal(crescendo.decisao.intensidade, "FORTE");
  const passos = explicarOferta(crescendo);
  assert.match(passos[1], /oferta não-OPEP crescendo forte .* → Pressão de baixa\./);
  assert.match(passos[3], /^Tendência: há 3 meses /);
  const encolhendo = derivarOfertaNaoOpep(historico(15, (i) => (i < 12 ? 10000 : 9600))).at(-1);
  assert.equal(encolhendo.decisao.direcao, "ALTA");
  assert.equal(encolhendo.decisao.intensidade, "MODERADA");
});

test("busca as UFs da ANP e Noruega e Canadá do JODI, sem os EUA", async () => {
  let pedido;
  const pointInTimeService = { obterAsOf: async (args) => { pedido = args; return []; } };
  await calcularOfertaNaoOpep({ asOf: new Date("2026-10-03T12:00:00Z") }, { pointInTimeService });
  assert.equal(pedido.seriesCodes.length, SERIES.brasil.length + 2);
  assert.ok(pedido.seriesCodes.includes(SERIES.canada));
  assert.ok(!pedido.seriesCodes.some((codigo) => codigo.startsWith("EIA.") || codigo.includes(".US.")));
});
