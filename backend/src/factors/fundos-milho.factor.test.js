"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, PARAMETROS_PADRAO, METODOLOGIA, derivarFundosMilho } = require("./fundos-milho.factor");

// `semanas` terças seguidas a partir de 2016-01-05, com a posição líquida em % dos contratos em aberto dada por `pct(i)`.
function historico(semanas, pct) {
  const linhas = [];
  for (let i = 0; i < semanas; i += 1) {
    const d = new Date(Date.UTC(2016, 0, 5 + 7 * i)).toISOString().slice(0, 10);
    const publishedAt = new Date(`${d}T23:59:59Z`);
    const base = { observedAt: d, publishedAt, publishedAtIsEstimated: false };
    linhas.push(
      { ...base, seriesCode: SERIES.comprados, value: 1000 + pct(i) * 10 },
      { ...base, seriesCode: SERIES.vendidos, value: 1000 },
      { ...base, seriesCode: SERIES.contratosEmAberto, value: 1000 }
    );
  }
  return linhas;
}

test("a janela é de 10 anos: sem ~500 semanas anteriores, não há percentil nem leitura", () => {
  const pontos = derivarFundosMilho(historico(400, (i) => i % 50));
  assert.ok(pontos.every((p) => p.percentilJanela === null && p.decisao === null));
  assert.match(METODOLOGIA.apresentacao.quadros.find((q) => q.campo === "percentilJanela").rotulo, /10 anos/);
});

test("reversão: fundos no topo dos 10 anos pressionam para baixo; no fundo, para alta; o meio é neutro", () => {
  // Uma posição que oscila de 0% a 49% por 600 semanas e termina no máximo, no mínimo ou no meio.
  const ciclo = (i) => i % 50;
  const ultimo = (fim) => derivarFundosMilho(historico(601, (i) => (i === 600 ? fim : ciclo(i)))).at(-1);
  assert.equal(ultimo(60).decisao.direcao, "BAIXA");
  assert.equal(ultimo(60).decisao.intensidade, "FORTE");
  assert.equal(ultimo(-10).decisao.direcao, "ALTA");
  assert.equal(ultimo(25).decisao.direcao, "NEUTRA");
  assert.equal(PARAMETROS_PADRAO.limiarModeradoPct, 40);
});
