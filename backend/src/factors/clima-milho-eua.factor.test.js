"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, PARAMETROS_PADRAO, METODOLOGIA, decidirClima, derivarClimaMilho } = require("./clima-milho-eua.factor");
const { montarTextoPrompt } = require("./base/texto-prompt");

test("R-CLI v0: 5 p.p. abaixo da média ou queda de 3 p.p. na semana é alta; as duas, forte", () => {
  const p = PARAMETROS_PADRAO;
  const soNivel = decidirClima({ mes: 7, desvioPp: -5, variacaoSemanalPp: 0 }, p);
  assert.deepEqual([soNivel.direcao, soNivel.intensidade], ["ALTA", "MODERADA"]);
  assert.equal(decidirClima({ mes: 7, desvioPp: -4.9, variacaoSemanalPp: -2.9 }, p).direcao, "NEUTRA");
  assert.equal(decidirClima({ mes: 6, desvioPp: 0, variacaoSemanalPp: -3 }, p).direcao, "ALTA");
  assert.equal(decidirClima({ mes: 7, desvioPp: -6, variacaoSemanalPp: -3 }, p).intensidade, "FORTE");
});

test("R-CLI v0: 3 p.p. acima da média por 3 semanas seguidas é baixa; forte com a polinização concluída", () => {
  const p = PARAMETROS_PADRAO;
  assert.equal(decidirClima({ mes: 8, desvioPp: 3, variacaoSemanalPp: 0, desviosAnteriores: [4, 2.9] }, p).direcao, "NEUTRA");
  assert.equal(decidirClima({ mes: 8, desvioPp: 3, variacaoSemanalPp: 0, desviosAnteriores: [4, 3] }, p).intensidade, "MODERADA");
  assert.equal(
    decidirClima({ mes: 8, desvioPp: 3, variacaoSemanalPp: 0, desviosAnteriores: [4, 3], polinizacaoConcluida: true }, p).intensidade,
    "FORTE"
  );
  // Acima da média há 3 semanas, mas caindo 3 p.p. agora: as duas regras ao mesmo tempo, neutra.
  const conflito = decidirClima({ mes: 7, desvioPp: 4, variacaoSemanalPp: -3, desviosAnteriores: [7, 6] }, p);
  assert.deepEqual([conflito.direcao, conflito.conflito], ["NEUTRA", true]);
});

test("fora de junho a agosto a regra não vale: neutra, marcada", () => {
  const d = decidirClima({ mes: 9, desvioPp: -10, variacaoSemanalPp: -5 }, PARAMETROS_PADRAO);
  assert.deepEqual([d.direcao, d.foraDaJanela], ["NEUTRA", true]);
  assert.equal(decidirClima({ mes: 7, desvioPp: null }, PARAMETROS_PADRAO), null);
});

test("um ponto por semana: boa + excelente, a média da mesma semana em 5 anos, o desvio e o peso do mês", () => {
  const linhas = [];
  // A mesma semana (52 semanas antes) de 2021 a 2025, com 60% de boa + excelente; em 2026, 52%.
  for (let k = 0; k <= 5; k += 1) {
    const d = new Date(Date.UTC(2026, 6, 19 - 364 * k)).toISOString().slice(0, 10);
    const ge = k === 0 ? 52 : 60;
    const base = { observedAt: d, publishedAt: new Date(`${d}T20:00:00Z`), publishedAtIsEstimated: false };
    linhas.push({ ...base, seriesCode: SERIES.boa, value: ge - 10 }, { ...base, seriesCode: SERIES.excelente, value: 10 });
  }
  const ponto = derivarClimaMilho(linhas).at(-1);
  assert.equal(ponto.observedAt, "2026-07-19");
  assert.equal(ponto.boaExcelentePct, 52);
  assert.equal(ponto.media5AnosPct, 60);
  assert.equal(ponto.desvioPp, -8);
  assert.equal(ponto.pesoDoMes, "Alto");
  assert.equal(ponto.decisao.direcao, "ALTA");
});

test("condição do CPC (ADR 0068): a alta pede a previsão adversa; a baixa, que ela não exista; sem previsão, não se aplica", () => {
  const p = PARAMETROS_PADRAO;
  const alta = { mes: 7, desvioPp: -6, variacaoSemanalPp: 0 };
  assert.equal(decidirClima({ ...alta, previsaoAdversa: true }, p).direcao, "ALTA");
  const naoConfirmada = decidirClima({ ...alta, previsaoAdversa: false }, p);
  assert.deepEqual([naoConfirmada.direcao, naoConfirmada.altaNaoConfirmada], ["NEUTRA", true]);
  assert.equal(decidirClima({ ...alta, previsaoAdversa: null }, p).direcao, "ALTA");

  const baixa = { mes: 8, desvioPp: 4, variacaoSemanalPp: 0, desviosAnteriores: [4, 4] };
  assert.equal(decidirClima({ ...baixa, previsaoAdversa: false }, p).direcao, "BAIXA");
  const bloqueada = decidirClima({ ...baixa, previsaoAdversa: true }, p);
  assert.deepEqual([bloqueada.direcao, bloqueada.baixaBloqueada], ["NEUTRA", true]);
});

// Duas semanas do Crop Progress (domingo; publicadas na segunda, 20h UTC) com a mesma semana de 5 anos antes, e as
// emissões do CPC (`estados`: { EUA_IA: [temp, prcp], ... }).
function linhasComCpc(emissoes) {
  const linhas = [];
  for (const fim of ["2026-07-12", "2026-07-19"]) {
    for (let k = 0; k <= 5; k += 1) {
      const d = new Date(Date.parse(`${fim}T00:00:00Z`) - 364 * k * 86400000).toISOString().slice(0, 10);
      const publicado = new Date(Date.parse(`${d}T20:00:00Z`) + 86400000);
      const base = { observedAt: d, publishedAt: publicado, publishedAtIsEstimated: false };
      linhas.push({ ...base, seriesCode: SERIES.boa, value: k === 0 ? 42 : 50 }, { ...base, seriesCode: SERIES.excelente, value: 10 });
    }
  }
  for (const [data, estados] of Object.entries(emissoes)) {
    const base = { observedAt: data, publishedAt: new Date(`${data}T23:59:59Z`), publishedAtIsEstimated: true };
    for (const [estado, [temp, prcp]] of Object.entries(estados)) {
      linhas.push({ ...base, seriesCode: `NOAA_CPC.${estado}.TEMP_8_14`, value: temp }, { ...base, seriesCode: `NOAA_CPC.${estado}.PRCP_8_14`, value: prcp });
    }
  }
  return linhas;
}

const ADVERSA_EM_3 = { EUA_IA: [40, -33], EUA_IL: [33, -40], EUA_NE: [50, -33], EUA_MN: [0, 0], EUA_IN: [33, 0] };
const ADVERSA_EM_1 = { EUA_IA: [40, -33], EUA_IL: [0, 0], EUA_NE: [0, 0], EUA_MN: [0, 0], EUA_IN: [33, 0] };

test("a semana usa a emissão mais recente antes de a semana seguinte sair; a última, a mais recente de todas", () => {
  // A semana de 12/07 fica com a emissão de 12/07: a de 20/07 é publicada (fim do dia) depois de a semana de 19/07 sair
  // (20/07, 20h). A semana de 19/07, a última, fica com a mais recente (22/07).
  const pontos = derivarClimaMilho(linhasComCpc({ "2026-07-08": ADVERSA_EM_1, "2026-07-12": ADVERSA_EM_3, "2026-07-20": ADVERSA_EM_3, "2026-07-22": ADVERSA_EM_1 }));
  const [semana12, semana19] = pontos.slice(-2);
  assert.equal(semana12.cpcEmissao, "12/07/2026");
  assert.equal(semana12.cpcEstadosAdversos, 3);
  assert.equal(semana12.decisao.direcao, "ALTA");
  assert.equal(semana19.cpcEmissao, "22/07/2026");
  assert.deepEqual([semana19.cpcEstadosAdversos, semana19.cpcEstadosComPrevisao], [1, 5]);
  assert.deepEqual([semana19.decisao.direcao, semana19.decisao.altaNaoConfirmada], ["NEUTRA", true]);
  assert.match(semana19.cpcPorEstado, /^Emitida em 22\/07\/2026: Iowa: temperatura acima \(40%\), chuva abaixo \(33%\); Illinois: temperatura chances iguais/);
});

test("sem emissão do CPC na semana (antes da coleta ou velha), a condição não é aplicada e o passo diz isso", () => {
  const pontos = derivarClimaMilho(linhasComCpc({ "2026-07-01": ADVERSA_EM_1 }));
  const ultimo = pontos.at(-1);
  assert.equal(ultimo.cpcEstadosAdversos, null);
  assert.equal(ultimo.decisao.previsaoAdversa, null);
  assert.equal(ultimo.decisao.direcao, "ALTA");
  assert.ok(METODOLOGIA.explicar(ultimo).some((passo) => /sem previsão para esta semana .* não é aplicada/.test(passo)));
});

test("o texto do prompt traz a regra com a condição do CPC e a previsão por estado", () => {
  const ponto = derivarClimaMilho(linhasComCpc({ "2026-07-20": ADVERSA_EM_3 })).at(-1);
  const texto = montarTextoPrompt({
    ativo: "MILHO",
    fator: { codigo: "MILHO_CLIMA_SAFRA_EUA", nome: "Clima", peso: "Alto", proposta: { situacao: "PROPOSTA" } },
    calculo: { apresentacao: METODOLOGIA.apresentacao, periodicidade: "SEMANAL", parametros: PARAMETROS_PADRAO, factorId: METODOLOGIA.factorId, factorVersion: 2 },
    ponto
  });
  assert.match(texto, /só de junho a agosto .* 5,0 p\.p\. ou mais abaixo .* por 3 semanas seguidas/);
  assert.match(texto, /chuva abaixo do normal em 3 ou mais dos 5 estados do Corn Belt: a alta só vale com ela e a baixa só sem ela/);
  assert.match(texto, /estados com calor acima e chuva abaixo do normal: 3 \(de 5 estados\)\n {2}Emitida em 20\/07\/2026: Iowa: temperatura acima \(40%\)/);
});
