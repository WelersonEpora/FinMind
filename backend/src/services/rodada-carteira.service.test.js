"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processarCarteira, executarRotina } = require("./rodada-carteira.service");
const { chaveDoMemo } = require("./recomendacao-carteira.service");
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

function ambiente({ pendente = null, erroNaDecisao = false, recomendacaoFalha = false, posicoesOperador = [], movimentos = [], ordensMudamUmaVez = false } = {}) {
  const db = { rodadas: [], intencoes: [], ordens: [], liquidacoes: [], patrimonio: [], recomendacoes: [], chamadasIa: [], gravacoes: [] };
  let mudaram = ordensMudamUmaVez;
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
      posicoesAbertas: async (trilhaId) => (trilhaId === "t-OPERADOR" ? posicoesOperador : []),
      movimentosDeStop: async () => movimentos,
      encerradas: async () => [],
      existeReplicaEntre: async (_c, inicio, fim) => db.recomendacoes.some((r) => r.tipo === "REPLICA" && r.data >= inicio && r.data <= fim),
      ordensCriadas: async (rodadaId) => db.ordens.filter((o) => o.rodadaId === rodadaId),
      gravarLiquidacao: async ({ rodadaId, data, trilhas, ordensLidas }) => {
        db.gravacoes.push({ data, trilhas, ordensLidas });
        if (mudaram) {
          mudaram = false;
          throw Object.assign(new Error("mudaram"), { code: "ORDENS_MUDARAM" });
        }
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
  const { resumos } = await executarRotina({}, { ...quebrado, hoje: "2026-10-06", logger: { error() {}, warn() {} } });
  assert.deepEqual(resumos, [{ carteiraId: "c1", erro: "banco fora" }]);
});

test("o operador: o stop movido entra na liquidação a partir do dia de vigência", async () => {
  const pos = {
    id: "p-op",
    ativo: "MILHO",
    lado: "COMPRADO",
    contrato: { ticker: "CCMH27", limite: "2027-03-15" },
    entrada: 74,
    distancia: 2,
    stop: 72,
    alvo1: 76,
    alvo2: 80,
    quantidadeInicial: 0.2,
    quantidadeAberta: 0.2,
    alvo1Atingido: false,
    reduzida: false,
    ultimoAjuste: 74,
    resultadoR: 0,
    resultadoMoeda: 0
  };
  const movimentos = [{ posicaoId: "p-op", stop: 74, vigenteDesde: "2026-10-07", registradoEm: "2026-10-06T15:00:00Z" }];
  const { db, deps } = ambiente({ posicoesOperador: [pos], movimentos });
  await rodar("2026-10-06", deps);
  await rodar("2026-10-07", deps);
  // Em 06/10 o movimento ainda não vale: a mínima de 73,8 não toca o stop de 72.
  const de06 = db.gravacoes.find((g) => g.data === "2026-10-06").trilhas.find((t) => t.trilhaId === "t-OPERADOR");
  assert.equal(de06.resultado.estado.posicoes[0].stop, 72);
  await rodar("2026-10-08", deps);
  // Em 07/10 vale o stop de 74: a mínima de 73,8 o atinge.
  const de07 = db.gravacoes.find((g) => g.data === "2026-10-07").trilhas.find((t) => t.trilhaId === "t-OPERADOR");
  assert.deepEqual([de07.resultado.encerradas.length, de07.resultado.encerradas[0]?.motivoSaida], [1, "STOP"]);
});

test("as ordens mudaram durante a liquidação: nada gravado, a rotina lê de novo e liquida", async () => {
  const { db, deps } = ambiente({ ordensMudamUmaVez: true });
  await rodar("2026-10-06", deps);
  const r = await rodar("2026-10-07", deps);
  assert.deepEqual(r.liquidadas, ["2026-10-06"]);
  assert.equal(db.gravacoes.filter((g) => g.data === "2026-10-06").length, 2);
  assert.ok(Array.isArray(db.gravacoes[0].ordensLidas));
});

test("recomendação compartilhada (adendo de 2026-10-16): uma chamada por combinação de ativos antes das carteiras; o Gemini fora tem 2ª tentativa", async () => {
  // Um serviço falso que respeita o memo da rotina, como o real: só conta como chamada o que não estava no memo.
  function servicoFalso(falhasAntes) {
    const reais = [];
    let falhas = falhasAntes;
    return {
      reais,
      recomendar: async ({ data }, d) => {
        const base = { data, tipo: "PRINCIPAL", hash_entrada: "h", versao_prompt: "v", modelo_pedido: "m" };
        const chave = chaveDoMemo(base);
        if (d.memoRecomendacoes?.has(chave)) return d.memoRecomendacoes.get(chave);
        reais.push(data);
        const r =
          falhas-- > 0
            ? { ...base, situacao: "FALHA", motivo_falha: "GEMINI_FORA", recomendacoes: null }
            : { ...base, situacao: "VALIDA", motivo_falha: null, recomendacoes: [RECOMENDACAO], contrarias: {} };
        d.memoRecomendacoes?.set(chave, r);
        return r;
      },
      replicar: async () => null
    };
  }
  const montar = (falhasAntes) => {
    const { db, deps } = ambiente();
    const servico = servicoFalso(falhasAntes);
    const esperas = [];
    const carteiraRepository = { ...deps.carteiraRepository, listarAtivasParaRotina: async () => [{ workspace_id: "w1", id: "c1" }, { workspace_id: "w2", id: "c2" }] };
    return { db, servico, esperas, deps: { ...deps, carteiraRepository, recomendacaoCarteiraService: servico, esperar: async (ms) => esperas.push(ms), hoje: "2026-10-06" } };
  };

  // Duas carteiras com os mesmos ativos: uma chamada só, e a decisão lê do memo.
  const normal = montar(0);
  await executarRotina({}, normal.deps);
  assert.deepEqual(normal.servico.reais, ["2026-10-06"]);
  assert.equal(normal.esperas.length, 0);
  assert.equal(normal.db.intencoes.find((i) => i.trilha_id === "t-IA").origem, "RECOMENDACAO");

  // O Gemini fora na 1ª: pausa de 2 min e 2ª tentativa, antes de decidir; a trilha IA decide com a válida.
  const fora = montar(1);
  await executarRotina({}, fora.deps);
  assert.deepEqual([fora.servico.reais.length, fora.esperas], [2, [120000]]);
  assert.equal(fora.db.intencoes.find((i) => i.trilha_id === "t-IA").origem, "RECOMENDACAO");

  // Fora nas duas: a decisão não chama de novo (lê a falha do memo) e a trilha IA fica no fallback.
  const sempreFora = montar(2);
  await executarRotina({}, sempreFora.deps);
  assert.equal(sempreFora.servico.reais.length, 2);
  assert.equal(sempreFora.db.intencoes.find((i) => i.trilha_id === "t-IA").origem, "FALLBACK");

  // Fim de semana: nada a preparar.
  const sabado = montar(0);
  await executarRotina({}, { ...sabado.deps, hoje: "2026-10-10" });
  assert.equal(sabado.servico.reais.length, 0);
});
