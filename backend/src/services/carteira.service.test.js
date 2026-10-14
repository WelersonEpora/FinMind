"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const carteiraService = require("./carteira.service");
const { parametrosPadrao } = require("../carteiras/parametros");

const HOJE = "2026-10-13";

// Um repositório falso, escopado como o real: guarda as carteiras e as versões por espaço.
function repoFalso() {
  const dados = { carteiras: [], versoes: [], trilhas: [] };
  const forWorkspace = (workspaceId) => ({
    listar: async () => dados.carteiras.filter((c) => c.workspace_id === workspaceId),
    buscar: async (id) => dados.carteiras.find((c) => c.workspace_id === workspaceId && c.id === id) || null,
    buscarPorNome: async (nome) => dados.carteiras.find((c) => c.workspace_id === workspaceId && c.nome === nome) || null,
    criarComTrilhas: async ({ carteira, parametros, motivo, autorUserId }) => {
      const criada = { ...carteira, id: `c${dados.carteiras.length + 1}`, workspace_id: workspaceId, situacao: "ATIVA", criada_por: autorUserId, created_at: "agora" };
      dados.carteiras.push(criada);
      dados.versoes.push({ workspace_id: workspaceId, carteira_id: criada.id, versao: 1, tipo: "INICIAL", vigente_desde: criada.data_inicio, parametros: structuredClone(parametros), motivo, autor_user_id: autorUserId });
      for (const tipo of ["OPERADOR", "IA", "DETERMINISTICA"]) dados.trilhas.push({ workspace_id: workspaceId, carteira_id: criada.id, id: `${criada.id}-${tipo}`, tipo, calculada: false });
      return criada;
    },
    listarVersoes: async (carteiraId) => dados.versoes.filter((v) => v.workspace_id === workspaceId && v.carteira_id === carteiraId).sort((a, b) => b.versao - a.versao),
    listarTrilhas: async (carteiraId) => dados.trilhas.filter((t) => t.workspace_id === workspaceId && t.carteira_id === carteiraId),
    registrarVersao: async ({ carteiraId, tipo, vigenteDesde, parametros, motivo, autorUserId }) => {
      const versao = { workspace_id: workspaceId, carteira_id: carteiraId, versao: dados.versoes.filter((v) => v.carteira_id === carteiraId).length + 1, tipo, vigente_desde: vigenteDesde, parametros: structuredClone(parametros), motivo, autor_user_id: autorUserId };
      dados.versoes.push(versao);
      return versao;
    }
  });
  return { dados, carteiraRepository: { forWorkspace } };
}

const NOVA = { nome: "Conta B3 — Agro", conta: "B3", capitalInicial: 10000, dataInicio: "2026-10-14", ativos: ["MILHO", "CAFE", "SOJA"] };

async function criada(extra = {}) {
  const fake = repoFalso();
  const deps = { carteiraRepository: fake.carteiraRepository, hoje: HOJE, ...extra };
  const { carteira } = await carteiraService.criarCarteira("w1", "u1", NOVA, deps);
  return { fake, deps, carteira };
}

test("criar: a carteira em reais com os padrões da Cartilha e a versão 1", async () => {
  const { fake, carteira } = await criada();
  assert.deepEqual([carteira.conta, carteira.moeda, carteira.capitalInicial, carteira.dataInicio], ["B3", "BRL", 10000, "2026-10-14"]);
  const [v1] = fake.dados.versoes;
  assert.equal(v1.tipo, "INICIAL");
  assert.deepEqual(v1.parametros, parametrosPadrao("B3", ["MILHO", "CAFE", "SOJA"]));
  assert.match(v1.motivo, /Cartilha/);
});

test("criar: recusa início no passado, hoje, fim de semana; ativo de outra conta; nome repetido no espaço", async () => {
  const { deps } = await criada();
  const tentar = (dados) => carteiraService.criarCarteira("w1", "u1", { ...NOVA, nome: "Outra", ...dados }, deps);
  await assert.rejects(() => tentar({ dataInicio: "2026-10-13" }), /nunca começa no passado/);
  await assert.rejects(() => tentar({ dataInicio: "2026-10-17" }), /dia útil/);
  await assert.rejects(() => tentar({ ativos: ["MILHO", "OURO"] }), /não são da conta B3: OURO/);
  await assert.rejects(() => tentar({ capitalInicial: 0 }), /capitalInicial/);
  await assert.rejects(() => tentar({ conta: "XP" }), /conta/);
  // A conta internacional (etapa 8): ouro e petróleo, em dólar; um ativo da B3 nela é recusado.
  await assert.rejects(() => tentar({ conta: "INTERNACIONAL", ativos: ["OURO", "MILHO"] }), /não são da conta INTERNACIONAL: MILHO/);
  const { carteira: intl } = await tentar({ nome: "Internacional", conta: "INTERNACIONAL", ativos: ["OURO", "PETROLEO"], capitalInicial: 2000 });
  assert.deepEqual([intl.conta, intl.moeda, intl.capitalInicial], ["INTERNACIONAL", "USD", 2000]);
  await assert.rejects(() => carteiraService.criarCarteira("w1", "u1", NOVA, deps), (e) => e.statusCode === 409);
  // O mesmo nome em outro espaço pode.
  await carteiraService.criarCarteira("w2", "u2", NOVA, deps);
});

test("criar: parâmetros enviados são validados e precisam bater com a conta e os ativos", async () => {
  const fake = repoFalso();
  const deps = { carteiraRepository: fake.carteiraRepository, hoje: HOJE };
  const parametros = parametrosPadrao("B3", ["MILHO"]);
  parametros.ativos.MILHO.riscoPct = 50;
  await assert.rejects(
    () => carteiraService.criarCarteira("w1", "u1", { ...NOVA, parametros }, deps),
    (e) => e.statusCode === 400 && e.details.erros.some((x) => x.includes("riscoPct")) && e.details.erros.some((x) => x.includes("ativos escolhidos"))
  );
});

test("detalhar: parâmetros em vigor, custo pendente, trilhas e versões; carteira de outro espaço não existe", async () => {
  const { deps, carteira } = await criada();
  const { carteira: detalhe } = await carteiraService.obterCarteira("w1", carteira.id, deps);
  assert.equal(detalhe.parametros.ativos.MILHO.riscoPct, 2);
  assert.equal(detalhe.pendencias.length, 3);
  assert.deepEqual(detalhe.trilhas.map((t) => t.tipo), ["OPERADOR", "IA", "DETERMINISTICA"]);
  assert.deepEqual(detalhe.versoes.map((v) => v.versao), [1]);
  await assert.rejects(() => carteiraService.obterCarteira("w2", carteira.id, deps), (e) => e.statusCode === 404);
});

test("versão nova: ajuste vale a partir da próxima rodada; antes do início, do início", async () => {
  const { fake, deps, carteira } = await criada();
  const parametros = parametrosPadrao("B3", ["MILHO", "CAFE", "SOJA"]);
  parametros.ativos.CAFE.riscoPct = 1.5;
  // A carteira começa amanhã (14/10), que é também a próxima rodada.
  const { versao } = await carteiraService.registrarVersaoDeParametros("w1", carteira.id, "u1", { parametros, motivo: "Comitê: café em 1,5%" }, deps);
  assert.deepEqual([versao.versao, versao.tipo, versao.vigenteDesde], [2, "AJUSTE", "2026-10-14"]);

  // Depois do início: a partir do próximo dia útil.
  const depois = { ...deps, hoje: "2026-10-23" };
  parametros.carteira.maxPosicoes = 3;
  const r = await carteiraService.registrarVersaoDeParametros("w1", carteira.id, "u1", { parametros, motivo: "Três posições" }, depois);
  assert.deepEqual([r.versao.tipo, r.versao.vigenteDesde], ["AJUSTE", "2026-10-26"]);
  assert.equal(fake.dados.versoes.length, 3);
});

test("versão nova: só o custo vira correção desde o início; custo junto com outra mudança é recusado; nada mudou também", async () => {
  const { deps, carteira } = await criada({ hoje: HOJE });
  const depois = { ...deps, hoje: "2026-11-20" };
  const parametros = parametrosPadrao("B3", ["MILHO", "CAFE", "SOJA"]);
  parametros.ativos.MILHO.custoPorContrato = 1.2;
  const { versao } = await carteiraService.registrarVersaoDeParametros("w1", carteira.id, "u1", { parametros, motivo: "Custo da corretora" }, depois);
  assert.deepEqual([versao.tipo, versao.vigenteDesde], ["CORRECAO_CUSTO", "2026-10-14"]);

  const misto = structuredClone(parametros);
  misto.ativos.CAFE.custoPorContrato = 1.8;
  misto.ativos.CAFE.riscoPct = 1.5;
  await assert.rejects(() => carteiraService.registrarVersaoDeParametros("w1", carteira.id, "u1", { parametros: misto, motivo: "x" }, depois), /versão à parte/);
  await assert.rejects(() => carteiraService.registrarVersaoDeParametros("w1", carteira.id, "u1", { parametros, motivo: "x" }, depois), /Nada mudou/);
  await assert.rejects(() => carteiraService.registrarVersaoDeParametros("w1", carteira.id, "u1", { parametros, motivo: " " }, depois), /motivo/);
  const outraConta = parametrosPadrao("INTERNACIONAL", ["OURO"]);
  await assert.rejects(() => carteiraService.registrarVersaoDeParametros("w1", carteira.id, "u1", { parametros: outraConta, motivo: "x" }, depois), (e) => e.details.erros.some((x) => x.includes("não muda")));
});
