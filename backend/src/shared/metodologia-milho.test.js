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
    assert.ok(fator.perguntas.length > 0, fator.codigo);
  }
});

test("todo observável citado existe no catálogo", () => {
  for (const fator of obterMetodologiaMilho().fatores) {
    for (const codigo of fator.dados.observaveis) assert.ok(buscarNoCatalogo(codigo), `${fator.codigo}: ${codigo}`);
  }
});

test("calculados: o F3 (estoques) e o F7 (fundos); o milho não tem prompt diário até a aprovação do Comitê", () => {
  const { metodologia } = obterMetodologiaAtivo("MILHO");
  assert.deepEqual(
    metodologia.fatores.filter((f) => f.calculado).map((f) => f.codigo),
    ["MILHO_ESTOQUES_WASDE", "MILHO_FUNDOS"]
  );
  assert.equal(metodologia.promptDiario, false);
  assert.ok(!ATIVOS_COM_PROMPT_DIARIO.includes("MILHO"));
});

test("o ativo: o CCM como preço de referência decidido; a aprovação do Comitê entre as pendências", () => {
  const { doAtivo } = obterMetodologiaMilho();
  assert.ok(doAtivo.decisoes.some((d) => d.startsWith("Preço de referência: o CCM")));
  assert.ok(doAtivo.perguntas.some((p) => p.startsWith("Aprovação do Comitê")));
});
