"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const ag = require("./agregacao-cafe");

// Um fator como simularFatores o devolve: a parte C e, na safra, a publicação.
const f = (codigo, direcao, intensidade, publicadoEm = null) => ({
  codigo,
  decisao: direcao ? { direcao, intensidade: direcao === "NEUTRA" ? "FRACA" : intensidade } : null,
  publicadoEm
});
const neutros = () => Object.keys(ag.HORIZONTE_DO_FATOR).map((c) => f(c, "NEUTRA"));
const com = (...trocas) => {
  const porCodigo = new Map(neutros().map((x) => [x.codigo, x]));
  for (const t of trocas) porCodigo.set(t.codigo, t);
  return [...porCodigo.values()];
};
const horizonte = (r, h) => r.horizontes.find((x) => x.horizonte === h);
const familia = (hz, codigo) => hz.familias.find((x) => x.codigo === codigo);

// Uma segunda-feira sem Conab recente (a última publicação, semanas antes).
const DATA = "2026-10-05";
const CONAB_ANTIGA = "2026-09-24T15:00:00Z";

test("pesos: derivados do horizonte do estudo x FEL 1 (a tabela aprovada), somando 1 em cada horizonte", () => {
  const r = (n) => Math.round(n * 100);
  assert.deepEqual(Object.fromEntries(Object.entries(ag.PESOS.IMEDIATO).map(([k, v]) => [k, r(v)])), { OFERTA: 60, CAMBIO: 40, DEMANDA: 0, JUROS: 0, CUSTOS: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(ag.PESOS.CURTO).map(([k, v]) => [k, r(v)])), { OFERTA: 60, CAMBIO: 40, DEMANDA: 0, JUROS: 0, CUSTOS: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(ag.PESOS.MEDIO).map(([k, v]) => [k, r(v)])), { OFERTA: 50, CAMBIO: 0, DEMANDA: 33, JUROS: 17, CUSTOS: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(ag.PESOS.LONGO).map(([k, v]) => [k, r(v)])), { OFERTA: 50, CAMBIO: 0, DEMANDA: 33, JUROS: 17, CUSTOS: 0 });
  for (const h of ag.HORIZONTES) assert.ok(Math.abs(Object.values(ag.PESOS[h]).reduce((s, v) => s + v, 0) - 1) < 1e-9);
});

test("origem: todo parâmetro operacional está registrado como PROPOSTA, nenhum atribuído ao David", () => {
  const propostas = ag.ORIGEM_DAS_REGRAS.filter((r) => r.origem === ag.ORIGEM.PROPOSTA).map((r) => r.regra).join(" | ");
  for (const trecho of ["Pesos por horizonte", "0,5", "1,25", "50%", "75%", "80%", "25%", "MÉDIA", "2 pregões"]) {
    assert.ok(propostas.includes(trecho), `sem registro como PROPOSTA: ${trecho}`);
  }
});

test("score do fator: forte ±2, moderada ±1, neutra 0, sem dado 0 e ausente", () => {
  assert.deepEqual(ag.scoreDoFator(f("X", "ALTA", "FORTE")), { score: 2, ausente: false });
  assert.deepEqual(ag.scoreDoFator(f("X", "BAIXA", "MODERADA")), { score: -1, ausente: false });
  assert.deepEqual(ag.scoreDoFator(f("X", "NEUTRA")), { score: 0, ausente: false });
  assert.deepEqual(ag.scoreDoFator(f("X", null)), { score: 0, ausente: true });
  assert.deepEqual(ag.scoreDoFator(undefined), { score: 0, ausente: true });
});

test("F1 + F2: mesmo sinal, o maior módulo sem somar; opostos, soma líquida com conflito", () => {
  const s = (score) => ({ score, ausente: false });
  assert.deepEqual(ag.precedenciaF1F2(s(1), s(2)), { base: 2, conflito: false });
  assert.deepEqual(ag.precedenciaF1F2(s(-2), s(0)), { base: -2, conflito: false });
  assert.deepEqual(ag.precedenciaF1F2(s(2), s(-1)), { base: 1, conflito: true });
  assert.deepEqual(ag.precedenciaF1F2(s(1), s(-1)), { base: 0, conflito: true });
  assert.deepEqual(ag.precedenciaF1F2({ score: 0, ausente: true }, s(-1)), { base: -1, conflito: false });
  assert.deepEqual(ag.precedenciaF1F2({ score: 0, ausente: true }, { score: 0, ausente: true }), { base: null, conflito: false });
});

test("F3: confirma (mantém), contradiz (módulo - 1) ou define (no máximo ±1)", () => {
  const s = (score) => ({ score, ausente: false });
  const todos = ["CAFE_CLIMA", "CAFE_SAFRA_BRASIL", "CAFE_ESTOQUES"];
  const confirma = ag.agregarOferta({ CAFE_CLIMA: s(0), CAFE_SAFRA_BRASIL: s(-2), CAFE_ESTOQUES: s(-1) }, todos);
  assert.equal(confirma.score, -2);
  assert.equal(confirma.detalhe.papelF3, "CONFIRMA");
  assert.equal(confirma.detalhe.confirmado, true);
  const contradiz = ag.agregarOferta({ CAFE_CLIMA: s(0), CAFE_SAFRA_BRASIL: s(-2), CAFE_ESTOQUES: s(2) }, todos);
  assert.equal(contradiz.score, -1);
  assert.equal(contradiz.detalhe.papelF3, "CONTRADIZ");
  const define = ag.agregarOferta({ CAFE_CLIMA: s(0), CAFE_SAFRA_BRASIL: s(0), CAFE_ESTOQUES: s(2) }, todos);
  assert.equal(define.score, 1);
  assert.equal(define.detalhe.papelF3, "DEFINE");
  // Sem F1 e F2 (sem dado), o F3 ainda define; sem nenhum dos três, a família é ausente.
  const soF3 = ag.agregarOferta({ CAFE_CLIMA: { score: 0, ausente: true }, CAFE_SAFRA_BRASIL: { score: 0, ausente: true }, CAFE_ESTOQUES: s(-2) }, todos);
  assert.deepEqual([soF3.score, soF3.ausente], [-1, false]);
  const nada = ag.agregarOferta({ CAFE_CLIMA: { score: 0, ausente: true }, CAFE_SAFRA_BRASIL: { score: 0, ausente: true }, CAFE_ESTOQUES: { score: 0, ausente: true } }, todos);
  assert.equal(nada.ausente, true);
});

test("dupla contagem: clima, safra e estoques fortes na mesma direção valem UM voto forte (±2), não três", () => {
  const r = ag.agregarCafe(
    com(f("CAFE_CLIMA", "ALTA", "FORTE"), f("CAFE_SAFRA_BRASIL", "ALTA", "FORTE", CONAB_ANTIGA), f("CAFE_ESTOQUES", "ALTA", "FORTE")),
    { dataAnalise: DATA }
  );
  const medio = horizonte(r, "MEDIO");
  assert.equal(familia(medio, "OFERTA").score, 2);
  assert.equal(medio.score, 1); // 50% x 2
  assert.equal(medio.faixa, "ALTA_LEVE");
});

test("Longo: a Oferta é só a safra (F1 e F3 fora do horizonte)", () => {
  const r = ag.agregarCafe(com(f("CAFE_CLIMA", "ALTA", "FORTE"), f("CAFE_ESTOQUES", "ALTA", "FORTE"), f("CAFE_SAFRA_BRASIL", "NEUTRA", null, CONAB_ANTIGA)), {
    dataAnalise: DATA
  });
  const longo = horizonte(r, "LONGO");
  assert.equal(familia(longo, "OFERTA").score, 0);
  assert.deepEqual(familia(longo, "OFERTA").detalhe.membros, ["CAFE_SAFRA_BRASIL"]);
  assert.equal(longo.tendencia, "LATERAL");
  assert.equal(horizonte(r, "MEDIO").tendencia, "ALTA"); // no Médio, os três entram
});

test("Imediato: sem Conab recente, só o Câmbio (100%), faixa até LEVE e confiança BAIXA", () => {
  const r = ag.agregarCafe(com(f("CAFE_DOLAR", "BAIXA", "FORTE"), f("CAFE_SAFRA_BRASIL", "ALTA", "FORTE", CONAB_ANTIGA)), { dataAnalise: DATA });
  const im = horizonte(r, "IMEDIATO");
  assert.equal(familia(im, "OFERTA").ativa, false);
  assert.equal(familia(im, "CAMBIO").pesoEfetivo, 1);
  assert.equal(im.score, -2);
  assert.equal(im.faixa, "BAIXA_LEVE");
  assert.equal(im.confianca, "BAIXA");
});

test("Imediato: com a Conab publicada há até 2 pregões, a Oferta (a safra) entra com 60%", () => {
  // Publicada na quinta (24/09); análise na segunda (28/09): 2 pregões (sex e seg).
  const fatores = com(f("CAFE_DOLAR", "NEUTRA"), f("CAFE_SAFRA_BRASIL", "BAIXA", "FORTE", "2026-09-24T15:00:00Z"));
  const r = ag.agregarCafe(fatores, { dataAnalise: "2026-09-28" });
  assert.equal(r.pregoesDesdeConab, 2);
  const im = horizonte(r, "IMEDIATO");
  assert.equal(familia(im, "OFERTA").ativa, true);
  assert.equal(im.score, -1.2);
  assert.equal(im.faixa, "BAIXA_LEVE");
  // Na terça (3 pregões), a Oferta sai do Imediato.
  assert.equal(familia(horizonte(ag.agregarCafe(fatores, { dataAnalise: "2026-09-29" }), "IMEDIATO"), "OFERTA").ativa, false);
});

test("faixas: |S| < 0,5 LATERAL; até 1,25 LEVE; a partir de 1,25 FORTE", () => {
  // Médio: Oferta 2 (50%) + Demanda 2 (33%) = 1,67 -> FORTE.
  const forte = ag.agregarCafe(com(f("CAFE_SAFRA_BRASIL", "ALTA", "FORTE", CONAB_ANTIGA), f("CAFE_DEMANDA", "ALTA", "FORTE")), { dataAnalise: DATA });
  assert.equal(horizonte(forte, "MEDIO").faixa, "ALTA_FORTE");
  // Médio: só Juros moderado (17%) = 0,17 -> LATERAL.
  const lateral = ag.agregarCafe(com(f("CAFE_JUROS", "BAIXA", "MODERADA")), { dataAnalise: DATA });
  assert.equal(horizonte(lateral, "MEDIO").faixa, "LATERAL");
});

test("cobertura: abaixo de 50% é INSUFICIENTE; abaixo de 80% rebaixa a confiança", () => {
  // Médio sem Oferta (os três sem dado) e sem Demanda: cobertura 17%.
  const sem = ag.agregarCafe(com(f("CAFE_CLIMA", null), f("CAFE_SAFRA_BRASIL", null), f("CAFE_ESTOQUES", null), f("CAFE_DEMANDA", null)), {
    dataAnalise: DATA
  });
  const medio = horizonte(sem, "MEDIO");
  assert.equal(medio.cobertura, 0.1667);
  assert.equal(medio.tendencia, "INSUFICIENTE");
  assert.equal(medio.faixa, null);
  assert.equal(medio.confianca, null);
  // Médio sem Demanda: cobertura 67%, a leitura sai com confiança BAIXA.
  const parcial = ag.agregarCafe(com(f("CAFE_SAFRA_BRASIL", "ALTA", "FORTE", CONAB_ANTIGA), f("CAFE_DEMANDA", null)), { dataAnalise: DATA });
  const m = horizonte(parcial, "MEDIO");
  assert.equal(m.cobertura, 0.6667);
  assert.equal(m.tendencia, "ALTA");
  assert.equal(m.confianca, "BAIXA");
});

test("conflito: as duas maiores contribuições opostas, a menor >= 75% da maior: LATERAL, confiança BAIXA", () => {
  // Médio: Oferta +1 (0,5) contra Demanda -2 (0,67): razão 0,75.
  const r = ag.agregarCafe(com(f("CAFE_SAFRA_BRASIL", "ALTA", "MODERADA", CONAB_ANTIGA), f("CAFE_DEMANDA", "BAIXA", "FORTE")), { dataAnalise: DATA });
  const medio = horizonte(r, "MEDIO");
  assert.deepEqual(medio.conflito.familias, ["DEMANDA", "OFERTA"]);
  assert.equal(medio.tendencia, "LATERAL");
  assert.equal(medio.confianca, "BAIXA");
  // Curto: Oferta -2 (1,2) contra Câmbio +2 (0,8): razão 0,67, sem conflito; BAIXA pela família contra (40%).
  const r2 = ag.agregarCafe(com(f("CAFE_SAFRA_BRASIL", "BAIXA", "FORTE", CONAB_ANTIGA), f("CAFE_DOLAR", "ALTA", "FORTE")), { dataAnalise: DATA });
  const curto = horizonte(r2, "CURTO");
  assert.equal(curto.conflito, null);
  assert.equal(curto.tendencia, "LATERAL"); // -1,2 + 0,8 = -0,4
});

test("confiança: teto MÉDIA (nunca ALTA); família de 25% ou mais contra a direção rebaixa", () => {
  const r = ag.agregarCafe(
    com(f("CAFE_CLIMA", "ALTA", "FORTE"), f("CAFE_SAFRA_BRASIL", "ALTA", "FORTE", CONAB_ANTIGA), f("CAFE_ESTOQUES", "ALTA", "FORTE"), f("CAFE_DEMANDA", "ALTA", "FORTE"), f("CAFE_JUROS", "ALTA", "FORTE")),
    { dataAnalise: DATA }
  );
  assert.equal(horizonte(r, "MEDIO").confianca, "MEDIA");
  assert.equal(horizonte(r, "MEDIO").faixa, "ALTA_FORTE");
  const contra = ag.agregarCafe(com(f("CAFE_SAFRA_BRASIL", "ALTA", "FORTE", CONAB_ANTIGA), f("CAFE_DEMANDA", "BAIXA", "MODERADA")), { dataAnalise: DATA });
  const medio = horizonte(contra, "MEDIO");
  assert.equal(medio.tendencia, "ALTA"); // 1 - 0,33 = 0,67
  assert.equal(medio.confianca, "BAIXA");
  assert.match(medio.motivosConfianca.join(" "), /DEMANDA/);
});

test("F7: sem voto e sem mudar a confiança (ADR 0089, revisão); contra, só informação; a favor, EXCESSO", () => {
  const base = [f("CAFE_SAFRA_BRASIL", "ALTA", "FORTE", CONAB_ANTIGA), f("CAFE_CLIMA", "ALTA", "FORTE")];
  const sem = ag.agregarCafe(com(...base), { dataAnalise: DATA });
  // Comprados em extremo: a leitura de reversão do F7 é BAIXA, contra a ALTA agregada.
  const contra = ag.agregarCafe(com(...base, f("CAFE_FUNDOS", "BAIXA", "FORTE")), { dataAnalise: DATA });
  for (const h of ["CURTO", "MEDIO"]) {
    assert.equal(horizonte(contra, h).score, horizonte(sem, h).score); // não vota
    assert.equal(horizonte(contra, h).fundos.papel, "SEM_PAPEL");
    assert.equal(horizonte(contra, h).fundos.extremoContra, true);
    assert.equal(horizonte(contra, h).confianca, horizonte(sem, h).confianca);
  }
  // Nem com o F1 na direção do F7 (o catalisador da v2) a confiança muda.
  const comF1 = [f("CAFE_SAFRA_BRASIL", "ALTA", "FORTE", CONAB_ANTIGA), f("CAFE_CLIMA", "BAIXA", "MODERADA"), f("CAFE_ESTOQUES", "ALTA", "FORTE"), f("CAFE_DOLAR", "ALTA", "FORTE"), f("CAFE_DEMANDA", "ALTA", "FORTE"), f("CAFE_JUROS", "ALTA", "FORTE")];
  assert.equal(
    horizonte(ag.agregarCafe(com(...comF1, f("CAFE_FUNDOS", "BAIXA", "FORTE")), { dataAnalise: DATA }), "CURTO").confianca,
    horizonte(ag.agregarCafe(com(...comF1), { dataAnalise: DATA }), "CURTO").confianca
  );
  assert.equal(horizonte(contra, "LONGO").fundos.papel, "SEM_PAPEL"); // fora do horizonte do F7
  const favor = ag.agregarCafe(com(...base, f("CAFE_FUNDOS", "ALTA", "FORTE")), { dataAnalise: DATA });
  assert.equal(horizonte(favor, "CURTO").fundos.papel, "EXCESSO");
  assert.equal(horizonte(favor, "CURTO").confianca, horizonte(sem, "CURTO").confianca);
  // Fora do extremo (moderada): sem papel.
  const moderado = ag.agregarCafe(com(...base, f("CAFE_FUNDOS", "BAIXA", "MODERADA")), { dataAnalise: DATA });
  assert.equal(horizonte(moderado, "CURTO").fundos.papel, "SEM_PAPEL");
});

test("F5 (custos) nunca entra no score, em nenhum horizonte", () => {
  const r = ag.agregarCafe(com(f("CAFE_CUSTO_PRECO_MINIMO", "ALTA", "FORTE")), { dataAnalise: DATA });
  for (const hz of r.horizontes) {
    assert.equal(hz.score, 0);
    assert.equal(hz.familias.some((x) => x.codigo === "CUSTOS"), false);
  }
});

test("pregões desde a publicação: só de segunda a sexta; a publicação no próprio dia conta 0", () => {
  assert.equal(ag.pregoesDesde("2026-10-02", "2026-10-02"), 0);
  assert.equal(ag.pregoesDesde("2026-10-02", "2026-10-05"), 1); // sexta -> segunda
  assert.equal(ag.pregoesDesde("2026-10-02", "2026-10-07"), 3);
  assert.equal(ag.pregoesDesde(null, "2026-10-07"), null);
});
