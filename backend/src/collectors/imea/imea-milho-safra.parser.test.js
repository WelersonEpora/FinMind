"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extrairSafras, lerSafra } = require("./imea-milho-safra.parser");

// Itens reais dos 3 indicadores identificados (ver o parser), no formato da API (2026-09-22).
const AREA_MT = { Localidade: "Mato Grosso", Valor: 7434288.03, Variacao: 0, Safra: "25/26", IndicadorFinalId: "700940565361721344", CadeiaId: "3", DataPublicacao: "2026-09-01 00:00:00", TipoLocalidadeId: "1", UnidadeSigla: "ha", UnidadeDescricao: "Hectare" };
const PRODUCAO_MT = { Localidade: "Mato Grosso", Valor: 58036957.95, Safra: "25/26", IndicadorFinalId: "701185771642290176", TipoLocalidadeId: "1", UnidadeSigla: "t", DataPublicacao: "2026-09-01 00:00:00" };
const PRODUTIVIDADE_MT = { Localidade: "Mato Grosso", Valor: 130.11, Safra: "25/26", IndicadorFinalId: "701199398680133632", TipoLocalidadeId: "1", UnidadeSigla: "sc/ha", DataPublicacao: "2026-09-01 00:00:00" };
const AREA_OESTE = { Localidade: "Oeste", Valor: 511012.15, Safra: "25/26", IndicadorFinalId: "700940565361721344", TipoLocalidadeId: "2", UnidadeSigla: "ha", DataPublicacao: "2026-09-01 00:00:00" };
// Um item de outro indicador da mesma resposta (preço spot): deve ser ignorado, não inválido.
const PRECO_SPOT = { Localidade: "Mato Grosso", Valor: 42.52, Safra: null, IndicadorFinalId: "708192508838936581", TipoLocalidadeId: "1", UnidadeSigla: "R$/sc", DataPublicacao: "2026-09-18 00:00:00" };

test("lerSafra: '25/26' -> safra e observedAt; ano seguinte tem de bater", () => {
  assert.deepEqual(lerSafra("25/26"), { safra: "2025/26", observedAt: "2025-09-01" });
  assert.equal(lerSafra("25/28"), null);
  assert.equal(lerSafra(null), null);
  assert.equal(lerSafra(""), null);
});

test("extrairSafras: monta série IMEA.MILHO.<REGIAO>.<METRICA> só para os 3 indicadores conhecidos", () => {
  const { observacoes, invalidos, ignorados } = extrairSafras([AREA_MT, PRODUCAO_MT, PRODUTIVIDADE_MT, AREA_OESTE, PRECO_SPOT]);

  assert.equal(invalidos.length, 0);
  assert.equal(ignorados, 1, "o item de outro indicador (preço) não é inválido, só ignorado");
  assert.equal(observacoes.length, 4);

  const area = observacoes.find((o) => o.seriesCode === "IMEA.MILHO.MATO_GROSSO.AREA");
  assert.deepEqual(area, {
    seriesCode: "IMEA.MILHO.MATO_GROSSO.AREA",
    observedAt: "2025-09-01",
    valor: 7434288.03,
    unidade: "ha",
    dataPublicacao: "2026-09-01",
    regiao: "MATO_GROSSO",
    localidade: "Mato Grosso",
    tipoLocalidade: "estado",
    metrica: "AREA",
    safra: "2025/26",
    indicadorId: "700940565361721344"
  });

  const oeste = observacoes.find((o) => o.seriesCode === "IMEA.MILHO.OESTE.AREA");
  assert.equal(oeste.tipoLocalidade, "regiao");
});

test("extrairSafras: unidade diferente da esperada para o indicador vai para os inválidos", () => {
  const item = { ...AREA_MT, UnidadeSigla: "t" };
  const { observacoes, invalidos } = extrairSafras([item]);
  assert.equal(observacoes.length, 0);
  assert.match(invalidos[0].motivo, /unidade "t" diferente da esperada \("ha"\)/);
});

test("extrairSafras: safra ou DataPublicacao em formato inesperado vai para os inválidos", () => {
  const { invalidos: i1 } = extrairSafras([{ ...AREA_MT, Safra: "2025/26" }]);
  assert.match(i1[0].motivo, /safra inválida/);

  const { invalidos: i2 } = extrairSafras([{ ...AREA_MT, DataPublicacao: "24/09/2026" }]);
  assert.match(i2[0].motivo, /DataPublicacao inválida/);
});

test("extrairSafras: valor não numérico vai para os inválidos", () => {
  const { invalidos } = extrairSafras([{ ...AREA_MT, Valor: "7434288.03" }]);
  assert.match(invalidos[0].motivo, /valor inválido/);
});

test("extrairSafras: repetição idêntica (mesma safra, mesma data, mesmo valor) vira uma observação só", () => {
  const { observacoes } = extrairSafras([AREA_MT, { ...AREA_MT }]);
  assert.equal(observacoes.length, 1);
});

test("extrairSafras: mesma safra/região com DataPublicacao mais nova vence a mais antiga", () => {
  const antiga = { ...AREA_MT, Valor: 7000000, DataPublicacao: "2026-08-01 00:00:00" };
  const nova = { ...AREA_MT, Valor: 7434288.03, DataPublicacao: "2026-09-01 00:00:00" };
  const { observacoes } = extrairSafras([antiga, nova]);
  assert.equal(observacoes.length, 1);
  assert.equal(observacoes[0].valor, 7434288.03);
});

test("extrairSafras: mesma safra/região, mesma DataPublicacao, valores diferentes: ambígua, vai para os inválidos e nenhuma é gravada", () => {
  const v1 = { ...AREA_MT, Valor: 7000000 };
  const v2 = { ...AREA_MT, Valor: 7434288.03 };
  const { observacoes, invalidos } = extrairSafras([v1, v2]);
  assert.equal(observacoes.length, 0);
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /mesma data.*valores diferentes/);
});

test("extrairSafras: localidade vazia vai para os inválidos", () => {
  const { invalidos } = extrairSafras([{ ...AREA_MT, Localidade: "" }]);
  assert.match(invalidos[0].motivo, /localidade vazia/);
});
