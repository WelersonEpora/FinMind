"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const diario = require("./diario-carteira.service");
const { parametrosPadrao } = require("../carteiras/parametros");

const PARAMETROS = parametrosPadrao("B3", ["MILHO"]);
const CARTEIRA = { id: "c1", workspace_id: "w1", nome: "Conta B3", conta: "B3", capital_inicial: "10000.00", data_inicio: "2026-10-14" };
const RODADA = { id: "r14", carteira_id: "c1", data: "2026-10-14", decisao: "DECIDIDA", liquidacao: "PENDENTE", decidida_em: "2026-10-14T09:30:00Z" };
const MANUAIS = { VIES_FINMIND: true, ESTRUTURA_SMC: true, KILL_ZONE: true, JANELA_B3: true, SEM_EVENTO: true };

// Um diário em memória: a rodada de 14/10 pendente, o milho com ATR 1 e ajuste 70 (piso do stop: 1,5).
function cenario({ rodadas = [RODADA], posicoes = [], ordens = [], eventos = [], hoje = "2026-10-14" } = {}) {
  const estado = { ordens: ordens.map((o) => ({ ...o })), eventos: [...eventos], transacoes: 0 };
  let seq = 0;
  const rRepo = {
    ultimaRodada: async () => rodadas[rodadas.length - 1] || null,
    listarPendentes: async () => rodadas.filter((r) => r.liquidacao === "PENDENTE"),
    comRodadaTravada: async (id, fn) => {
      estado.transacoes += 1;
      return fn({ rodada: rodadas.find((r) => r.id === id), transaction: "t" });
    },
    seriePatrimonio: async () => [],
    posicoesAbertas: async () => posicoes.filter((p) => p.situacao === "ABERTA"),
    encerradas: async () => [],
    ordensCriadasDaTrilha: async (trilhaId, rodadaId) => estado.ordens.filter((o) => o.trilhaId === trilhaId && o.rodadaId === rodadaId && o.situacao === "CRIADA"),
    buscarOrdem: async (id, trilhaId) => estado.ordens.find((o) => o.id === id && o.trilhaId === trilhaId) || null,
    criarOrdem: async (o) => {
      const nova = { ...o, id: `o${++seq}`, situacao: "CRIADA" };
      estado.ordens.push(nova);
      return nova;
    },
    atualizarOrdemCriada: async (id, campos) => {
      const o = estado.ordens.find((x) => x.id === id && x.situacao === "CRIADA");
      if (!o) return 0;
      Object.assign(o, { ...campos, motivoSituacao: campos.motivo_situacao ?? o.motivoSituacao });
      return 1;
    },
    buscarPosicao: async (id, trilhaId) => posicoes.find((p) => p.id === id && p.trilhaId === trilhaId) || null,
    movimentosDeStop: async () => estado.eventos.filter((e) => e.tipo === "STOP_MOVIDO").map((e) => ({ posicaoId: e.posicaoId, stop: e.preco, vigenteDesde: e.detalhes.vigenteDesde, registradoEm: e.registradoEm })),
    registrarEvento: async (e) => {
      const novo = { ...e, id: `e${++seq}`, registradoEm: `2026-10-14T1${seq}:00:00Z` };
      estado.eventos.push(novo);
      return novo;
    },
    ordensDaTrilha: async () => [...estado.ordens].reverse(),
    listarPosicoes: async () => posicoes,
    eventosDasPosicoes: async () => estado.eventos
  };
  const deps = {
    hoje,
    agora: new Date("2026-10-14T15:00:00Z"),
    carteiraRepository: {
      forWorkspace: () => ({
        buscar: async (id) => (id === "c1" ? CARTEIRA : null),
        listarTrilhas: async () => [{ id: "t-op", tipo: "OPERADOR" }, { id: "t-ia", tipo: "IA" }],
        listarVersoes: async () => [{ versao: 1, tipo: "INICIAL", vigente_desde: "2026-10-14", parametros: PARAMETROS }]
      })
    },
    carteiraRodadaRepository: { forWorkspace: () => rRepo },
    mercadoCarteiraService: {
      lerMercadoParaDecisao: async ({ data, agora }) => {
        estado.mercadoLido = { data, agora: agora.toISOString() };
        return { mercado: { MILHO: { contrato: { ticker: "CCMF27", limite: "2027-01-14" }, atr: 1, ajuste: 70, dataAjuste: "2026-10-13", valorDoPonto: 450 } } };
      }
    }
  };
  return { deps, estado };
}

const ENTRADA = { ativo: "MILHO", lado: "COMPRADO", entrada: "70", stop: "68", checklist: MANUAIS };
const POS = { id: "p1", trilhaId: "t-op", ativo: "MILHO", lado: "COMPRADO", contrato: { ticker: "CCMF27", limite: "2027-01-14" }, situacao: "ABERTA", stop: 68, ultimoAjuste: 71, quantidadeAberta: 0.2, reduzida: false };

test("o dia de registro: a rodada pendente de hoje ou do dia útil anterior; não a liquidada nem a atrasada", async () => {
  const ehAberto = async (rodadas, hoje = "2026-10-14") => diario.diaDeRegistro(CARTEIRA, cenario({ rodadas }).deps.carteiraRodadaRepository.forWorkspace(), hoje);
  assert.equal((await ehAberto([RODADA])).aberto, true);
  // Antes das 06h30 de quinta, a de quarta ainda está aberta.
  assert.equal((await ehAberto([RODADA], "2026-10-15")).aberto, true);
  assert.equal((await ehAberto([{ ...RODADA, liquidacao: "LIQUIDADA" }])).motivo, "RODADA_LIQUIDADA");
  assert.equal((await ehAberto([RODADA], "2026-10-19")).motivo, "ROTINA_ATRASADA");
  assert.equal((await ehAberto([{ ...RODADA, id: "r13", data: "2026-10-13" }, RODADA])).motivo, "LIQUIDACAO_ANTERIOR_PENDENTE");
});

test("a entrada: conferida com o mercado do instante da decisão; a ordem leva quantidade, stop, alvos e o checklist", async () => {
  const { deps, estado } = cenario();
  const { ordem } = await diario.registrarEntrada("w1", "c1", "u1", ENTRADA, deps);
  assert.deepEqual(estado.mercadoLido, { data: "2026-10-14", agora: "2026-10-14T09:30:00.000Z" });
  assert.deepEqual(
    [ordem.rodadaId, ordem.trilhaId, ordem.tipo, ordem.motivo, ordem.precoInformado, ordem.stopInformado, ordem.quantidade, ordem.contrato.ticker],
    ["r14", "t-op", "ENTRADA", "OPERADOR", 70, 68, 0.222222, "CCMF27"]
  );
  assert.deepEqual([ordem.detalhes.plano.alvo1, ordem.detalhes.plano.alvo2, ordem.detalhes.aderente], [72, 76, true]);
  assert.equal(estado.transacoes, 1);
});

test("a entrada abaixo do piso de ATR é recusada; um item manual desmarcado não impede, só tira a aderência", async () => {
  const { deps } = cenario();
  await assert.rejects(() => diario.registrarEntrada("w1", "c1", "u1", { ...ENTRADA, stop: "69" }, deps), (e) => e.statusCode === 400 && e.details.verificacoes.some((v) => v.codigo === "PISO_ATR" && !v.ok));
  const { ordem } = await diario.registrarEntrada("w1", "c1", "u1", { ...ENTRADA, checklist: { ...MANUAIS, KILL_ZONE: false } }, deps);
  assert.equal(ordem.detalhes.aderente, false);
});

test("uma entrada planejada ocupa o ativo; editar cancela a antiga e cria outra; cancelar marca CANCELADA", async () => {
  const { deps, estado } = cenario();
  const { ordem } = await diario.registrarEntrada("w1", "c1", "u1", ENTRADA, deps);
  await assert.rejects(() => diario.registrarEntrada("w1", "c1", "u1", ENTRADA, deps), (e) => e.details.verificacoes.some((v) => v.codigo === "VAGAS_E_TRAVAS" && !v.ok));
  const { ordem: nova } = await diario.editarEntrada("w1", "c1", ordem.id, "u1", { ...ENTRADA, stop: "67" }, deps);
  assert.deepEqual([estado.ordens.find((o) => o.id === ordem.id).situacao, nova.stopInformado, nova.detalhes.substitui], ["CANCELADA", 67, ordem.id]);
  await diario.cancelarOrdem("w1", "c1", nova.id, "u1", deps);
  assert.equal(estado.ordens.find((o) => o.id === nova.id).situacao, "CANCELADA");
  await assert.rejects(() => diario.cancelarOrdem("w1", "c1", nova.id, "u1", deps), (e) => e.statusCode === 409);
});

test("sem dia aberto, nada é registrado (409 com o motivo)", async () => {
  const { deps } = cenario({ rodadas: [{ ...RODADA, liquidacao: "LIQUIDADA" }] });
  await assert.rejects(() => diario.registrarEntrada("w1", "c1", "u1", ENTRADA, deps), (e) => e.statusCode === 409 && e.details.motivo === "RODADA_LIQUIDADA");
});

test("a saída: zerar com o preço; uma por posição e dia; reduzir só uma vez", async () => {
  const { deps } = cenario({ posicoes: [POS] });
  const { ordem } = await diario.registrarSaida("w1", "c1", "p1", "u1", { acao: "ZERAR", preco: "71,5" }, deps);
  assert.deepEqual([ordem.tipo, ordem.posicaoId, ordem.precoInformado, ordem.quantidade], ["SAIDA", "p1", 71.5, 0.2]);
  await assert.rejects(() => diario.registrarSaida("w1", "c1", "p1", "u1", { acao: "REDUZIR", preco: "71" }, deps), (e) => e.statusCode === 409);
  const reduzida = cenario({ posicoes: [{ ...POS, reduzida: true }] });
  await assert.rejects(() => diario.registrarSaida("w1", "c1", "p1", "u1", { acao: "REDUZIR", preco: "71" }, reduzida.deps), /reduzida/);
  const { ordem: metade } = await diario.registrarSaida("w1", "c1", "p1", "u1", { acao: "REDUZIR", preco: "71" }, cenario({ posicoes: [POS] }).deps);
  assert.deepEqual([metade.tipo, metade.quantidade], ["REDUCAO", 0.1]);
});

test("o stop movido: a favor, vale a partir do pregão seguinte; o próximo movimento parte do último", async () => {
  const { deps } = cenario({ posicoes: [POS] });
  const { evento } = await diario.moverStop("w1", "c1", "p1", "u1", { stop: "69" }, deps);
  assert.deepEqual([evento.tipo, evento.preco, evento.detalhes.de, evento.detalhes.vigenteDesde], ["STOP_MOVIDO", 69, 68, "2026-10-15"]);
  await assert.rejects(() => diario.moverStop("w1", "c1", "p1", "u1", { stop: "68.5" }, deps), (e) => e.statusCode === 400 && /a favor/.test(e.details.erros[0]));
  await assert.rejects(() => diario.moverStop("w1", "c1", "p1", "u1", { stop: "72" }, deps), /Stop inválido/);
});

test("o diário: o dia aberto com o mercado e as vagas, e as operações com a fase", async () => {
  const { deps } = cenario();
  await diario.registrarEntrada("w1", "c1", "u1", ENTRADA, deps);
  const { diario: d } = await diario.obterDiario("w1", "c1", deps);
  assert.deepEqual([d.dia.aberto, d.dia.data, d.dia.vagas, d.dia.mercado.MILHO.piso], [true, "2026-10-14", 1, 1.5]);
  assert.equal(d.checklist.length, 8);
  assert.deepEqual(d.operacoes.map((o) => o.fase), ["PLANEJADA"]);
});
