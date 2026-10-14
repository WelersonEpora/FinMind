"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { obterMedicao } = require("./medicao-carteira.service");

const CARTEIRA = { id: "c1", workspace_id: "w1", conta: "B3", moeda: "BRL", capital_inicial: "10000.00", data_inicio: "2026-10-14" };
const VERSOES = [{ versao: 1, tipo: "INICIAL", vigente_desde: "2026-10-14", parametros: { ativos: { MILHO: {}, CAFE: {} }, carteira: { drawdownMaxPct: 10 } } }];
const TRILHAS = [{ id: "t-ia", tipo: "IA" }, { id: "t-det", tipo: "DETERMINISTICA" }, { id: "t-op", tipo: "OPERADOR" }, { id: "t-per", tipo: "PERSISTENCIA" }];

function deps({ dias = [], rodadas = [], recomendacoes = [], hoje = "2026-10-20", posicoes = [], lancamentos = [], intencoes = [], leituras = [], trilhas = TRILHAS } = {}) {
  return {
    hoje,
    agora: new Date(`${hoje}T12:00:00Z`),
    carteiraRepository: { forWorkspace: () => ({ buscar: async () => CARTEIRA, listarTrilhas: async () => trilhas, listarVersoes: async () => VERSOES }) },
    carteiraRodadaRepository: {
      forWorkspace: () => ({
        seriesPatrimonio: async () => dias,
        rodadasParaMedicao: async () => rodadas,
        listarRecomendacoes: async () => recomendacoes,
        listarPosicoes: async () => posicoes,
        lancamentosParaMedicao: async () => lancamentos,
        intencoesParaMedicao: async () => intencoes,
        ordensDaTrilha: async () => [],
        leiturasParaMedicao: async () => leituras
      })
    }
  };
}

test("sem dia liquidado: o segmento começa no início da carteira, com as datas e nada medido", async () => {
  const { medicao } = await obterMedicao("w1", "c1", deps());
  assert.deepEqual([medicao.segmento.inicio, medicao.datas.avaliacao, medicao.parcial.dias, medicao.avaliacao], ["2026-10-14", "2027-04-14", 0, null]);
  assert.equal(medicao.custo, undefined);
});

test("a principal é IA − Persistência, e as partes (recomendação e leituras) a somam; o modelo novo abre outro segmento, o prompt das leituras só fica registrado", async () => {
  const dias = [
    { trilhaId: "t-ia", data: "2026-10-14", patrimonio: 10050 },
    { trilhaId: "t-det", data: "2026-10-14", patrimonio: 10000 },
    { trilhaId: "t-ia", data: "2026-10-15", patrimonio: 10100 },
    { trilhaId: "t-det", data: "2026-10-15", patrimonio: 10010 },
    { trilhaId: "t-ia", data: "2026-10-16", patrimonio: 10120 },
    { trilhaId: "t-det", data: "2026-10-16", patrimonio: 10010 },
    { trilhaId: "t-op", data: "2026-10-16", patrimonio: 99999 },
    { trilhaId: "t-per", data: "2026-10-14", patrimonio: 9990 },
    { trilhaId: "t-per", data: "2026-10-15", patrimonio: 9990 },
    { trilhaId: "t-per", data: "2026-10-16", patrimonio: 10000 }
  ];
  const leituras = [
    { data: "2026-10-14", ativo: "MILHO", versaoPrompt: "milho-v1", modelo: "g" },
    { data: "2026-10-15", ativo: "MILHO", versaoPrompt: "milho-v1", modelo: "g" },
    { data: "2026-10-16", ativo: "MILHO", versaoPrompt: "milho-v2", modelo: "g" }
  ];
  const rodadas = ["2026-10-14", "2026-10-15", "2026-10-16"].map((data) => ({ data, parametros_versao: 1 }));
  const rec = (data, modelo, extra = {}) => ({ data, tipo: "PRINCIPAL", situacao: "VALIDA", modelo_pedido: modelo, versao_prompt: "v1", tokens: { total: 5000 }, custo_usd: "0.01", ...extra });
  const recomendacoes = [
    rec("2026-10-14", "m1"),
    rec("2026-10-14", "m1", { tipo: "REPLICA" }),
    rec("2026-10-15", "m2"),
    rec("2026-10-16", "m2", { situacao: "FALHA", tokens: null, custo_usd: null })
  ];
  const { medicao } = await obterMedicao("w1", "c1", deps({ dias, rodadas, recomendacoes, leituras }));
  assert.equal(medicao.segmento.inicio, "2026-10-15");
  assert.deepEqual(medicao.mudouEm, ["modelo"]);
  assert.equal(medicao.segmentosAnteriores.length, 1);
  // 15/10: IA +0,5%, Det +0,1%, Per 0; 16/10: IA +0,2%, Det 0, Per +0,1%.
  const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  perto(medicao.parcial.acumulada, 0.6);
  perto(medicao.partes.recomendacao.parcial.acumulada, 0.6);
  perto(medicao.partes.leituras.parcial.acumulada, 0);
  assert.equal(medicao.parcial.intervalo, null);
  assert.deepEqual(medicao.mudancasDasLeituras, [{ data: "2026-10-16", ativo: "MILHO", campo: "versaoPrompt", de: "milho-v1", para: "milho-v2" }]);
  assert.deepEqual(medicao.secundarias.atribuicao.fallback, { dias: 2, falhas: 1 });
});

test("secundárias: o painel das trilhas com o Sharpe sobre o caixa e a atribuição por ativo", async () => {
  const trilhas = [...TRILHAS, { id: "t-cx", tipo: "CAIXA" }];
  const dias = [
    { trilhaId: "t-ia", data: "2026-10-14", patrimonio: 10100 },
    { trilhaId: "t-det", data: "2026-10-14", patrimonio: 10000 },
    { trilhaId: "t-cx", data: "2026-10-14", patrimonio: 10005 },
    { trilhaId: "t-per", data: "2026-10-14", patrimonio: 10030 }
  ];
  const lancamentos = [
    { trilhaId: "t-ia", data: "2026-10-14", tipo: "AJUSTE_DIARIO", ativo: "MILHO", valor: 110 },
    { trilhaId: "t-ia", data: "2026-10-14", tipo: "CUSTO", ativo: "MILHO", valor: -10 }
  ];
  const intencoes = [{ data: "2026-10-14", trilhaId: "t-det", ativo: "CAFE", acao: "ENTRAR_COMPRADO", resultado: "BLOQUEADA", motivoBloqueio: "SEM_ATR", referencia: null }];
  const { medicao } = await obterMedicao("w1", "c1", deps({ dias, lancamentos, intencoes, trilhas }));
  const s = medicao.secundarias;
  assert.deepEqual(s.painel.map((t) => t.tipo), ["IA", "DETERMINISTICA", "OPERADOR", "PERSISTENCIA", "CAIXA"]);
  assert.ok(Math.abs(s.painel[0].retornoPct - 1) < 1e-9);
  assert.equal(s.painel[0].custos, 10);
  assert.equal(s.painel[0].limiteDrawdownPct, 10);
  assert.deepEqual(s.atribuicao.porAtivo.map((a) => [a.ativo, a.diferenca]), [["MILHO", 1], ["CAFE", 0], [null, 0]]);
  assert.deepEqual(s.atribuicao.cortes, [{ tipo: "DETERMINISTICA", total: 1, motivos: { SEM_ATR: 1 } }]);
  assert.ok(Math.abs(medicao.parcial.acumulada - 0.7) < 1e-9);
  assert.deepEqual(s.cartilha.map((t) => t.tipo), ["IA", "DETERMINISTICA", "OPERADOR", "PERSISTENCIA"]);
});
