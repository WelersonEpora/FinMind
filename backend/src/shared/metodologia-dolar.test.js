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
const { obterMetodologiaDolar } = require("./metodologia-dolar");
const { VALIDACAO_DOLAR, PESO_REGRA } = require("./metodologia-base");
const { buscarNoCatalogo } = require("../services/observaveis.service");
const { configuracaoDoAtivo } = require("./analise-diaria");
const { ATIVOS } = require("../services/centro-decisao.service");
const { SERIES_DE_REFERENCIA } = require("../services/realizado-analise.service");

const metodologia = obterMetodologiaDolar();

test("dólar (ADR 0126): os 8 fatores (os blocos do relatório), no catálogo com a origem e o peso por categoria, e a regra R1 depois deles", () => {
  assert.deepEqual(
    metodologia.fatores.map((f) => [f.codigo, f.peso, f.regra?.sigla ?? null]),
    [
      ["DOLAR_FLUXO", "Baixo", null],
      ["DOLAR_GLOBAL", "Alto", null],
      ["DOLAR_JUROS_EUA", "Alto", null],
      ["DOLAR_JUROS_BRASIL", "Baixo", null],
      ["DOLAR_AVERSAO_RISCO", "Médio", null],
      ["DOLAR_COMMODITIES", "Médio", null],
      ["DOLAR_EXPECTATIVAS", "Baixo", null],
      ["DOLAR_EVENTOS", "Médio", null],
      ["DOLAR_R1_FUNDOS", PESO_REGRA, "R1"]
    ]
  );
  assert.ok(FATORES.filter((f) => f.ativo === "DOLAR").every((f) => f.origem === "ADR 0126"));
  assert.ok(!FATORES.some((f) => f.codigo.startsWith("DOLAR_R")), "a regra não está no catálogo");
});

test("dólar: tudo decidido pelo usuário (2026-10-09, ADR 0126); o F8 é fator de evento de 7 dias; a R1 só informa a leitura", () => {
  for (const f of metodologia.fatores) assert.deepEqual([f.proposta.situacao, f.proposta.validacao], ["VALIDADA", VALIDACAO_DOLAR]);
  assert.deepEqual(metodologia.fatores.find((f) => f.codigo === "DOLAR_EVENTOS").evento, { janelaDias: 7 });
  assert.deepEqual(metodologia.eventosDoAtivo.excluirFatores, ["DOLAR_EVENTOS"]);
  const r1 = metodologia.fatores.find((f) => f.codigo === "DOLAR_R1_FUNDOS").regra;
  assert.deepEqual([r1.afeta, r1.dimensao], [["LEITURA"], "INFORMACAO"]);
  assert.equal(metodologia.pesos.noPrompt, null);
  assert.equal(metodologia.pesos.agregacaoFinMind, null);
  assert.deepEqual(
    metodologia.pesos.relevancia.fatores.map((f) => [f.sigla, ...f.horizontes.map((h) => h.nivel)]),
    [
      ["F1", "Baixa", "Média", "Alta", "Média"],
      ["F2", "Baixa", "Alta", "Alta", "Média"],
      ["F3", "Média", "Alta", "Alta", "Alta"],
      ["F4", "Alta", "Alta", "Alta", "Média"],
      ["F5", "Alta", "Média", "Baixa", "Baixa"],
      ["F6", "Baixa", "Média", "Média", "Média"],
      ["F7", "Baixa", "Média", "Alta", "Alta"],
      ["F8", "Alta", "Alta", "Média", "Baixa"]
    ]
  );
});

test("dólar: os observáveis citados existem no catálogo", () => {
  for (const f of metodologia.fatores) for (const codigo of f.dados.observaveis) assert.ok(buscarNoCatalogo(codigo), `${f.codigo}: ${codigo}`);
});

test('prompt do dólar: a relevância do item 2 é a da metodologia, por extenso ("relevância alta", nunca só "alta")', () => {
  const md = fs.readFileSync(path.join(__dirname, "../ai/prompts/dolar-analise-diaria.md"), "utf8").replace(/\s+/g, " ");
  const DIAS = { IMEDIATO: "1 dia", CURTO: "7 dias", MEDIO: "30 dias", LONGO: "90 dias" };
  for (const f of metodologia.pesos.relevancia.fatores) {
    const celulas = f.horizontes.map((h) => `${DIAS[h.horizonte]}, relevância ${h.nivel.toLowerCase()}${h.nota ? ` (${h.nota})` : ""}`);
    const linha = `- ${f.sigla}: ${celulas.join("; ")}.`;
    assert.ok(md.includes(linha), linha);
  }
});

test("leitura diária do dólar: a PTAX como preço (em market_quote), a curva do DOL como contexto e as faixas crescentes", () => {
  const config = configuracaoDoAtivo("DOLAR");
  assert.equal(config.PRECO.serie, "PTAX");
  assert.equal(config.COLETOR, "dolar-analise-ia-diario");
  assert.deepEqual([config.CURVA.aplica, config.CURVA.porHorizonte, config.CURVA.futuro.prefixo], [true, false, "B3.DOL"]);
  const t1 = config.HORIZONTES.map((h) => config.FAIXAS[h.codigo].t1);
  assert.deepEqual([...t1].sort((a, b) => a - b), t1);
  for (const h of config.HORIZONTES) assert.ok(config.FAIXAS[h.codigo].t1 < config.FAIXAS[h.codigo].t2);
  // A série do preço é a 1ª do Centro de Decisão e a mesma que o realizado conhece.
  const dolar = ATIVOS.find((a) => a.codigo === "DOLAR");
  assert.equal(dolar.series[0].codigo, "PTAX");
  assert.equal(SERIES_DE_REFERENCIA.PTAX.seriesCode, dolar.series[0].seriesCode);
});
