"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { CHECKLIST, montarChecklist, validarMovimentoDeStop, aplicarMovimentosDeStop, faseDaOperacao } = require("./diario");

const TODAS_OK = [
  { codigo: "STOP_DO_LADO", ok: true },
  { codigo: "PISO_ATR", ok: true },
  { codigo: "RR_MINIMO", ok: true },
  { codigo: "QUANTIDADE", ok: true }
];
const MANUAIS = Object.fromEntries(CHECKLIST.filter((i) => !i.automatico).map((i) => [i.codigo, true]));

test("checklist: os 8 itens da Cartilha, os automáticos pelas verificações; aderente só com todos", () => {
  assert.equal(CHECKLIST.length, 8);
  const tudo = montarChecklist(MANUAIS, TODAS_OK);
  assert.deepEqual([tudo.aderente, tudo.erros], [true, []]);
  // Marcar um automático à mão não vale: quem decide é a verificação.
  const semPiso = montarChecklist({ ...MANUAIS, STOP_PISO: true }, TODAS_OK.map((v) => (v.codigo === "PISO_ATR" ? { ...v, ok: false } : v)));
  assert.deepEqual([semPiso.itens.STOP_PISO, semPiso.aderente], [false, false]);
  const semSmc = montarChecklist({ ...MANUAIS, ESTRUTURA_SMC: false }, TODAS_OK);
  assert.deepEqual([semSmc.itens.ESTRUTURA_SMC, semSmc.aderente, semSmc.erros], [false, false, []]);
  assert.equal(montarChecklist(null, TODAS_OK).aderente, false);
});

test("checklist: item desconhecido e formato errado são erros", () => {
  assert.match(montarChecklist({ OUTRO: true }, TODAS_OK).erros[0], /desconhecido/);
  assert.match(montarChecklist([true], TODAS_OK).erros[0], /objeto/);
});

test("stop movido: só a favor e ainda do lado da perda em relação ao último ajuste", () => {
  const comprado = { lado: "COMPRADO", stopVigente: 60, ultimoAjuste: 70 };
  assert.deepEqual(validarMovimentoDeStop({ ...comprado, novo: 65 }), []);
  assert.match(validarMovimentoDeStop({ ...comprado, novo: 58 })[0], /a favor/);
  assert.match(validarMovimentoDeStop({ ...comprado, novo: 71 })[0], /último ajuste/);
  const vendido = { lado: "VENDIDO", stopVigente: 80, ultimoAjuste: 70 };
  assert.deepEqual(validarMovimentoDeStop({ ...vendido, novo: 75 }), []);
  assert.match(validarMovimentoDeStop({ ...vendido, novo: 82 })[0], /a favor/);
  assert.match(validarMovimentoDeStop({ ...comprado, novo: "x" })[0], /número/);
});

test("movimentos de stop: o mais recente em vigor na data, nunca contra a posição", () => {
  const posicoes = [
    { id: "p1", lado: "COMPRADO", stop: 60 },
    { id: "p2", lado: "VENDIDO", stop: 80 },
    { id: "p3", lado: "COMPRADO", stop: 100 }
  ];
  const movimentos = [
    { posicaoId: "p1", stop: 62, vigenteDesde: "2026-10-15", registradoEm: "2026-10-14T13:00:00Z" },
    { posicaoId: "p1", stop: 64, vigenteDesde: "2026-10-15", registradoEm: "2026-10-14T15:00:00Z" },
    { posicaoId: "p1", stop: 66, vigenteDesde: "2026-10-16", registradoEm: "2026-10-15T15:00:00Z" },
    { posicaoId: "p2", stop: 75, vigenteDesde: "2026-10-15", registradoEm: "2026-10-14T13:00:00Z" },
    // O alvo 1 já levou o stop à entrada (100): um movimento antigo, abaixo dela, não o traz de volta.
    { posicaoId: "p3", stop: 95, vigenteDesde: "2026-10-15", registradoEm: "2026-10-14T13:00:00Z" }
  ];
  assert.deepEqual(aplicarMovimentosDeStop(posicoes, movimentos, "2026-10-14").map((p) => p.stop), [60, 80, 100]);
  assert.deepEqual(aplicarMovimentosDeStop(posicoes, movimentos, "2026-10-15").map((p) => p.stop), [64, 75, 100]);
  assert.deepEqual(aplicarMovimentosDeStop(posicoes, movimentos, "2026-10-16").map((p) => p.stop), [66, 75, 100]);
});

test("a fase da operação: planejada, aberta, em gestão, encerrada, cancelada", () => {
  assert.equal(faseDaOperacao({ ordem: { situacao: "CRIADA" } }), "PLANEJADA");
  assert.equal(faseDaOperacao({ ordem: { situacao: "CANCELADA" } }), "CANCELADA");
  assert.equal(faseDaOperacao({ ordem: { situacao: "REJEITADA" } }), "NAO_EXECUTADA");
  const aberta = { situacao: "ABERTA", alvo1Atingido: false, reduzida: false };
  assert.equal(faseDaOperacao({ posicao: aberta }), "ABERTA");
  assert.equal(faseDaOperacao({ posicao: { ...aberta, alvo1Atingido: true } }), "EM_GESTAO");
  assert.equal(faseDaOperacao({ posicao: aberta, eventos: [{ tipo: "STOP_MOVIDO" }] }), "EM_GESTAO");
  assert.equal(faseDaOperacao({ posicao: { ...aberta, situacao: "ENCERRADA" } }), "ENCERRADA");
});
