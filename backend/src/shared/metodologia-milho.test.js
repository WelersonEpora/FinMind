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
const { SITUACAO, obterMetodologiaMilho } = require("./metodologia-milho");
const { buscarNoCatalogo } = require("../services/observaveis.service");
const { obterMetodologiaAtivo, ATIVOS_COM_PROMPT_DIARIO } = require("../services/metodologia-ativo.service");

test("os 8 fatores do milho do FEL 1, na ordem da planilha, todos como proposta do David (v0)", () => {
  const { ativo, fatores } = obterMetodologiaMilho();
  assert.equal(ativo, "MILHO");
  assert.deepEqual(
    fatores.map((f) => f.codigo),
    FATORES.filter((f) => f.ativo === "MILHO").map((f) => f.codigo)
  );
  for (const fator of fatores) {
    assert.equal(fator.proposta.situacao, SITUACAO.PROPOSTA, fator.codigo);
    assert.match(fator.proposta.autoria, /David, Motor do Milho v0/, fator.codigo);
    assert.match(fator.proposta.regrasEspecialista.alta, /^R-[A-Z]+-01 v0/, fator.codigo);
    assert.match(fator.proposta.regrasEspecialista.baixa, /^R-[A-Z]+-02 v0/, fator.codigo);
    for (const campo of ["tipo", "direcao", "mecanismo", "fonte"]) assert.ok(fator.fel1[campo], `${fator.codigo}.${campo}`);
    // Uma pergunta respondida vira decisão: o fator tem uma ou outra.
    assert.ok(fator.perguntas.length > 0 || fator.decisoes.length > 0, fator.codigo);
  }
});

test("todo observável citado existe no catálogo", () => {
  for (const fator of obterMetodologiaMilho().fatores) {
    for (const codigo of fator.dados.observaveis) assert.ok(buscarNoCatalogo(codigo), `${fator.codigo}: ${codigo}`);
  }
});

test("os 8 fatores calculados; com prompt diário desde a aprovação do Comitê (ADR 0058)", () => {
  const { metodologia } = obterMetodologiaAtivo("MILHO");
  assert.deepEqual(
    metodologia.fatores.filter((f) => !f.calculado).map((f) => f.codigo),
    []
  );
  assert.equal(metodologia.promptDiario, true);
  assert.ok(ATIVOS_COM_PROMPT_DIARIO.includes("MILHO"));
});

test("o ativo: o CCM como preço de referência e a aprovação do Comitê entre as decisões (ADR 0058)", () => {
  const { doAtivo } = obterMetodologiaMilho();
  assert.ok(doAtivo.decisoes.some((d) => d.startsWith("Preço de referência: o CCM")));
  assert.ok(doAtivo.decisoes.some((d) => d.startsWith("Aprovação do Comitê")));
  assert.ok(!doAtivo.perguntas.some((p) => p.startsWith("Aprovação do Comitê")));
});

test("pesos do Motor v0: calendário com os meses decididos pelo usuário marcados, matriz 8×8 e as 9 regras de agregação", () => {
  const { pesos, fatores } = obterMetodologiaMilho();
  assert.match(pesos.autoria, /David, Motor do Milho v0/);
  assert.equal(pesos.situacao, SITUACAO.PROPOSTA);
  assert.deepEqual(
    pesos.fatores.map((f) => f.sigla),
    ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"]
  );
  const porCodigo = Object.fromEntries(pesos.fatores.map((f) => [f.codigo, f]));
  // O peso do FEL 1 é o mesmo do fator (o que vai ao prompt); a sugestão do David fica ao lado.
  for (const fator of fatores) assert.equal(porCodigo[fator.codigo].pesoFel1, fator.peso);
  assert.equal(porCodigo.MILHO_DOLAR_PARIDADE.pesoFel1, "Médio");
  assert.match(porCodigo.MILHO_DOLAR_PARIDADE.sugestao, /^Alto/);
  // F1: de janeiro a maio o especialista não definiu: Baixo, decidido pelo usuário (ADR 0077); Alto em julho.
  const clima = porCodigo.MILHO_CLIMA_SAFRA_EUA.meses;
  assert.deepEqual(clima.slice(0, 5).map((m) => m.peso), ["Baixo", "Baixo", "Baixo", "Baixo", "Baixo"]);
  assert.match(clima[0].decididoPor, /Usuário.*ADR 0077/);
  assert.equal(clima[8].decididoPor, undefined);
  assert.equal(clima[6].peso, "Alto");
  // F2: janeiro e fevereiro, Médio, decidido pelo usuário (ADR 0077).
  assert.deepEqual(porCodigo.MILHO_SAFRINHA.meses.slice(0, 2).map((m) => [m.peso, Boolean(m.decididoPor)]), [["Médio", true], ["Médio", true]]);
  // F4: Alto de julho a janeiro.
  assert.deepEqual(
    porCodigo.MILHO_DOLAR_PARIDADE.meses.map((m) => m.peso),
    ["Alto", "Médio", "Médio", "Médio", "Médio", "Médio", "Alto", "Alto", "Alto", "Alto", "Alto", "Alto"]
  );
  assert.equal(porCodigo.MILHO_ETANOL.meses[6].condicao.startsWith("Alto na base de MT"), true);
  assert.equal(porCodigo.MILHO_FUNDOS.meses, null);
  assert.match(porCodigo.MILHO_FUNDOS.papel, /^Não vota/);
  assert.equal(Object.keys(pesos.relacoes.matriz).length, 8);
  assert.equal(pesos.agregacao.length, 9);
});

test("ajustes ao FEL 1 (ADR 0082): só no F4, F5, F6 e F7, cada um com a origem; nenhuma pergunta do ativo pendente", () => {
  const { fatores, doAtivo } = obterMetodologiaMilho();
  const comAjuste = fatores.filter((f) => f.ajustesFel1.length).map((f) => f.codigo);
  assert.deepEqual(comAjuste, ["MILHO_DOLAR_PARIDADE", "MILHO_ETANOL", "MILHO_INSUMOS", "MILHO_FUNDOS"]);
  const insumos = fatores.find((f) => f.codigo === "MILHO_INSUMOS");
  assert.equal(insumos.ajustesFel1.find((a) => a.campo === "Peso").ajuste, "Baixo (Médio para vencimentos de 6 meses ou mais, com margem ≤ 0)");
  for (const f of fatores) for (const a of f.ajustesFel1) assert.match(a.origem, /ADRs? \d{4}/, `${f.codigo}.${a.campo}`);
  assert.deepEqual(doAtivo.perguntas, []);
  assert.ok(doAtivo.decisoes.some((d) => d.startsWith("Ajustes ao FEL 1")));
});

test("eventos (ADR 0095): só a política comercial (F8) é fator com eventos; os demais vão à seção da base, em 7 dias", () => {
  const { metodologia } = obterMetodologiaAtivo("MILHO");
  assert.deepEqual(metodologia.fatores.filter((f) => f.comEventos || f.deEvento).map((f) => [f.codigo, f.evento.janelaDias]), [["MILHO_POLITICA_COMERCIAL", 30]]);
  assert.deepEqual(metodologia.eventosDoAtivo, { janelaDias: 7, janelaPorFator: {}, excluirFatores: ["MILHO_POLITICA_COMERCIAL"] });
});
