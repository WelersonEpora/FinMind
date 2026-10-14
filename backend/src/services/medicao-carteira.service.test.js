"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { obterMedicao } = require("./medicao-carteira.service");

const CARTEIRA = { id: "c1", workspace_id: "w1", conta: "B3", moeda: "BRL", capital_inicial: "10000.00", data_inicio: "2026-10-14" };
const TRILHAS = [{ id: "t-ia", tipo: "IA" }, { id: "t-det", tipo: "DETERMINISTICA" }, { id: "t-op", tipo: "OPERADOR" }];

function deps({ dias = [], rodadas = [], recomendacoes = [], ptax = 5.4, hoje = "2026-10-20" } = {}) {
  return {
    hoje,
    agora: new Date(`${hoje}T12:00:00Z`),
    carteiraRepository: { forWorkspace: () => ({ buscar: async () => CARTEIRA, listarTrilhas: async () => TRILHAS }) },
    carteiraRodadaRepository: {
      forWorkspace: () => ({
        seriesPatrimonio: async () => dias,
        rodadasParaMedicao: async () => rodadas,
        listarRecomendacoes: async () => recomendacoes
      })
    },
    marketQuoteRepository: { buscarSerie: async () => (ptax ? [{ reference_date: "2026-10-19", value: String(ptax) }] : []) }
  };
}

test("sem dia liquidado: o segmento começa no início da carteira, com as datas e nada medido", async () => {
  const { medicao } = await obterMedicao("w1", "c1", deps());
  assert.deepEqual([medicao.segmento.inicio, medicao.datas.avaliacao, medicao.parcial.dias, medicao.avaliacao], ["2026-10-14", "2027-04-14", 0, null]);
  assert.equal(medicao.custo.pontoDeEquilibrio, null);
});

test("a diferença acumulada, o custo da IA em reais e o ponto de equilíbrio; o modelo novo abre outro segmento", async () => {
  const dias = [
    { trilhaId: "t-ia", data: "2026-10-14", patrimonio: 10050 },
    { trilhaId: "t-det", data: "2026-10-14", patrimonio: 10000 },
    { trilhaId: "t-ia", data: "2026-10-15", patrimonio: 10100 },
    { trilhaId: "t-det", data: "2026-10-15", patrimonio: 10010 },
    { trilhaId: "t-ia", data: "2026-10-16", patrimonio: 10120 },
    { trilhaId: "t-det", data: "2026-10-16", patrimonio: 10010 },
    { trilhaId: "t-op", data: "2026-10-16", patrimonio: 99999 }
  ];
  const rodadas = ["2026-10-14", "2026-10-15", "2026-10-16"].map((data) => ({ data, parametros_versao: 1 }));
  const rec = (data, modelo, extra = {}) => ({ data, tipo: "PRINCIPAL", situacao: "VALIDA", modelo_pedido: modelo, versao_prompt: "v1", tokens: { total: 5000 }, custo_usd: "0.01", ...extra });
  const recomendacoes = [
    rec("2026-10-14", "m1"),
    rec("2026-10-14", "m1", { tipo: "REPLICA" }),
    rec("2026-10-15", "m2"),
    rec("2026-10-16", "m2", { situacao: "FALHA", tokens: null, custo_usd: null })
  ];
  const { medicao } = await obterMedicao("w1", "c1", deps({ dias, rodadas, recomendacoes }));
  assert.equal(medicao.segmento.inicio, "2026-10-15");
  assert.deepEqual(medicao.mudouEm, ["modelo"]);
  assert.equal(medicao.segmentosAnteriores.length, 1);
  // 15/10: IA +0,5%, Det +0,1% -> 0,4; 16/10: IA +0,2%, Det 0 -> 0,2.
  assert.ok(Math.abs(medicao.parcial.acumulada - 0.6) < 1e-9);
  assert.equal(medicao.parcial.intervalo, null);
  assert.deepEqual([medicao.custo.chamadas, medicao.custo.dias, medicao.custo.fallback], [1, 2, 1]);
  assert.ok(Math.abs(medicao.custo.custoMoeda - 0.054) < 1e-9);
  // O custo de R$ 0,054 é pago por uma vantagem de 0,6% a partir de R$ 9,00 de capital.
  assert.ok(Math.abs(medicao.custo.pontoDeEquilibrio - 9) < 1e-9);
});

test("custo: a chamada gravada sem custo é calculada pelos tokens com os preços de agora; sem preço, o custo fica incompleto", async () => {
  const tokens = { entrada: 4000, saida: 500, raciocinio: 500, total: 5000 };
  const recomendacoes = [{ data: "2026-10-14", tipo: "PRINCIPAL", situacao: "VALIDA", modelo_pedido: "m1", versao_prompt: "v1", tokens, custo_usd: null }];
  const comPreco = await obterMedicao("w1", "c1", { ...deps({ recomendacoes }), recomendacaoCarteira: { precoEntrada: 0.5, precoSaida: 3 } });
  // 4000 × 0,5 + 1000 × 3 = 5000 por milhão -> US$ 0,005.
  assert.deepEqual([comPreco.medicao.custo.custoUsd, comPreco.medicao.custo.completo], [0.005, true]);
  const semPreco = await obterMedicao("w1", "c1", { ...deps({ recomendacoes }), recomendacaoCarteira: { precoEntrada: null, precoSaida: null } });
  assert.deepEqual([semPreco.medicao.custo.semPreco, semPreco.medicao.custo.completo, semPreco.medicao.custo.custoMoeda], [1, false, null]);
});
