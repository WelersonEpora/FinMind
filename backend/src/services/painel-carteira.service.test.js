"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const painel = require("./painel-carteira.service");

const CARTEIRA = { id: "c1", workspace_id: "w1", nome: "Conta B3", conta: "B3", capital_inicial: "10000.00", data_inicio: "2026-10-06" };
const TRILHAS = [
  { id: "t-ia", tipo: "IA", calculada: false },
  { id: "t-det", tipo: "DETERMINISTICA", calculada: false },
  { id: "t-caixa", tipo: "CAIXA", calculada: true }
];

function deps({ carteira = CARTEIRA } = {}) {
  const espacos = [];
  const carteiraRepository = {
    forWorkspace: (w) => {
      espacos.push(w);
      return { buscar: async (id) => (carteira && id === carteira.id ? carteira : null), listarTrilhas: async () => TRILHAS };
    }
  };
  const carteiraRodadaRepository = {
    forWorkspace: (w) => {
      espacos.push(w);
      return {
        seriesPatrimonio: async () => [
          { trilhaId: "t-det", data: "2026-10-06", patrimonio: 10200 },
          { trilhaId: "t-det", data: "2026-10-07", patrimonio: 9690 },
          { trilhaId: "t-det", data: "2026-10-08", patrimonio: 9900 },
          { trilhaId: "t-caixa", data: "2026-10-06", patrimonio: 10005 }
        ],
        listarPosicoes: async () => [
          { id: "p1", trilhaId: "t-det", ativo: "MILHO", lado: "COMPRADO", contrato: { ticker: "CCMH27" }, situacao: "ABERTA" },
          { id: "p2", trilhaId: "t-det", ativo: "CAFE", lado: "VENDIDO", contrato: { ticker: "ICFZ26" }, situacao: "ENCERRADA", resultadoR: -1 }
        ],
        ultimaRodada: async () => ({ data: "2026-10-09", decisao: "DECIDIDA", liquidacao: "PENDENTE" }),
        listarRodadas: async () => [
          {
            id: "r1",
            data: "2026-10-09",
            decisao: "DECIDIDA",
            liquidacao: "PENDENTE",
            parametros_versao: 1,
            detalhes: null,
            intencoes: [{ trilha_id: "t-det", ativo: "MILHO", acao: "MANTER", prioridade: 1, origem: "REGRA", resultado: "SEM_ORDEM" }],
            ordens: [{ id: "o1", trilhaId: "t-det", dataExecucao: "2026-10-09", ativo: "MILHO", tipo: "SAIDA", motivo: "VENCIMENTO", lado: "COMPRADO", contrato: { ticker: "CCMH27" }, quantidade: 0.1, situacao: "CRIADA" }]
          }
        ],
        listarOrdens: async (ids) => (ids.includes("t-det") ? [{ id: "o1", trilhaId: "t-det", dataExecucao: "2026-10-09", ativo: "MILHO", tipo: "ENTRADA", contrato: { ticker: "CCMH27" }, situacao: "EXECUTADA", precoExecucao: 74.02 }] : [])
      };
    }
  };
  return { espacos, deps: { carteiraRepository, carteiraRodadaRepository } };
}

test("opções: só a conta B3 disponível, os padrões por conta e o início no próximo dia útil", () => {
  const { opcoes } = painel.obterOpcoes({ hoje: "2026-10-16" });
  assert.deepEqual(opcoes.contas.map((c) => [c.codigo, c.disponivel]), [["B3", true], ["INTERNACIONAL", true]]);
  assert.deepEqual(Object.keys(opcoes.padroes.B3.ativos), ["MILHO", "CAFE", "SOJA"]);
  assert.deepEqual(opcoes.ativos.filter((a) => a.carteiraPropria).map((a) => a.codigo), ["DOLAR"]);
  assert.equal(opcoes.inicioMinimo, "2026-10-19");
});

test("painel: por trilha, o último patrimônio, o retorno e o maior recuo; sem histórico, o capital inicial", async () => {
  const { espacos, deps: d } = deps();
  const { painel: p } = await painel.obterPainel("w1", "c1", d);
  const det = p.trilhas.find((t) => t.tipo === "DETERMINISTICA");
  assert.deepEqual([det.patrimonio, det.retornoPct, det.maiorRecuoPct, det.abertas, det.encerradas], [9900, -1, -5, 1, 1]);
  assert.equal(det.serie.length, 3);
  const ia = p.trilhas.find((t) => t.tipo === "IA");
  assert.deepEqual([ia.patrimonio, ia.retornoPct, ia.serie], [10000, 0, []]);
  assert.equal(p.ultimoDiaLiquidado, "2026-10-08");
  assert.equal(p.ultimaRodada.liquidacao, "PENDENTE");
  assert.ok(espacos.every((w) => w === "w1"));
});

test("rodadas, posições e operações: com o tipo da trilha no lugar do id", async () => {
  const { deps: d } = deps();
  const { rodadas } = await painel.listarRodadas("w1", "c1", d);
  assert.equal(rodadas[0].intencoes[0].trilha, "DETERMINISTICA");
  assert.deepEqual([rodadas[0].ordens[0].trilha, rodadas[0].ordens[0].contrato], ["DETERMINISTICA", "CCMH27"]);
  const { posicoes } = await painel.listarPosicoes("w1", "c1", d);
  assert.deepEqual(posicoes.map((p) => [p.trilha, p.contrato]), [["DETERMINISTICA", "CCMH27"], ["DETERMINISTICA", "ICFZ26"]]);
  const { operacoes } = await painel.listarOperacoes("w1", "c1", d);
  assert.deepEqual([operacoes[0].trilha, operacoes[0].precoExecucao], ["DETERMINISTICA", 74.02]);
});

test("carteira de outro espaço (ou inexistente): 404", async () => {
  const { deps: d } = deps({ carteira: null });
  await assert.rejects(() => painel.obterPainel("w2", "c1", d), (e) => e.statusCode === 404);
  await assert.rejects(() => painel.listarPosicoes("w2", "c1", d), (e) => e.statusCode === 404);
});

test("recomendações: a lista sem os textos; o detalhe com o prompt e as respostas; de outra carteira, 404", async () => {
  const linha = { id: "rec1", data: "2026-10-14", tipo: "PRINCIPAL", situacao: "VALIDA", custo_usd: "0.001300", recomendacoes: [{ ativo: "MILHO" }], contrarias: null };
  const { deps: d } = deps();
  const rRepo = d.carteiraRodadaRepository.forWorkspace;
  d.carteiraRodadaRepository = {
    forWorkspace: (w) => ({
      ...rRepo(w),
      listarRecomendacoes: async () => [linha],
      buscarRecomendacao: async (_c, id) => (id === "rec1" ? { ...linha, prompt: "o prompt", instrucao: "a instrução", respostas: [{ texto: "{}" }], entrada: {} } : null)
    })
  };
  const { recomendacoes } = await painel.listarRecomendacoes("w1", "c1", d);
  assert.deepEqual([recomendacoes[0].custoUsd, recomendacoes[0].contrarias, recomendacoes[0].prompt], [0.0013, {}, undefined]);
  const { recomendacao } = await painel.obterRecomendacao("w1", "c1", "rec1", d);
  assert.deepEqual([recomendacao.prompt, recomendacao.respostas.length], ["o prompt", 1]);
  await assert.rejects(() => painel.obterRecomendacao("w1", "c1", "outra", d), (e) => e.statusCode === 404);
});
