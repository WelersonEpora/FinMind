"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decidirOpep, derivarOpep, PARAMETROS_PADRAO, CASO } = require("./opep-petroleo.factor");

test("camada C: corte pesa para alta, aumento para baixa; interrupção, expansão e neutro sem pressão", () => {
  const caso = (crescimento, variacaoOciosa) => decidirOpep({ crescimento, variacaoOciosa });
  assert.deepEqual([caso(-4, 1200).caso, caso(-4, 1200).direcao, caso(-4, 1200).intensidade], [CASO.CORTE, "ALTA", "MODERADA"]);
  assert.deepEqual([caso(3, -900).caso, caso(3, -900).direcao], [CASO.AUMENTO, "BAIXA"]);
  assert.deepEqual([caso(-20, -3000).caso, caso(-20, -3000).direcao, caso(-20, -3000).intensidade], [CASO.INTERRUPCAO, "NEUTRA", "FRACA"]);
  assert.equal(caso(4, 800).caso, CASO.EXPANSAO);
  assert.equal(caso(4, 800).direcao, "NEUTRA");
  // Uma das duas dentro da faixa: neutro, mesmo com a outra muito fora.
  assert.equal(caso(-10, 100).caso, CASO.NEUTRO);
  assert.equal(caso(1, -2000).caso, CASO.NEUTRO);
  // No limiar conta (1,5% e 400 mil barris/dia).
  assert.equal(caso(-1.5, 400).caso, CASO.CORTE);
  assert.equal(decidirOpep({ crescimento: null, variacaoOciosa: 500 }), null);
});

test("camada C: forte com a produção mudando 5% ou mais; tendência pela variação da ociosa de 3 meses antes", () => {
  assert.equal(decidirOpep({ crescimento: -8, variacaoOciosa: 2500 }).intensidade, "FORTE");
  const d = decidirOpep({ crescimento: -4, variacaoOciosa: 1200, variacaoOciosaAnterior: 600 });
  assert.deepEqual([d.tendencia, d.mudancaPp], ["SUBINDO", 600]);
  assert.equal(decidirOpep({ crescimento: -4, variacaoOciosa: 1200, variacaoOciosaAnterior: 1000 }).tendencia, "ESTAVEL");
  assert.equal(decidirOpep({ crescimento: 3, variacaoOciosa: -900, variacaoOciosaAnterior: -300 }).tendencia, "CAINDO");
  assert.equal(decidirOpep({ crescimento: 3, variacaoOciosa: -900 }).tendencia, null);
});

test("derivação: média de 3 meses contra os mesmos 3 do ano anterior, só nos meses com produção e ociosa", () => {
  const linhas = [];
  const linha = (item, campo, observedAt, value) => ({ seriesCode: `EIA_STEO.PETROLEO.${item}.${campo}`, observedAt, value, publishedAt: new Date("2026-01-01T00:00:00Z"), publishedAtIsEstimated: true });
  for (let i = 0; i < 18; i += 1) {
    const mes = new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10);
    linhas.push(linha("OPEP", "PRODUCAO", mes, i < 12 ? 27000 : 26000));
    linhas.push(linha("OPEP", "CAPACIDADE_OCIOSA", mes, i < 12 ? 3000 : 4000));
  }
  linhas.push(linha("RU", "PRODUCAO", "2025-06-01", 9100));
  const pontos = derivarOpep(linhas, { parametros: PARAMETROS_PADRAO });
  assert.equal(pontos.length, 18);
  assert.equal(pontos[0].crescimentoProducaoPct, null, "sem o ano anterior, sem medida");
  assert.equal(pontos[0].decisao, null);
  const jun = pontos.find((p) => p.observedAt === "2025-06-01");
  assert.equal(jun.crescimentoProducaoPct, -3.7);
  assert.equal(jun.variacaoOciosa, 1000);
  assert.equal(jun.russia, 9100);
  assert.equal(jun.decisao.caso, CASO.CORTE);
  assert.match(jun.caso, /^Caso: corte/);
  // Fevereiro de 2025: os mesmos 3 meses do ano anterior começam em dez/2023, antes do dado.
  assert.equal(pontos.find((p) => p.observedAt === "2025-02-01").crescimentoProducaoPct, null);
});
