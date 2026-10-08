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
