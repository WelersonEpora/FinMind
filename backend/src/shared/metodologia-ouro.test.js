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
const { SITUACAO, obterMetodologiaOuro } = require("./metodologia-ouro");
const { VALIDACAO_MOTORES, textoPeso } = require("./metodologia-base");
const { buscarNoCatalogo } = require("../services/observaveis.service");
const { obterMetodologiaAtivo } = require("../services/metodologia-ativo.service");

test("os 8 fatores do ouro do FEL 1, na ordem da planilha, validados pelo Comitê (ADR 0108)", () => {
  const { ativo, fatores } = obterMetodologiaOuro();
  assert.equal(ativo, "OURO");
  assert.deepEqual(
    fatores.map((f) => f.codigo),
    FATORES.filter((f) => f.ativo === "OURO").map((f) => f.codigo)
  );
  for (const fator of fatores) {
    assert.equal(fator.proposta.situacao, SITUACAO.VALIDADA, fator.codigo);
    assert.deepEqual(fator.proposta.validacao, VALIDACAO_MOTORES, fator.codigo);
    // Cada fator tem o que falta decidir ou o que o David já decidiu (ADR 0054).
    assert.ok(fator.perguntas.length + fator.decisoes.length > 0, fator.codigo);
    assert.ok(fator.dados.avaliacao?.texto, fator.codigo);
  }
});

test("todo observável citado existe no catálogo", () => {
  for (const fator of obterMetodologiaOuro().fatores) {
    for (const codigo of fator.dados.observaveis) assert.ok(buscarNoCatalogo(codigo), `${fator.codigo}: ${codigo}`);
  }
});

test("a geopolítica é o fator de evento (janela de 7 dias); os outros sete são calculados; o ouro tem prompt diário (ADR 0054)", () => {
  const { metodologia } = obterMetodologiaAtivo("OURO");
  assert.equal(metodologia.promptDiario, true);
  assert.equal(metodologia.fatores.find((f) => f.codigo === "OURO_GEOPOLITICA").evento.janelaDias, 7);
  assert.equal(obterMetodologiaAtivo("PETROLEO").metodologia.promptDiario, true);
  assert.deepEqual(
    metodologia.fatores.filter((f) => f.deEvento).map((f) => f.codigo),
    ["OURO_GEOPOLITICA"]
  );
  assert.deepEqual(
    metodologia.fatores.filter((f) => !f.calculado && !f.deEvento).map((f) => f.codigo),
    []
  );
});

test("decisões do David (ADR 0054): os bancos centrais e o COT saem das perguntas", () => {
  const { fatores } = obterMetodologiaOuro();
  const fator = (codigo) => fatores.find((f) => f.codigo === codigo);
  assert.equal(fator("OURO_BANCOS_CENTRAIS").perguntas.length, 0);
  assert.ok(fator("OURO_BANCOS_CENTRAIS").decisoes.some((d) => d.includes("ADR 0054")));
  assert.equal(fator("OURO_FUNDOS").perguntas.length, 0);
});

test("IC por horizonte (ADR 0150, adendo): o juro real, o dólar, a inflação, os ETFs e os fundos como informação, sem peso; votam a geopolítica, os bancos centrais e as minas", () => {
  const { fatores } = obterMetodologiaOuro();
  const semVoto = ["OURO_JUROS_REAIS", "OURO_DOLAR", "OURO_INFLACAO", "OURO_ETFS", "OURO_FUNDOS"];
  assert.deepEqual(fatores.filter((f) => f.informativo).map((f) => f.codigo), semVoto);
  assert.deepEqual(fatores.filter((f) => f.contextoDe).map((f) => f.codigo), []);
  for (const f of fatores.filter((x) => x.informativo)) {
    assert.equal(f.peso, "Sem peso", f.codigo);
    assert.equal(f.papelDecididoPor, "do usuário", f.codigo);
    assert.match(textoPeso(f), /^sem peso, decidido pelo usuário; (Alto|Médio) no FEL 1$/, f.codigo);
    assert.ok(f.decisoes.some((d) => d.includes("ADR 0150, adendo")), f.codigo);
  }
  assert.deepEqual(
    fatores.filter((f) => !f.informativo).map((f) => [f.codigo, f.peso]),
    [["OURO_GEOPOLITICA", "Baixo"], ["OURO_BANCOS_CENTRAIS", "Alto"], ["OURO_MINERACAO", "Baixo"]]
  );
  // Os bancos centrais votam só onde o IC tem sinal (21 e 62 pregões).
  assert.deepEqual(fatores.find((f) => f.codigo === "OURO_BANCOS_CENTRAIS").soNosHorizontes.horizontes, ["MEDIO", "LONGO"]);
  // A geopolítica (ADR 0154): peso Baixo, decidido pelo usuário, e só o IMEDIATO, pelo teste do GPR.
  const geo = fatores.find((f) => f.codigo === "OURO_GEOPOLITICA");
  assert.deepEqual(geo.soNosHorizontes.horizontes, ["IMEDIATO"]);
  assert.deepEqual(geo.pesoAjustado, { noFel1: "Alto", decididoPor: "pelo usuário" });
});
