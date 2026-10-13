"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processarCarteira, executarRotina } = require("./rodada-carteira.service");
const { parametrosPadrao } = require("../carteiras/parametros");

const CARTEIRA = { id: "c1", workspace_id: "w1", nome: "Conta B3", conta: "B3", capital_inicial: "10000.00", data_inicio: "2026-10-06" };
const TRILHAS = ["OPERADOR", "IA", "DETERMINISTICA", "CAIXA", "COMPRAR_E_SEGURAR", "PERSISTENCIA"].map((tipo) => ({ id: `t-${tipo}`, tipo }));
const VERSOES = [{ versao: 1, tipo: "INICIAL", vigente_desde: "2026-10-06", parametros: parametrosPadrao("B3", ["MILHO"]) }];
const LEITURAS_ALTA = [
  { horizonte: "CURTO", tendencia: "LATERAL", confianca: "MEDIA" },
  { horizonte: "MEDIO", tendencia: "ALTA", faixa: "ALTA_LEVE", confianca: "MEDIA" }
];
const MERCADO_MILHO = { contrato: { ticker: "CCMH27", limite: "2027-03-15" }, atr: 1.1, ajuste: 74, valorDoPonto: 450, variacao30dPct: 3 };

// Um banco em memória com as funções da rotina, escopado como o real.
// A recomendação da IA, falsa: MILHO, entrar vendido sem posição (contra a leitura de alta, de propósito).
const RECOMENDACAO = {
  ativo: "MILHO",
  prioridade: 1,
  semPosicao: { acao: "ENTRAR_VENDIDO", porque: "x" },
  comprado: { acao: "MANTER", porque: "x" },
  vendido: { acao: "MANTER", porque: "x" },
  evidencias: ["MILHO.MEDIO"],
  invalidaSe: "x"
};

function ambiente({ pendente = null, erroNaDecisao = false, recomendacaoFalha = false } = {}) {
  const db = { rodadas: [], intencoes: [], ordens: [], liquidacoes: [], patrimonio: [], recomendacoes: [], chamadasIa: [] };
  const rodadaRepository = {
    forWorkspace: () => ({
      buscarRodada: async (_c, data) => db.rodadas.find((r) => r.data === data) || null,
      ultimaRodada: async () => [...db.rodadas].sort((a, b) => b.data.localeCompare(a.data))[0] || null,
      listarPendentes: async () => db.rodadas.filter((r) => r.liquidacao === "PENDENTE").sort((a, b) => a.data.localeCompare(b.data)),
      criarRodada: async ({ data, decisao, detalhes, leituras = [], recomendacoes = [], intencoes = [], ordens = [] }) => {
        const rodada = { id: `r-${data}`, data, decisao, detalhes, liquidacao: "PENDENTE", leituras };
        db.recomendacoes.push(...recomendacoes.map((r) => ({ ...r, data })));
        db.rodadas.push(rodada);
        db.intencoes.push(...intencoes.map((i) => ({ ...i, data })));
        db.ordens.push(...ordens.map((o, k) => ({ ...o, id: `o-${data}-${k}`, rodadaId: rodada.id })));
        return rodada;
      },
      seriePatrimonio: async (trilhaId, { ate }) => db.patrimonio.filter((p) => p.trilhaId === trilhaId && p.data < ate),
      posicoesAbertas: async () => [],
      encerradas: async () => [],
      existeReplicaEntre: async (_c, inicio, fim) => db.recomendacoes.some((r) => r.tipo === "REPLICA" && r.data >= inicio && r.data <= fim),
      ordensCriadas: async (rodadaId) => db.ordens.filter((o) => o.rodadaId === rodadaId),
      gravarLiquidacao: async ({ rodadaId, data, trilhas }) => {
        db.liquidacoes.push(data);
        for (const t of trilhas) db.patrimonio.push({ trilhaId: t.trilhaId, data, patrimonio: t.resultado.estado.patrimonio });
        db.rodadas.find((r) => r.id === rodadaId).liquidacao = "LIQUIDADA";
      }
    })
  };
  const carteiraRepository = {
    listarAtivasParaRotina: async () => [{ workspace_id: "w1", id: "c1" }],
    forWorkspace: () => ({ buscar: async () => CARTEIRA, listarVersoes: async () => VERSOES, listarTrilhas: async () => TRILHAS })
  };
  const mercadoCarteiraService = {
    lerMercadoParaDecisao: async () => {
      if (erroNaDecisao) throw new Error("fonte fora do ar");
      return { mercado: { MILHO: MERCADO_MILHO }, semMercado: {}, t1PorAtivo: { MILHO: 2 } };
    },
    lerMercadoParaLiquidacao: async ({ data }) =>
      pendente && data >= pendente ? { pendente: "SEM_PTAX_DO_DIA" } : { barras: { CCMH27: { ajuste: 74.5, maxima: 75, minima: 73.8 } }, cambio: 5.38, taxaCaixaDia: 0.0005, diaUtil: true }
  };
  const analiseDiariaRepository = { buscarAnaliseDoDia: async (_a, data) => ({ id: `a-${data}`, data_analise: data, hash_entrada: "h", versao_prompt: "v", modelo: "m", leituras: LEITURAS_ALTA, entrada: {} }) };
  const recomendacaoCarteiraService = {
    recomendar: async ({ data }) => {
      db.chamadasIa.push(data);
      return recomendacaoFalha
        ? { tipo: "PRINCIPAL", situacao: "FALHA", motivo_falha: "GEMINI_FORA", recomendacoes: null }
        : { tipo: "PRINCIPAL", situacao: "VALIDA", motivo_falha: null, recomendacoes: [RECOMENDACAO], contrarias: { MILHO: ["semPosicao"] } };
    },
    replicar: async (principal) => ({ ...principal, tipo: "REPLICA" })
  };
  return { db, deps: { rodadaRepository, carteiraRepository, mercadoCarteiraService, analiseDiariaRepository, recomendacaoCarteiraService } };
}

const rodar = (hoje, deps) => processarCarteira({ workspace_id: "w1", id: "c1" }, { hoje, agora: new Date() }, deps);

test("1º dia: decide, congela as leituras e gera as ordens das trilhas automáticas; de novo no mesmo dia, nada", async () => {
  const { db, deps } = ambiente();
  const r = await rodar("2026-10-06", deps);
  assert.equal(r.decidida, "2026-10-06");
  assert.equal(db.rodadas[0].leituras[0].situacao, "OK");
  const det = db.intencoes.find((i) => i.trilha_id === "t-DETERMINISTICA");
  assert.deepEqual([det.acao, det.resultado], ["ENTRAR_COMPRADO", "ORDEM"]);
  assert.deepEqual(db.ordens.map((o) => o.trilhaId).sort(), ["t-COMPRAR_E_SEGURAR", "t-DETERMINISTICA", "t-IA", "t-PERSISTENCIA"]);
  assert.ok(!db.intencoes.some((i) => ["t-OPERADOR", "t-CAIXA"].includes(i.trilha_id)));
  // A trilha IA segue o ramo "sem posição" da recomendação, marcada como contrária à leitura.
  const ia = db.intencoes.find((i) => i.trilha_id === "t-IA");
  assert.deepEqual([ia.acao, ia.origem, ia.resultado, ia.referencia.contraria], ["ENTRAR_VENDIDO", "RECOMENDACAO", "ORDEM", true]);
  assert.equal(db.ordens.find((o) => o.trilhaId === "t-IA").lado, "VENDIDO");
  // A principal e, por ser a 1ª válida da semana, a réplica; gravadas com a rodada.
  assert.deepEqual(db.recomendacoes.map((r) => r.tipo), ["PRINCIPAL", "REPLICA"]);
  assert.deepEqual(db.rodadas[0].detalhes.recomendacao, { situacao: "VALIDA", motivo: null });

  const de_novo = await rodar("2026-10-06", deps);
  assert.equal(de_novo.decidida, null);
  assert.equal(db.rodadas.length, 1);
  assert.equal(db.chamadasIa.length, 1);
});

test("a réplica é uma por semana; a recomendação que falha deixa a trilha IA no fallback, sem nova entrada", async () => {
  const { db, deps } = ambiente();
  await rodar("2026-10-06", deps);
  await rodar("2026-10-07", deps);
  assert.deepEqual(db.recomendacoes.map((r) => `${r.data} ${r.tipo}`), ["2026-10-06 PRINCIPAL", "2026-10-06 REPLICA", "2026-10-07 PRINCIPAL"]);
  await rodar("2026-10-12", deps);
  assert.ok(db.recomendacoes.some((r) => r.data === "2026-10-12" && r.tipo === "REPLICA"));

  const falha = ambiente({ recomendacaoFalha: true });
  await rodar("2026-10-06", falha.deps);
  const ia = falha.db.intencoes.find((i) => i.trilha_id === "t-IA");
  assert.deepEqual([ia.acao, ia.origem, ia.resultado], ["NAO_ENTRAR", "FALLBACK", "SEM_ORDEM"]);
  assert.ok(!falha.db.ordens.some((o) => o.trilhaId === "t-IA"));
  assert.deepEqual(falha.db.recomendacoes.map((r) => r.tipo), ["PRINCIPAL"]);
  assert.deepEqual(falha.db.rodadas[0].detalhes.recomendacao, { situacao: "FALHA", motivo: "GEMINI_FORA" });
});

test("dia seguinte: liquida ontem nas seis trilhas e decide hoje", async () => {
  const { db, deps } = ambiente();
  await rodar("2026-10-06", deps);
  const r = await rodar("2026-10-07", deps);
  assert.deepEqual(r.liquidadas, ["2026-10-06"]);
  assert.equal(r.decidida, "2026-10-07");
  assert.equal(db.patrimonio.filter((p) => p.data === "2026-10-06").length, 6);
  // O caixa rende a Selic sobre o capital.
  assert.equal(db.patrimonio.find((p) => p.trilhaId === "t-CAIXA").patrimonio, 10005);
});

test("dias úteis sem rotina viram SEM_DECISAO e são liquidados em ordem; o fim de semana não", async () => {
  const { db, deps } = ambiente();
  // A 1ª execução é um dia depois do início: o dia 06/10 vira SEM_DECISAO e já é liquidado.
  const primeira = await rodar("2026-10-07", deps);
  assert.deepEqual([primeira.semDecisao, primeira.liquidadas, primeira.decidida], [["2026-10-06"], ["2026-10-06"], "2026-10-07"]);
  const r = await rodar("2026-10-13", deps);
  assert.deepEqual(r.semDecisao, ["2026-10-08", "2026-10-09", "2026-10-12"]);
  assert.deepEqual(r.liquidadas, ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"]);
  assert.equal(r.decidida, "2026-10-13");
  assert.deepEqual(db.rodadas.find((x) => x.data === "2026-10-06").detalhes, { motivo: "ROTINA_NAO_RODOU" });
});

test("liquidação pendente: para nela, e a rodada de hoje fica SEM_DECISAO", async () => {
  const { db, deps } = ambiente({ pendente: "2026-10-07" });
  await rodar("2026-10-06", deps);
  await rodar("2026-10-07", deps);
  const r = await rodar("2026-10-08", deps);
  assert.deepEqual(r.pendente, { data: "2026-10-07", motivo: "SEM_PTAX_DO_DIA" });
  assert.deepEqual(r.semDecisao, ["2026-10-08"]);
  assert.equal(db.rodadas.find((x) => x.data === "2026-10-08").detalhes.motivo, "LIQUIDACAO_PENDENTE");
});

test("erro na decisão: o dia fica SEM_DECISAO (para ser liquidado) e o erro aparece no resumo", async () => {
  const { db, deps } = ambiente({ erroNaDecisao: true });
  const r = await rodar("2026-10-06", deps);
  assert.equal(r.erro, "fonte fora do ar");
  assert.equal(db.rodadas[0].decisao, "SEM_DECISAO");
  assert.equal(db.rodadas[0].detalhes.motivo, "ERRO_NA_DECISAO");
});

test("antes do início, nada; a rotina isola a falha de uma carteira", async () => {
  const { deps } = ambiente();
  assert.equal((await rodar("2026-10-05", deps)).aguardandoInicio, "2026-10-06");
  const quebrado = { ...deps, carteiraRepository: { ...deps.carteiraRepository, forWorkspace: () => ({ buscar: async () => { throw new Error("banco fora"); } }) } };
  const { resumos } = await executarRotina({}, { ...quebrado, hoje: "2026-10-06", logger: { error() {} } });
  assert.deepEqual(resumos, [{ carteiraId: "c1", erro: "banco fora" }]);
});
