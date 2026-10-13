"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { acaoDeterministica, intencoesDeterministicas } = require("./regras-deterministicas");
const { validarIntencao } = require("./intencao");

const leituras = (curto, medio, confianca = "MEDIA", faixa = null) => [
  { horizonte: "CURTO", tendencia: curto, confianca: "MEDIA" },
  { horizonte: "MEDIO", tendencia: medio, confianca, faixa: faixa ?? (medio === "LATERAL" ? "LATERAL" : `${medio}_LEVE`) }
];
const COMPRADO = { lado: "COMPRADO", reduzida: false };

test("sem posição: entra a favor do MEDIO firme, sem o CURTO contra", () => {
  assert.equal(acaoDeterministica(leituras("LATERAL", "ALTA"), null).acao, "ENTRAR_COMPRADO");
  assert.equal(acaoDeterministica(leituras("BAIXA", "BAIXA", "ALTA"), null).acao, "ENTRAR_VENDIDO");
  assert.equal(acaoDeterministica(leituras("BAIXA", "ALTA"), null).acao, "NAO_ENTRAR");
  assert.equal(acaoDeterministica(leituras("ALTA", "ALTA", "BAIXA"), null).acao, "NAO_ENTRAR");
  assert.equal(acaoDeterministica(leituras("ALTA", "LATERAL"), null).acao, "NAO_ENTRAR");
});

test("com posição: zera na inversão, reduz uma vez quando enfraquece, senão mantém", () => {
  assert.equal(acaoDeterministica(leituras("LATERAL", "BAIXA", "BAIXA"), COMPRADO).acao, "ZERAR");
  assert.equal(acaoDeterministica(leituras("LATERAL", "LATERAL"), COMPRADO).acao, "REDUZIR");
  assert.equal(acaoDeterministica(leituras("LATERAL", "ALTA", "BAIXA"), COMPRADO).acao, "REDUZIR");
  assert.equal(acaoDeterministica(leituras("LATERAL", "LATERAL"), { ...COMPRADO, reduzida: true }).acao, "MANTER");
  assert.equal(acaoDeterministica(leituras("BAIXA", "ALTA"), COMPRADO).acao, "MANTER");
  assert.equal(acaoDeterministica(leituras("LATERAL", "ALTA"), { lado: "VENDIDO", reduzida: false }).acao, "ZERAR");
});

test("sem leitura: não entra, ou mantém", () => {
  assert.deepEqual(acaoDeterministica(null, null), { acao: "NAO_ENTRAR", motivo: "SEM_LEITURA" });
  assert.deepEqual(acaoDeterministica(null, COMPRADO), { acao: "MANTER", motivo: "SEM_LEITURA" });
});

test("intenções do dia: prioridade pela confiança, faixa forte e ordem; todas válidas no contrato", () => {
  const intencoes = intencoesDeterministicas({
    ativos: ["MILHO", "CAFE", "SOJA"],
    leiturasPorAtivo: {
      MILHO: leituras("LATERAL", "ALTA", "MEDIA"),
      CAFE: leituras("LATERAL", "BAIXA", "MEDIA", "BAIXA_FORTE"),
      SOJA: leituras("BAIXA", "BAIXA", "ALTA")
    },
    posicoes: { MILHO: COMPRADO }
  });
  assert.deepEqual(intencoes.map((i) => [i.ativo, i.acao, i.prioridade]), [
    ["MILHO", "MANTER", 3],
    ["CAFE", "ENTRAR_VENDIDO", 2],
    ["SOJA", "ENTRAR_VENDIDO", 1]
  ]);
  for (const i of intencoes) assert.deepEqual(validarIntencao(i, { comPosicao: i.ativo === "MILHO" }), []);
  assert.equal(intencoes[0].referencia.versaoRegra, 1);
});
