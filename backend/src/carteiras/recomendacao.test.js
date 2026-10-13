"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const r = require("./recomendacao");
const { validarIntencao } = require("./intencao");

const LEITURAS = {
  MILHO: [
    { horizonte: "IMEDIATO", tendencia: "BAIXA", confianca: "BAIXA" },
    { horizonte: "CURTO", tendencia: "LATERAL", confianca: "MEDIA", tese: "Lateral." },
    { horizonte: "MEDIO", tendencia: "ALTA", faixa: "ALTA_LEVE", confianca: "MEDIA", tese: "Alta.", invalidaSe: "Se cair." },
    { horizonte: "LONGO", tendencia: "ALTA", confianca: "BAIXA" }
  ],
  CAFE: [{ horizonte: "MEDIO", tendencia: "BAIXA", confianca: "ALTA" }],
  SOJA: null
};

const entrada = () =>
  r.montarEntrada({ data: "2026-10-14", ativos: ["MILHO", "CAFE", "SOJA"], leiturasPorAtivo: LEITURAS, eventosPorAtivo: { MILHO: [{ data: "2026-10-13", titulo: "Geada", pressao: "ALTA" }] } });

const item = (ativo, prioridade, semPosicao = "NAO_ENTRAR", extra = {}) => ({
  ativo,
  prioridade,
  semPosicao: { acao: semPosicao, porque: "Porque sim." },
  comprado: { acao: "MANTER", porque: "Segue." },
  vendido: { acao: "ZERAR", porque: "Contra." },
  evidencias: [`${ativo}.MEDIO`],
  invalidaSe: "Se o MEDIO virar.",
  ...extra
});

test("o modelo fixado recusa alias", () => {
  assert.equal(r.modeloFixadoValido("gemini-3.8-flash"), true);
  assert.equal(r.modeloFixadoValido("gemini-flash-latest"), false);
  assert.equal(r.modeloFixadoValido(""), false);
  assert.equal(r.modeloFixadoValido(null), false);
});

test("entrada: só CURTO, MEDIO e LONGO, com ids; ativo sem leitura fica fora; nenhum estado de trilha", () => {
  const e = entrada();
  assert.deepEqual(e.ativos.map((a) => a.ativo), ["MILHO", "CAFE"]);
  assert.deepEqual(e.semLeitura, ["SOJA"]);
  assert.deepEqual(e.ativos[0].leituras.map((l) => l.id), ["MILHO.CURTO", "MILHO.MEDIO", "MILHO.LONGO"]);
  assert.equal(e.ativos[0].eventos[0].id, "MILHO.EV1");
  const texto = r.textoDaEntrada(e);
  assert.match(texto, /\[MILHO\.MEDIO\] MEDIO: tendência ALTA \(ALTA_LEVE\), confiança MEDIA/);
  assert.match(texto, /\[MILHO\.EV1\] 2026-10-13: Geada \(pressão ALTA\)/);
  assert.doesNotMatch(texto, /IMEDIATO/);
});

test("validação: uma resposta correta passa, em ordem de prioridade", () => {
  const texto = JSON.stringify({ recomendacoes: [item("CAFE", 2), item("MILHO", 1, "ENTRAR_COMPRADO", { evidencias: ["MILHO.MEDIO", "MILHO.EV1"] })] });
  const { recomendacoes, erros } = r.validarRecomendacao(texto, entrada());
  assert.deepEqual(erros, []);
  assert.deepEqual(recomendacoes.map((x) => x.ativo), ["MILHO", "CAFE"]);
});

test("validação: recusa preço, ação fora do ramo, evidência inventada, ativo faltando e prioridade repetida", () => {
  const casos = [
    [{ recomendacoes: [item("MILHO", 1, "NAO_ENTRAR", { stop: 70 }), item("CAFE", 2)] }, /"stop" não é permitido/],
    [{ recomendacoes: [item("MILHO", 1, "MANTER"), item("CAFE", 2)] }, /semPosicao: ação "MANTER"/],
    [{ recomendacoes: [item("MILHO", 1, "NAO_ENTRAR", { evidencias: ["E1"] }), item("CAFE", 2)] }, /não estão na entrada: E1/],
    [{ recomendacoes: [item("MILHO", 1)] }, /Faltam os ativos: CAFE/],
    [{ recomendacoes: [item("MILHO", 1), item("CAFE", 1)] }, /de 1 a 2/],
    [{ recomendacoes: [item("MILHO", 1), item("CAFE", 2), item("SOJA", 3)] }, /"SOJA" não está na entrada/],
    [{ recomendacoes: [item("MILHO", 1, "NAO_ENTRAR", { invalidaSe: " " }), item("CAFE", 2)] }, /invalidaSe/],
    [{ recomendacoes: [], extra: 1 }, /Campos desconhecidos na raiz/]
  ];
  for (const [json, padrao] of casos) {
    const { recomendacoes, erros } = r.validarRecomendacao(JSON.stringify(json), entrada());
    assert.equal(recomendacoes, null);
    assert.ok(erros.some((e) => padrao.test(e)), `${padrao} em ${erros.join(" | ")}`);
  }
  const ramo = item("MILHO", 1);
  ramo.comprado.precoAlvo = 80;
  assert.ok(r.validarRecomendacao(JSON.stringify({ recomendacoes: [ramo, item("CAFE", 2)] }), entrada()).erros.some((e) => /precoAlvo/.test(e)));
  assert.deepEqual(r.validarRecomendacao("não é json", entrada()).erros, ["A resposta não é um JSON válido."]);
});

test("contrárias à leitura: marcadas por ramo, contra o MEDIO", () => {
  const recs = [item("MILHO", 1, "ENTRAR_VENDIDO", { vendido: { acao: "MANTER", porque: "x" } }), item("CAFE", 2, "ENTRAR_VENDIDO")];
  assert.deepEqual(r.contrariasALeitura(recs, entrada()), { MILHO: ["semPosicao", "vendido"], CAFE: ["comprado"] });
});

test("intenções da IA: o ramo do estado de cada ativo; sem leitura, não entrar ou manter; sem recomendação, fallback", () => {
  const recs = [item("MILHO", 1, "ENTRAR_COMPRADO"), item("CAFE", 2)];
  const posicoes = { CAFE: { lado: "VENDIDO" }, SOJA: { lado: "COMPRADO" } };
  const intencoes = r.intencoesDaIa({ ativos: ["MILHO", "CAFE", "SOJA"], recomendacoes: recs, posicoes, contrarias: { MILHO: ["semPosicao"] } });
  assert.deepEqual(intencoes.map((i) => [i.ativo, i.acao, i.prioridade, i.origem]), [
    ["MILHO", "ENTRAR_COMPRADO", 1, "RECOMENDACAO"],
    ["CAFE", "ZERAR", 2, "RECOMENDACAO"],
    ["SOJA", "MANTER", 3, "FALLBACK"]
  ]);
  assert.deepEqual(intencoes[0].referencia, { ramo: "semPosicao", contraria: true });
  for (const i of intencoes) assert.deepEqual(validarIntencao(i, { comPosicao: Boolean(posicoes[i.ativo]) }), []);

  const fallback = r.intencoesDaIa({ ativos: ["MILHO", "CAFE"], recomendacoes: null, posicoes });
  assert.deepEqual(fallback.map((i) => [i.acao, i.origem, i.referencia.motivo]), [["NAO_ENTRAR", "FALLBACK", "SEM_RECOMENDACAO"], ["MANTER", "FALLBACK", "SEM_RECOMENDACAO"]]);
});

test("uso e custo: soma de todas as chamadas; raciocínio cobrado como saída; sem preço, custo nulo", () => {
  const tokens = r.somarUso([{ promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 300, totalTokenCount: 1500 }, null, { promptTokenCount: 1000, totalTokenCount: 1000 }]);
  assert.deepEqual(tokens, { entrada: 2000, saida: 200, raciocinio: 300, total: 2500 });
  assert.equal(r.custoUsd(tokens, { precoEntrada: 0.5, precoSaida: 3 }), 0.0025);
  assert.equal(r.custoUsd(tokens, {}), null);
});
