"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, PARAMETROS_PADRAO, METODOLOGIA, percentil, decidirEstoques, derivarEstoquesMilho } = require("./estoques-milho-wasde.factor");
const { montarTextoPrompt } = require("./base/texto-prompt");

const linha = (seriesCode, observedAt, value, edicao) => ({
  seriesCode,
  observedAt,
  value,
  publishedAt: new Date(`${edicao}T23:59:59.999Z`),
  publishedAtIsEstimated: false
});

// Uma edição com as safras 2015/16 a 2025/26 dos EUA: estoque/uso de 10% a 20% (sobe 1 p.p. por safra) e, na safra
// mais nova, `estoque` ÷ 1.000.
function edicaoCompleta(edicao, estoqueNova) {
  const linhas = [];
  for (let ano = 2015; ano <= 2024; ano += 1) {
    linhas.push(linha(SERIES.euaEstoque, `${ano}-09-01`, 100 + (ano - 2015) * 10, edicao), linha(SERIES.euaUso, `${ano}-09-01`, 1000, edicao));
  }
  linhas.push(linha(SERIES.euaEstoque, "2025-09-01", estoqueNova, edicao), linha(SERIES.euaUso, "2025-09-01", 1000, edicao));
  return linhas;
}

test("percentil: a posição entre as safras anteriores, com meio peso para empate (5 a 95 com 10 safras)", () => {
  const dez = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentil(0, dez), 0);
  assert.equal(percentil(1, dez), 5);
  assert.equal(percentil(5.5, dez), 50);
  assert.equal(percentil(11, dez), 100);
});

test("camada C: o nível pela faixa, a revisão como 2ª condição; juntos é forte, opostos é neutra", () => {
  const p = PARAMETROS_PADRAO;
  assert.deepEqual(
    [decidirEstoques(-35, null, 0, p).direcao, decidirEstoques(-35, null, 0, p).intensidade],
    ["ALTA", "MODERADA"]
  );
  assert.deepEqual([decidirEstoques(35, null, null, p).direcao], ["BAIXA"]);
  // Só a revisão (posição neutra): de 3% para baixo é alta, moderada.
  const soRevisao = decidirEstoques(5, null, -3, p);
  assert.deepEqual([soRevisao.direcao, soRevisao.intensidade, soRevisao.porNivel, soRevisao.porRevisao], ["ALTA", "MODERADA", "NEUTRA", "ALTA"]);
  assert.equal(decidirEstoques(5, null, -2.99, p).direcao, "NEUTRA");
  // Os dois no mesmo sentido: forte.
  assert.equal(decidirEstoques(-35, null, -4, p).intensidade, "FORTE");
  // Opostos: neutra, marcada como conflito.
  const oposto = decidirEstoques(35, null, -4, p);
  assert.deepEqual([oposto.direcao, oposto.conflito], ["NEUTRA", true]);
  // P10 ou abaixo (posição -40) já é forte pelo nível.
  assert.equal(decidirEstoques(-45, null, 0, p).intensidade, "FORTE");
  assert.equal(decidirEstoques(null, null, -5, p), null);
});

test("um ponto por edição: o estoque/uso da safra mais nova, o percentil das 10 anteriores e a revisão contra a edição anterior", () => {
  const linhas = [
    ...edicaoCompleta("2025-08-12", 95),
    // A 2ª edição só revisa a safra nova (a observation só grava o que muda).
    linha(SERIES.euaEstoque, "2025-09-01", 90, "2025-09-12")
  ];
  const [primeira, segunda] = derivarEstoquesMilho(linhas);
  assert.equal(primeira.observedAt, "2025-08-12");
  assert.equal(primeira.safra, "2025/26");
  assert.equal(primeira.estoqueUsoEuaPct, 9.5);
  assert.equal(primeira.percentilEua, 0);
  assert.equal(primeira.posicaoEua, -50);
  assert.equal(primeira.revisaoEstoqueEuaPct, null);
  assert.equal(primeira.decisao.direcao, "ALTA");
  assert.equal(segunda.observedAt, "2025-09-12");
  assert.equal(segunda.revisaoEstoqueEuaPct, -5.26);
  assert.equal(segunda.decisao.intensidade, "FORTE");
  // Sem as séries do mundo, o contexto fica vazio (não é erro).
  assert.equal(segunda.estoqueUsoExChinaPct, null);
});

test("a 1ª edição de uma safra nova não tem revisão; sem 10 safras anteriores, não há percentil nem leitura", () => {
  const linhas = [
    ...edicaoCompleta("2025-04-10", 150),
    linha(SERIES.euaEstoque, "2026-09-01", 120, "2025-05-12"),
    linha(SERIES.euaUso, "2026-09-01", 1000, "2025-05-12")
  ];
  const pontos = derivarEstoquesMilho(linhas);
  const nova = pontos.at(-1);
  assert.equal(nova.safra, "2026/27");
  assert.equal(nova.revisaoEstoqueEuaPct, null);
  // 12% contra as 10 safras anteriores (2016/17 a 2025/26: 11% a 19% e os 15% da 2025/26): uma abaixo, uma igual.
  assert.equal(nova.percentilEua, 15);

  const curta = derivarEstoquesMilho(edicaoCompleta("2025-04-10", 150).filter((l) => l.observedAt !== "2015-09-01"));
  assert.equal(curta[0].percentilEua, null);
  assert.equal(curta[0].decisao, null);
});

test("o texto do prompt traz a 2ª condição da regra com o limiar em uso", () => {
  const [ponto] = derivarEstoquesMilho(edicaoCompleta("2025-08-12", 95));
  const texto = montarTextoPrompt({
    ativo: "MILHO",
    fator: { codigo: "MILHO_ESTOQUES_WASDE", nome: "Estoques", peso: "Alto", proposta: { situacao: "PROPOSTA" } },
    calculo: { apresentacao: METODOLOGIA.apresentacao, periodicidade: "MENSAL", parametros: { ...PARAMETROS_PADRAO, limiarRevisaoPct: 4 }, factorId: METODOLOGIA.factorId, factorVersion: 1 },
    ponto
  });
  assert.match(texto, /revisão do estoque final dos EUA contra a edição anterior, de 4,0% ou mais/);
  assert.match(texto, /Mês de 08\/2025/);
});
