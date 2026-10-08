"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const s = require("./modelos/soja-comum");
const f1 = require("./oferta-eua-soja.factor");
const f2 = require("./oferta-america-sul-soja.factor");
const { derivarDemandaEuaSoja } = require("./demanda-eua-soja.factor");
const r2 = require("./folga-balanco-soja.regra");
const r3 = require("./fundos-soja.regra");
const { CALENDARIO } = require("./calendario-soja.regra");

// Uma versão no formato de obterVersoesAsOf/obterAsOf (publicada ao meio-dia de Nova York, no dia em São Paulo).
const versao = (seriesCode, observedAt, dia, value) => ({ seriesCode, observedAt, value, publishedAt: new Date(`${dia}T16:00:00Z`), publishedAtIsEstimated: false });
const P = s.PARAMETROS_POSICAO_SOJA;

// --- Comum ----------------------------------------------------------------------------------------------------------

test("soja-comum: a revisão de uma edição é contra o que se sabia na véspera; sem a versão anterior, null", () => {
  const indice = s.indexarVersoes([versao("A", "2026-09-01", "2026-05-12", 100), versao("A", "2026-09-01", "2026-06-11", 103)]);
  assert.deepEqual(s.revisaoNaEdicao(indice, ["A"], "2026-09-01", "2026-06-11"), { revisaoPct: 3, depois: 103, antes: 100 });
  assert.equal(s.revisaoNaEdicao(indice, ["A"], "2026-09-01", "2026-05-12"), null);
  // Uma edição sem linha nova na série: a revisão é zero (a versão vigente é a mesma).
  assert.equal(s.revisaoNaEdicao(indice, ["A"], "2026-09-01", "2026-07-10").revisaoPct, 0);
});

test("soja-comum: a mesma semana dos anos anteriores, a até 3 dias, sem o ano corrente; com menos de 10 anos, sem posição", () => {
  const semanas = [];
  for (let ano = 2010; ano <= 2025; ano += 1) semanas.push({ observedAt: `${ano}-07-0${(ano % 3) + 4}`, valor: ano - 2000, dia: `${ano}-07-08` });
  const ponto = { observedAt: "2026-07-05", valor: 3 };
  const pos = s.posicaoNaMesmaSemana([...semanas, { ...ponto, dia: "2026-07-06" }], ponto);
  assert.equal(pos.n, 16);
  assert.equal(pos.percentil, 0);
  assert.equal(pos.posicao, -50);
  assert.equal(s.posicaoNaMesmaSemana(semanas.slice(0, 5), ponto).posicao, null);
});

test("medição aprovada (§2.5): a confirmação no lado oposto limita a fraca; neutra ou no mesmo lado, nada muda; primário neutro não vira sinal", () => {
  const alta = { direcao: "ALTA", intensidade: "FORTE" };
  const contra = { rotulo: "o VHI", leitura: { direcao: "BAIXA", intensidade: "MODERADA" } };
  assert.deepEqual(s.aplicarConfirmacoes(alta, [contra]), { direcao: "ALTA", intensidade: "FRACA", limitadoPor: ["o VHI"] });
  assert.deepEqual(s.aplicarConfirmacoes(alta, [{ rotulo: "x", leitura: { direcao: "NEUTRA", intensidade: "FRACA" } }]), { ...alta, limitadoPor: [] });
  const neutra = { direcao: "NEUTRA", intensidade: "FRACA" };
  assert.deepEqual(s.aplicarConfirmacoes(neutra, [contra]), { ...neutra, limitadoPor: [] });
});

test("F1 de junho a agosto: no mesmo lado vale o mais intenso; em lados opostos, o mais extremo, limitado a fraca; no empate, o publicado por último", () => {
  const area = (posicao, dia = "2026-06-30") => ({ rotulo: "área", dia, posicao, leitura: s.decidirPosicao(posicao, P, "BAIXA") });
  const prod = (posicao, dia = "2026-07-06") => ({ rotulo: "produtividade", dia, posicao, leitura: s.decidirPosicao(posicao, P, "BAIXA") });
  assert.equal(s.combinarComponentes(area(-35), prod(-45)).intensidade, "FORTE");
  const opostos = s.combinarComponentes(area(42), prod(-35));
  assert.deepEqual([opostos.direcao, opostos.intensidade, opostos.decidiu, opostos.conflito], ["BAIXA", "FRACA", "área", true]);
  const empate = s.combinarComponentes(area(50), prod(-50));
  assert.deepEqual([empate.direcao, empate.decidiu, empate.empate], ["ALTA", "produtividade", true]);
  assert.equal(s.combinarComponentes(area(5), prod(-45)).decidiu, "produtividade");
});

// --- F1 -------------------------------------------------------------------------------------------------------------

test("F1: a janela vai da intenção de plantio ao WASDE de janeiro; o período troca na 1ª condição e no WASDE de agosto", () => {
  const areas = new Map([[2026, { INTENCAO: { dia: "2026-03-31" } }]]);
  const edicoes = ["2026-01-12", "2026-07-10", "2026-08-12", "2027-01-12"];
  const condicoes = [{ observedAt: "2026-05-31", dia: "2026-06-01" }];
  const ctx = { areas, edicoes, condicoes };
  const periodo = (dia) => f1.periodoDoF1(dia, ctx).periodo.codigo;
  assert.equal(periodo("2026-03-30"), "FORA");
  assert.equal(periodo("2026-03-31"), "AREA");
  assert.equal(periodo("2026-06-01"), "AREA_PRODUTIVIDADE");
  assert.equal(periodo("2026-08-12"), "REVISAO");
  assert.equal(periodo("2027-01-12"), "REVISAO");
  assert.equal(periodo("2027-01-13"), "FORA");
});

test("F1: a intenção é lida contra a área final do ano anterior, e o Acreage contra a intenção do mesmo ano (§2.8)", () => {
  const indice = s.indexarVersoes([
    versao(f1.SERIES.area, "2025-09-01", "2025-03-31", 83000),
    versao(f1.SERIES.area, "2025-09-01", "2026-03-31", 80000),
    versao(f1.SERIES.area, "2026-09-01", "2026-03-31", 84000),
    versao(f1.SERIES.area, "2026-09-01", "2026-06-30", 84840)
  ]);
  const r = f1.relatoriosDeArea(indice).get(2026);
  assert.equal(r.INTENCAO.variacaoPct, 5);
  assert.equal(r.ACREAGE.variacaoPct, 1);
});

// --- F2 -------------------------------------------------------------------------------------------------------------

test("F2: de 1º de novembro a 30 de junho, na safra do ano de novembro; o VHI de cada mês da fase crítica", () => {
  assert.deepEqual([f2.periodoDoF2("2026-10-31").periodo.codigo, f2.periodoDoF2("2026-11-01").periodo.codigo], ["FORA", "PLANTIO"]);
  assert.deepEqual(f2.periodoDoF2("2027-02-10"), { ano: 2026, periodo: f2.PERIODO.FASE_CRITICA });
  assert.deepEqual(f2.periodoDoF2("2027-06-30"), { ano: 2026, periodo: f2.PERIODO.COLHEITA });
  assert.equal(f2.periodoDoF2("2027-07-01").periodo.codigo, "FORA");
  assert.deepEqual([f2.paisesDoVhi("2026-12-10"), f2.paisesDoVhi("2027-01-10"), f2.paisesDoVhi("2027-03-10")], [["BRASIL"], ["BRASIL", "ARGENTINA"], ["ARGENTINA"]]);
});

// --- F3 -------------------------------------------------------------------------------------------------------------

test("F3: a revisão do uso (exportação + esmagamento) pressiona no mesmo sentido; o 1º número da safra é neutro; com histórico curto, sem leitura", () => {
  const linhas = [];
  // 12 edições com revisões pequenas (o histórico) e uma última com +5%.
  let exportacao = 1000;
  for (let m = 1; m <= 12; m += 1) {
    const dia = `2025-${String(m).padStart(2, "0")}-10`;
    if (m > 1) exportacao += m % 2 ? 2 : -2;
    linhas.push(versao("WASDE.SOJA.EUA.EXPORTS", "2025-09-01", dia, exportacao), versao("WASDE.SOJA.EUA.CRUSHINGS", "2025-09-01", dia, 1000));
  }
  linhas.push(versao("WASDE.SOJA.EUA.EXPORTS", "2025-09-01", "2026-01-12", exportacao + 100));
  const pontos = derivarDemandaEuaSoja(linhas);
  assert.equal(pontos[0].leituraTexto, "neutra: o 1º número da safra não tem revisão");
  assert.equal(pontos[1].decisao, null);
  const ultimo = pontos.at(-1);
  assert.deepEqual([ultimo.decisao.direcao, ultimo.decisao.intensidade], ["ALTA", "FORTE"]);
});

// --- Regras ---------------------------------------------------------------------------------------------------------

test("R2: apertado até o percentil 20, folgado a partir do 80 (os limites aprovados), normal no meio", () => {
  const p = r2.PARAMETROS_PADRAO;
  assert.equal(r2.estadoDaPosicao(-30, p).codigo, "APERTADO");
  assert.equal(r2.estadoDaPosicao(-29.9, p).codigo, "NORMAL");
  assert.equal(r2.estadoDaPosicao(30, p).codigo, "FOLGADO");
  assert.equal(r2.estadoDaPosicao(null, p), null);
});

test("R2: o estoque/uso de cada edição contra as edições do MESMO MÊS nos anos anteriores; menos de 5 anos, sem estado", () => {
  const linhas = [];
  for (let ano = 2011; ano <= 2017; ano += 1) {
    for (const mes of ["05", "06"]) {
      const dia = `${ano}-${mes}-10`;
      const estoque = mes === "05" ? 100 + ano - 2011 : 500;
      linhas.push(versao(r2.SERIES.estoque, `${ano}-09-01`, dia, estoque), versao(r2.SERIES.uso, `${ano}-09-01`, dia, 1000));
    }
  }
  const pontos = r2.derivarFolgaBalancoSoja(linhas);
  const maio = pontos.filter((p) => p.observedAt.slice(5, 7) === "05");
  assert.equal(maio[4].estado, null);
  // Em maio, o estoque/uso sobe todo ano: o de 2016 é o maior das 5 edições de maio anteriores.
  assert.equal(maio[5].estado.codigo, "FOLGADO");
  assert.equal(maio[5].percentilMesmoMes, 100);
});

test("R3: extremo comprado no percentil 90 ou acima, vendido no 10 ou abaixo (os do café); o extremo comprado aponta baixa", () => {
  const p = r3.PARAMETROS_PADRAO;
  assert.deepEqual(r3.estadoDaPosicao(40, p), { codigo: "EXTREMO_COMPRADO", rotulo: "Extremo comprado", aponta: "BAIXA" });
  assert.equal(r3.estadoDaPosicao(-40, p).aponta, "ALTA");
  assert.equal(r3.estadoDaPosicao(39.9, p).codigo, "FORA_DO_EXTREMO");
});

test("R1: o calendário da §2.4 tem os 12 meses de cada país, com a fase crítica nos meses da proposta", () => {
  for (const pais of ["EUA", "BRASIL", "ARGENTINA"]) assert.equal(CALENDARIO[pais].length, 12);
  assert.match(CALENDARIO.EUA[6], /fase crítica/);
  assert.match(CALENDARIO.BRASIL[0], /fase crítica/);
  assert.match(CALENDARIO.ARGENTINA[2], /fase crítica/);
});
