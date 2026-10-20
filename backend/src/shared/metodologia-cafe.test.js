"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FATORES } = require("./fatores-fel1");
const { SITUACAO, obterMetodologiaCafe } = require("./metodologia-cafe");
const { VALIDACAO_MOTORES } = require("./metodologia-base");
const { buscarNoCatalogo } = require("../services/observaveis.service");
const { obterMetodologiaAtivo, ATIVOS_COM_PROMPT_DIARIO } = require("../services/metodologia-ativo.service");

test("os 8 fatores do café do FEL 1, na ordem da planilha, do Motor do Café v1, validados pelo Comitê (ADR 0108)", () => {
  const { ativo, fatores } = obterMetodologiaCafe();
  assert.equal(ativo, "CAFE");
  assert.deepEqual(
    fatores.map((f) => f.codigo),
    FATORES.filter((f) => f.ativo === "CAFE").map((f) => f.codigo)
  );
  for (const fator of fatores) {
    assert.equal(fator.proposta.situacao, SITUACAO.VALIDADA, fator.codigo);
    assert.deepEqual(fator.proposta.validacao, VALIDACAO_MOTORES, fator.codigo);
    assert.match(fator.proposta.autoria, /Motor do Café v1/, fator.codigo);
    // As regras como o estudo escreveu: hipóteses, sem limiar.
    assert.match(fator.proposta.regrasEspecialista.alta, /Hipótese v0 — não validada/, fator.codigo);
    assert.match(fator.proposta.regrasEspecialista.baixa, /Hipótese v0 — não validada/, fator.codigo);
    for (const campo of ["tipo", "direcao", "mecanismo", "fonte"]) assert.ok(fator.fel1[campo], `${fator.codigo}.${campo}`);
    // Uma pergunta respondida sai e vira decisão: o fator tem uma ou outra.
    assert.ok(fator.perguntas.length > 0 || fator.decisoes.length > 0, fator.codigo);
  }
});

test("todo observável citado existe no catálogo", () => {
  for (const fator of obterMetodologiaCafe().fatores) {
    for (const codigo of fator.dados.observaveis) assert.ok(buscarNoCatalogo(codigo), `${fator.codigo}: ${codigo}`);
  }
});

test("os 8 fatores calculados, sem eventos no fator (vão à seção da base, ADR 0095); com prompt diário desde a aprovação do Comitê (ADR 0062)", () => {
  const { metodologia } = obterMetodologiaAtivo("CAFE");
  assert.deepEqual(metodologia.fatores.filter((f) => !f.calculado).map((f) => f.codigo), []);
  assert.ok(metodologia.fatores.every((f) => !f.comEventos && !f.deEvento));
  // A janela de 30 dias da demanda (Comitê) vale na seção; nenhum fator do café é de evento.
  assert.deepEqual(metodologia.eventosDoAtivo, { janelaDias: 7, janelaPorFator: { CAFE_DEMANDA: 30 }, excluirFatores: [] });
  assert.equal(metodologia.promptDiario, true);
  assert.ok(ATIVOS_COM_PROMPT_DIARIO.includes("CAFE"));
});

test("o ativo: a aprovação do Comitê e o ICF como preço de referência entre as decisões (ADR 0062)", () => {
  const { doAtivo } = obterMetodologiaCafe();
  assert.ok(doAtivo.decisoes.some((d) => d.startsWith("Aprovação do Motor do Café v1")));
  assert.ok(doAtivo.decisoes.some((d) => d.startsWith("Preço de referência no prompt e no Centro de Decisão: o ICF")));
  assert.ok(!doAtivo.perguntas.some((p) => p.startsWith("Aprovação do Motor do Café v1")));
});

test("pesos do café: sem calendário (o estudo descarta os pesos fixos), 5 relações por par e as regras transversais", () => {
  const { pesos } = obterMetodologiaCafe();
  assert.equal(pesos.situacao, SITUACAO.PROPOSTA);
  assert.ok(pesos.fatores.every((f) => !f.meses && !f.fixo && !f.papel && !f.sugestao));
  assert.equal(pesos.relacoes, null);
  assert.equal(pesos.pares.length, 5);
  assert.ok(pesos.agregacao.some((r) => r.tema === "Neutralidade mandatória"));
});

test("agregação do café: as quatro regras do estudo estão no prompt como orientação (ADR 0062)", () => {
  const { pesos } = obterMetodologiaCafe();
  assert.deepEqual(
    pesos.agregacao.map((r) => r.noFinMind.situacao),
    ["ORIENTACAO", "ORIENTACAO", "ORIENTACAO", "ORIENTACAO"]
  );
  assert.ok(pesos.agregacao.every((r) => r.noFinMind.texto.startsWith("No prompt")));
});

test("agregação do FinMind (ADR 0066): na tela, vinda do agregador, separada da do David", () => {
  const { agregacaoFinMind: a } = obterMetodologiaCafe().pesos;
  const { PESOS } = require("../factors/agregacao/agregacao-cafe");
  assert.equal(a.situacao, "PROPOSTA");
  // Os pesos da tela são os do cálculo.
  for (const familia of a.familias) {
    for (const h of Object.keys(PESOS)) assert.equal(familia.pesos[h], Math.round(PESOS[h][familia.codigo] * 100));
  }
  assert.deepEqual(a.familias.find((f) => f.codigo === "OFERTA").fatores, ["CAFE_CLIMA", "CAFE_SAFRA_BRASIL", "CAFE_ESTOQUES"]);
  assert.equal(a.modificador.fator, "CAFE_FUNDOS");
  // Nenhum parâmetro da proposta atribuído ao David.
  assert.ok(a.regras.filter((r) => r.origem === "DAVID").every((r) => !/\d,\d|\d%/.test(r.regra)));
});

test("preço de referência do café (análise de 2026-10-19, E1): a série contínua do ICF (proposta) e o basis B3 × NY (informação)", async () => {
  const { obterPrecoReferencia } = require("../services/metodologia-ativo.service");
  assert.equal(obterMetodologiaAtivo("CAFE").metodologia.precoReferencia, true);
  assert.equal(obterMetodologiaAtivo("MILHO").metodologia.precoReferencia, false);
  await assert.rejects(obterPrecoReferencia("MILHO"), /não tem a série contínua nem o basis/);

  // Dois pregões: no 2º, os negócios passam do U26 para o Z26 (dentro da janela do vencimento de setembro). O KC=F
  // ainda está no vencimento de setembro (o último pregão dele foi 18/09/2026).
  const linha = (serie, data, valor) => ({ series_code: serie, observed_at: data, value: String(valor) });
  const linhas = [
    linha("B3.ICF.ICFU26.SETTLE", "2026-08-12", 400),
    linha("B3.ICF.ICFU26.SETTLE", "2026-08-13", 403.2),
    linha("B3.ICF.ICFZ26.SETTLE", "2026-08-12", 380),
    linha("B3.ICF.ICFZ26.SETTLE", "2026-08-13", 382.3),
    linha("B3.ICF.ICFU26.CONTRACTS", "2026-08-12", 900),
    linha("B3.ICF.ICFZ26.CONTRACTS", "2026-08-12", 100),
    linha("B3.ICF.ICFZ26.CONTRACTS", "2026-08-13", 2000),
    linha("YAHOO.KC_CONTINUO.SETTLE", "2026-08-13", 320)
  ];
  const observationRepository = {
    listarUltimasDatasItens: async ({ prefixoSerie }) => (prefixoSerie === "B3.ICF" ? [{ codigo: "ICFU26" }, { codigo: "ICFZ26" }] : []),
    buscarAsOf: async ({ seriesCodes }) => linhas.filter((l) => seriesCodes.includes(l.series_code))
  };
  const { serieContinua, basis } = await obterPrecoReferencia("cafe", { observationRepository, agora: new Date("2026-10-20T12:00:00Z") });
  assert.equal(serieContinua.situacao, "PROPOSTA");
  assert.equal(serieContinua.unidade, "US$/saca");
  assert.deepEqual(serieContinua.trocas.map((t) => [t.data, t.de, t.para, t.motivo]), [["2026-08-13", "ICFU26", "ICFZ26", "LIQUIDEZ"]]);
  // O U26 ajustado pela razão da troca (382,30 / 403,20): 400 × 0,9482 = 379,27.
  assert.deepEqual(serieContinua.pontos, [
    { data: "2026-08-12", ticker: "ICFU26", valor: 400, ajustado: 379.27 },
    { data: "2026-08-13", ticker: "ICFZ26", valor: 382.3, ajustado: 382.3 }
  ]);
  // O basis no mesmo mês do KC=F (setembro): 403,20 − 320 × 1,32277 = 403,20 − 423,29.
  assert.equal(basis.situacao, "INFORMACAO");
  assert.deepEqual([basis.ultimo.contratoIcf, basis.ultimo.contratoKc, basis.ultimo.kcSaca, basis.ultimo.basis, basis.ultimo.basisPct], ["ICFU26", "KCU26", 423.29, -20.09, -4.75]);
});
