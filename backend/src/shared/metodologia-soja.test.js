"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { FATORES } = require("./fatores-fel1");
const { obterMetodologiaSoja } = require("./metodologia-soja");
const { VALIDACAO_SOJA, PESO_REGRA, montarFatores } = require("./metodologia-base");
const { buscarNoCatalogo } = require("../services/observaveis.service");
const { montarTextoPrompt } = require("../factors/base/texto-prompt");
const { configuracaoDoAtivo } = require("./analise-diaria");

const metodologia = obterMetodologiaSoja();

test("soja (ADR 0116): os 4 fatores da proposta aprovada, no catálogo com a origem e o peso fixo do Comitê, e as 3 regras depois deles", () => {
  assert.deepEqual(
    metodologia.fatores.map((f) => [f.codigo, f.regra?.sigla ?? null]),
    [
      ["SOJA_OFERTA_EUA", null],
      ["SOJA_OFERTA_AMERICA_SUL", null],
      ["SOJA_DEMANDA_EUA", null],
      ["SOJA_POLITICA", null],
      ["SOJA_R1_CALENDARIO", "R1"],
      ["SOJA_R2_FOLGA_BALANCO", "R2"],
      ["SOJA_R3_FUNDOS", "R3"]
    ]
  );
  const doCatalogo = FATORES.filter((f) => f.ativo === "SOJA");
  assert.equal(doCatalogo.length, 4);
  // F1 e F2 Alto (3), F3 Médio (2), F4 Baixo (1): fixos, iguais em todos os horizontes.
  assert.deepEqual(
    doCatalogo.map((f) => [f.codigo, f.peso, f.origem]),
    [
      ["SOJA_OFERTA_EUA", "Alto", "ADR 0116"],
      ["SOJA_OFERTA_AMERICA_SUL", "Alto", "ADR 0116"],
      ["SOJA_DEMANDA_EUA", "Médio", "ADR 0116"],
      ["SOJA_POLITICA", "Baixo", "ADR 0116"]
    ]
  );
  // As regras não estão no catálogo (os eventos não as marcam) e não têm peso.
  assert.ok(!FATORES.some((f) => f.codigo.startsWith("SOJA_R")));
  for (const r of metodologia.fatores.filter((f) => f.regra)) assert.equal(r.peso, PESO_REGRA);
});

test("soja: tudo validado pelo Comitê, com o David (2026-10-08); o F4 é fator de evento de 7 dias; a relevância por horizonte à parte do peso", () => {
  for (const f of metodologia.fatores) assert.deepEqual([f.proposta.situacao, f.proposta.validacao], ["VALIDADA", VALIDACAO_SOJA]);
  assert.deepEqual(metodologia.fatores.find((f) => f.codigo === "SOJA_POLITICA").evento, { janelaDias: 7 });
  assert.deepEqual(metodologia.eventosDoAtivo.excluirFatores, ["SOJA_POLITICA"]);
  // Sem calendário nem agregação em código: o peso fixo vai na tabela 2.3 do prompt, como nos outros ativos.
  assert.equal(metodologia.pesos.noPrompt, null);
  assert.equal(metodologia.pesos.agregacaoFinMind, null);
  // Os pesos e a relevância só dos fatores: as regras não entram.
  assert.equal(metodologia.pesos.fatores.length, 4);
  assert.deepEqual(
    metodologia.pesos.relevancia.fatores.map((f) => [f.sigla, f.peso, ...f.horizontes.map((h) => h.nivel)]),
    [
      ["F1", "Alto", "Média", "Alta", "Alta", "Média"],
      ["F2", "Alto", "Baixa", "Média", "Alta", "Média"],
      ["F3", "Médio", "Baixa", "Baixa", "Média", "Média"],
      ["F4", "Baixo", "Alta", "Alta", "Média", "Baixa"]
    ]
  );
});

test("soja: os observáveis citados existem no catálogo", () => {
  for (const f of metodologia.fatores) for (const codigo of f.dados.observaveis) assert.ok(buscarNoCatalogo(codigo), `${f.codigo}: ${codigo}`);
});

test("soja: a R2 afeta F1, F2 e F3 (nunca o F4) e a R3 só a leitura consolidada", () => {
  const regra = (codigo) => metodologia.fatores.find((f) => f.codigo === codigo).regra;
  assert.deepEqual(regra("SOJA_R2_FOLGA_BALANCO").afeta, ["SOJA_OFERTA_EUA", "SOJA_OFERTA_AMERICA_SUL", "SOJA_DEMANDA_EUA"]);
  assert.deepEqual([regra("SOJA_R3_FUNDOS").afeta, regra("SOJA_R3_FUNDOS").dimensao], [["LEITURA"], "INFORMACAO"]);
});

test("metodologia-base: uma regra no catálogo, antes de um fator, sem sigla ou afetando o que não é do ativo é erro de programação", () => {
  const regra = (extra = {}) => ({ codigo: "SOJA_R9_X", nome: "X", regra: { sigla: "R9", afeta: ["SOJA_OFERTA_EUA"], dimensao: "INTENSIDADE", quando: "sempre" }, fel1: {}, dados: {}, proposta: {}, perguntas: [], ...extra });
  const fator = { codigo: "SOJA_OFERTA_EUA", fel1: {}, dados: {}, proposta: {}, perguntas: [] };
  assert.equal(montarFatores("SOJA", [fator, regra()])[1].regra.sigla, "R9");
  assert.throws(() => montarFatores("SOJA", [regra(), fator]), /depois de todos os fatores/);
  assert.throws(() => montarFatores("SOJA", [fator, regra({ codigo: "SOJA_POLITICA" })]), /não está no catálogo/);
  assert.throws(() => montarFatores("SOJA", [fator, regra({ regra: { sigla: "X", afeta: ["SOJA_OFERTA_EUA"], dimensao: "INTENSIDADE", quando: "s" } })]), /sigla/);
  assert.throws(() => montarFatores("SOJA", [fator, regra({ regra: { sigla: "R9", afeta: ["MILHO_FUNDOS"], dimensao: "INTENSIDADE", quando: "s" } })]), /afeta o que não é fator/);
});

test("texto do prompt: uma regra diz o estado e o efeito, sem pressão nem peso; um fator da soja diz o peso fixo e não cita o FEL 1", () => {
  const r2 = metodologia.fatores.find((f) => f.codigo === "SOJA_R2_FOLGA_BALANCO");
  const calculo = {
    apresentacao: { quadros: [], nota: "Mensal.", regra: "apertado em -{limiarModeradoPct} pontos", parametros: [], semTendencia: true },
    periodicidade: "PUBLICACAO",
    parametros: { limiarModeradoPct: 30 },
    factorId: "folga_balanco_soja",
    factorVersion: 1
  };
  const texto = montarTextoPrompt({ ativo: "SOJA", fator: r2, calculo, ponto: { observedAt: "2026-09-11", estadoTexto: "Apertado", efeitoTexto: "move mais o preço" } });
  assert.match(texto, /^REGRA R2 — Folga do balanço dos EUA — SOJA \(sem peso\)/);
  assert.match(texto, /Situação: validada/);
  assert.match(texto, /C — Estado da regra:\n- Estado: Apertado\n- Efeito: move mais o preço\./);
  assert.doesNotMatch(texto, /Pressão|FEL 1/);

  const f1 = metodologia.fatores.find((f) => f.codigo === "SOJA_OFERTA_EUA");
  const textoF1 = montarTextoPrompt({
    ativo: "SOJA",
    fator: f1,
    calculo: { ...calculo, apresentacao: { ...calculo.apresentacao, rotulosDecisao: { intensidade: { FRACA: "Fraca" } } } },
    ponto: { observedAt: "2026-02-01", decisao: { direcao: "NEUTRA", intensidade: "FRACA", tendencia: null, foraDaJanela: true } }
  });
  assert.match(textoF1, /\(peso Alto\)/);
  assert.match(textoF1, /Pressão: neutra \(fora da janela da safra/);
  assert.doesNotMatch(textoF1, /FEL 1|Intensidade|Tendência/);
});

test("leitura diária da soja: o SJC por horizonte, com as faixas crescentes", () => {
  const config = configuracaoDoAtivo("SOJA");
  assert.equal(config.PRECO.serie, "SJC");
  assert.equal(config.COLETOR, "soja-analise-ia-diario");
  const t1 = config.HORIZONTES.map((h) => config.FAIXAS[h.codigo].t1);
  assert.deepEqual([...t1].sort((a, b) => a - b), t1);
  for (const h of config.HORIZONTES) assert.ok(config.FAIXAS[h.codigo].t1 < config.FAIXAS[h.codigo].t2);
});

test('prompt da soja: a relevância do item 1 é a da metodologia, por extenso ("relevância alta", nunca só "alta")', () => {
  const md = fs.readFileSync(path.join(__dirname, "../ai/prompts/soja-analise-diaria.md"), "utf8").replace(/\s+/g, " ");
  const DIAS = { IMEDIATO: "1 dia", CURTO: "7 dias", MEDIO: "30 dias", LONGO: "90 dias" };
  for (const f of metodologia.pesos.relevancia.fatores) {
    const celulas = f.horizontes.map((h) => `${DIAS[h.horizonte]}, relevância ${h.nivel.toLowerCase()}${h.nota ? ` (${h.nota})` : ""}`);
    const linha = `- ${f.sigla}: ${celulas.join("; ")}.`;
    assert.ok(md.includes(linha), linha);
  }
});
