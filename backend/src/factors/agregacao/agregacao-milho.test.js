"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { agregarMilho, ORIGEM_DAS_REGRAS, resumoParaTela, PARAMETROS } = require("./agregacao-milho");
const { obterMetodologiaMilho } = require("../../shared/metodologia-milho");

const PESOS = obterMetodologiaMilho().pesos;
const d = (direcao, intensidade = "MODERADA") => ({ direcao, intensidade });
// Os 8 fatores do milho; `de` troca a decisão de alguns (null = sem dado).
function fatores(de = {}) {
  const base = {
    MILHO_CLIMA_SAFRA_EUA: d("NEUTRA", "FRACA"),
    MILHO_SAFRINHA: d("NEUTRA", "FRACA"),
    MILHO_ESTOQUES_WASDE: d("NEUTRA", "FRACA"),
    MILHO_DOLAR_PARIDADE: d("NEUTRA", "FRACA"),
    MILHO_ETANOL: d("NEUTRA", "FRACA"),
    MILHO_INSUMOS: d("NEUTRA", "FRACA"),
    MILHO_FUNDOS: d("NEUTRA", "FRACA"),
    MILHO_POLITICA_COMERCIAL: d("NEUTRA", "FRACA"),
    ...de
  };
  return Object.entries(base).map(([codigo, decisao]) => ({ codigo, decisao, ...(codigo === "MILHO_SAFRINHA" && de.colheita !== undefined ? { agregacao: { colheitaMtPct: de.colheita } } : {}) }));
}
const agregar = (de, dataAnalise = "2026-07-15", colheita) =>
  agregarMilho(fatores({ ...de, ...(colheita !== undefined ? { colheita } : {}) }).filter((f) => f.codigo !== "colheita"), { dataAnalise, pesos: PESOS });
const familia = (r, codigo) => r.horizontes[0].familias.find((f) => f.codigo === codigo);

test("o peso é o do mês no calendário do David; o F6 fica fora e a leitura é a mesma nos 4 horizontes", () => {
  // Julho: F1 Alto, F2 Alto, F3 Alto (fixo), F4 Alto, F5 Médio, F8 Médio. Oferta = o teto de um Alto (3), não 9.
  const r = agregar({});
  const pesos = Object.fromEntries(r.horizontes[0].familias.map((f) => [f.codigo, f.pesoEfetivo]));
  assert.deepEqual(pesos, { OFERTA: 0.3, CAMBIO: 0.3, ETANOL: 0.2, POLITICA: 0.2 });
  assert.equal(r.fatores.MILHO_INSUMOS.peso, undefined);
  assert.equal(new Set(r.horizontes.map((h) => JSON.stringify({ ...h, horizonte: null }))).size, 1);
  // Janeiro: o F1 é Baixo (do usuário, ADR 0077) e o F4 Alto; o teto da Oferta é o F3 (Alto).
  const jan = agregar({}, "2026-01-15");
  assert.equal(jan.fatores.MILHO_CLIMA_SAFRA_EUA.peso, "Baixo");
  assert.equal(familia(jan, "OFERTA").pesoEfetivo, 0.3);
});

test("pressão de baixa do F1, do F3 e do F5: no máximo Médio; o F1 de baixa forte (polinização concluída) mantém o do mês", () => {
  assert.equal(agregar({ MILHO_CLIMA_SAFRA_EUA: d("BAIXA") }).fatores.MILHO_CLIMA_SAFRA_EUA.peso, "Médio");
  assert.equal(agregar({ MILHO_CLIMA_SAFRA_EUA: d("BAIXA", "FORTE") }).fatores.MILHO_CLIMA_SAFRA_EUA.peso, "Alto");
  assert.equal(agregar({ MILHO_ESTOQUES_WASDE: d("BAIXA") }).fatores.MILHO_ESTOQUES_WASDE.peso, "Médio");
  // Em outubro o F1 já é Baixo: a regra é um teto, não sobe o peso.
  assert.equal(agregar({ MILHO_CLIMA_SAFRA_EUA: d("BAIXA") }, "2026-10-15").fatores.MILHO_CLIMA_SAFRA_EUA.peso, "Baixo");
});

test("de junho a agosto, com 50% ou mais da safrinha de MT colhida, o F1 desce um nível (ADR 0077)", () => {
  assert.equal(agregar({}, "2026-07-15", 78.9).fatores.MILHO_CLIMA_SAFRA_EUA.peso, "Médio");
  assert.equal(agregar({}, "2026-07-15", 40).fatores.MILHO_CLIMA_SAFRA_EUA.peso, "Alto");
  assert.equal(agregar({}, "2026-09-15", 99).fatores.MILHO_CLIMA_SAFRA_EUA.peso, "Baixo");
});

test("bloco de oferta: um argumento; F3 confirma, contradiz ou define; o F5 contradito pelo F3 desce um nível", () => {
  const confirma = familia(agregar({ MILHO_CLIMA_SAFRA_EUA: d("ALTA", "FORTE"), MILHO_SAFRINHA: d("ALTA"), MILHO_ESTOQUES_WASDE: d("ALTA") }), "OFERTA");
  assert.deepEqual([confirma.score, confirma.detalhe.papelF3], [2, "CONFIRMA"]);
  const contradiz = familia(agregar({ MILHO_SAFRINHA: d("BAIXA", "FORTE"), MILHO_ESTOQUES_WASDE: d("ALTA") }), "OFERTA");
  assert.deepEqual([contradiz.score, contradiz.detalhe.papelF3], [-1, "CONTRADIZ"]);
  const define = familia(agregar({ MILHO_ESTOQUES_WASDE: d("ALTA", "FORTE") }), "OFERTA");
  assert.deepEqual([define.score, define.detalhe.papelF3], [2, "DEFINE"]);
  const etanol = agregar({ MILHO_ESTOQUES_WASDE: d("ALTA"), MILHO_ETANOL: d("BAIXA", "FORTE") });
  assert.equal(etanol.fatores.MILHO_ETANOL.peso, "Baixo");
});

test("o F7 em extremo multiplica por 1,25 o peso de F1, F3 e F8 alinhados; contra a direção, risco de reversão", () => {
  // Fundos vendidos em extremo (pressão de ALTA) e F8 em alta: o F8 pesa 2 × 1,25.
  const r = agregar({ MILHO_FUNDOS: d("ALTA", "FORTE"), MILHO_POLITICA_COMERCIAL: d("ALTA", "FORTE") });
  const politica = familia(r, "POLITICA");
  assert.equal(politica.detalhe.multiplicadoPeloF7, true);
  assert.equal(politica.pesoEfetivo, Math.round((2.5 / 10.5) * 10000) / 10000);
  // Fundos comprados em extremo (pressão de BAIXA) contra uma leitura de alta: confiança desce.
  const contra = agregar({ MILHO_FUNDOS: d("BAIXA", "FORTE"), MILHO_DOLAR_PARIDADE: d("ALTA", "FORTE"), MILHO_ESTOQUES_WASDE: d("ALTA", "FORTE") });
  assert.equal(contra.horizontes[0].tendencia, "ALTA");
  assert.equal(contra.horizontes[0].fundos.papel, "RISCO_DE_REVERSAO");
  assert.equal(contra.horizontes[0].confianca, "BAIXA");
  assert.equal(PARAMETROS.multiplicadorFundos, 1.25);
});

test("conflito entre blocos: mantém a direção do score, marca o conflito e a confiança vai a BAIXA", () => {
  // Julho: Oferta +2 (30%) contra Câmbio −2 (30%), com o etanol e o F8 em +2 (20% cada): S = +0,8, ALTA_LEVE, e as duas
  // maiores contribuições (0,6 e −0,6) se opõem.
  const r = agregar({ MILHO_ESTOQUES_WASDE: d("ALTA", "FORTE"), MILHO_DOLAR_PARIDADE: d("BAIXA", "FORTE"), MILHO_POLITICA_COMERCIAL: d("ALTA", "FORTE"), MILHO_ETANOL: d("ALTA", "FORTE") });
  const h = r.horizontes[0];
  assert.deepEqual(h.conflito.familias, ["OFERTA", "CAMBIO"]);
  assert.equal(h.tendencia, "ALTA");
  assert.equal(h.confianca, "BAIXA");
});

test("cobertura abaixo de 50%: INSUFICIENTE", () => {
  const r = agregar({ MILHO_CLIMA_SAFRA_EUA: null, MILHO_SAFRINHA: null, MILHO_ESTOQUES_WASDE: null, MILHO_DOLAR_PARIDADE: null });
  assert.equal(r.horizontes[0].tendencia, "INSUFICIENTE");
});

test("toda regra tem origem e a frase do prompt; a tela vem do mesmo dado", () => {
  for (const regra of ORIGEM_DAS_REGRAS) {
    assert.ok(["DAVID", "DERIVADA", "PROPOSTA"].includes(regra.origem), regra.regra);
    assert.ok(regra.prompt, regra.regra);
  }
  const tela = resumoParaTela();
  assert.equal(tela.emProducao, false);
  assert.equal(tela.regras.length, ORIGEM_DAS_REGRAS.length);
  assert.deepEqual(PESOS.agregacaoFinMind?.versao, tela.versao);
});
