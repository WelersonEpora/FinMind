"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./bcb-atuacoes-cambio.collector");
const { descreverAtuacaoCambio } = require("../../shared/utils/bcb-atuacao-cambio");

const CABECALHO =
  "﻿Comunicação,Data Hora Comunicação,Comunicado,Data Hora Comunicado,Data Hora Anúncio,Procedimento Operacional,Data,Instrumento,Modalidade,Tipo Composto,Data de Liquidação,Data de Vencimento,Volume USD Ofertado,Volume USD Aceito,Taxa de Corte";

// Linhas reais do CSV de 2026-10-09: a 1ª atuação (1999, sem comunicado nem volume ofertado) e as de agosto de 2026
// (um swap tradicional e o leilão conjugado de venda à vista pela PTAX com swap reverso). A 2ª linha de swap tradicional
// de 2026-08-26 é inventada, para testar a soma do dia.
const LINHAS = [
  ',,,,,Operação Direta,1999-01-22 00:00:00,Venda a Vista,Mercado,,1999-01-26 00:00:00,,,"675510000,00",',
  ',,45817,2026-08-25 18:30:05,2026-08-25 18:30:05,Leilão Eletrônico,2026-08-26 00:00:00,Swap Cambial,Tradicional,,2026-09-01 00:00:00,2027-01-04 00:00:00,"3000000000,00","1200000000,00","5,227000"',
  ',,45818,2026-08-25 18:31:05,2026-08-25 18:31:05,Leilão Eletrônico,2026-08-26 00:00:00,Swap Cambial,Tradicional,,2026-09-01 00:00:00,2027-04-01 00:00:00,"1000000000,00","800000000,00","5,301000"',
  ',,45825,2026-08-26 18:31:48,2026-08-26 18:31:48,Leilão Eletrônico,2026-08-27 00:00:00,Venda a Vista,PTAX,Leilão à Vista + Swap Reverso,2026-08-31 00:00:00,,"1000000000,00","1000000000,00","-0,000400"',
  ',,45826,2026-08-26 18:31:57,2026-08-26 18:31:57,Leilão Eletrônico,2026-08-27 00:00:00,Swap Cambial,Reverso,Leilão à Vista + Swap Reverso,2026-08-28 00:00:00,2026-10-01 00:00:00,"1000000000,00","1000000000,00","4,561000"'
];

const csv = (linhas = LINHAS, cabecalho = CABECALHO) => [cabecalho, ...linhas].join("\r\n");
const valor = (validos, serie) => validos.find((v) => v.series_code === serie)?.value;

test("cada par instrumento/modalidade vira um item por dia: aceito, ofertado e número de atuações, somados no dia", () => {
  const { validos, invalidos } = collector.normalize(collector.parse(csv()));
  assert.equal(invalidos.length, 0);

  assert.equal(valor(validos, "BCB.ATUACAO_CAMBIO.SWAP_TRADICIONAL.ACEITO_USD"), 2000000000);
  assert.equal(valor(validos, "BCB.ATUACAO_CAMBIO.SWAP_TRADICIONAL.OFERTADO_USD"), 4000000000);
  assert.equal(valor(validos, "BCB.ATUACAO_CAMBIO.SWAP_TRADICIONAL.LEILOES"), 2);
  assert.equal(valor(validos, "BCB.ATUACAO_CAMBIO.VENDA_VISTA_PTAX.ACEITO_USD"), 1000000000);
  assert.equal(valor(validos, "BCB.ATUACAO_CAMBIO.SWAP_REVERSO.ACEITO_USD"), 1000000000);

  const swap = validos.find((v) => v.series_code === "BCB.ATUACAO_CAMBIO.SWAP_TRADICIONAL.ACEITO_USD");
  assert.equal(swap.observed_at, "2026-08-26");
  assert.equal(swap.unit, "USD");
  assert.equal(swap.published_at.toISOString(), "2026-08-27T02:59:59.000Z", "fim do dia da atuação em Brasília");
  assert.equal(swap.published_at_is_estimated, true);
  assert.deepEqual(
    validos.find((v) => v.series_code === "BCB.ATUACAO_CAMBIO.SWAP_REVERSO.LEILOES").metadata.tipoComposto,
    ["Leilão à Vista + Swap Reverso"],
    "o leilão conjugado fica registrado"
  );
});

test("atuação sem volume ofertado (operação direta de 1999) grava só o aceito e o número de atuações", () => {
  const { validos } = collector.normalize(collector.parse(csv()));
  const de1999 = validos.filter((v) => v.observed_at === "1999-01-22").map((v) => [v.series_code, v.value]);
  assert.deepEqual(de1999, [
    ["BCB.ATUACAO_CAMBIO.VENDA_VISTA.ACEITO_USD", 675510000],
    ["BCB.ATUACAO_CAMBIO.VENDA_VISTA.LEILOES", 1]
  ]);
});

test("par instrumento/modalidade desconhecido vira inválido (não é adivinhado), sem derrubar o resto", () => {
  const novo = ',,1,,,Leilão Eletrônico,2026-09-01 00:00:00,Swap Cambial,Híbrido,,,,"1,00","1,00",';
  const { validos, invalidos } = collector.normalize(collector.parse(csv([...LINHAS, novo])));
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /desconhecido: "Swap Cambial \/ Híbrido"/);
  assert.ok(validos.length > 0);
});

test("parse: colunas diferentes do esperado são falha da fonte; o rótulo de cada item vem do mapa", () => {
  assert.throws(() => collector.parse(csv(LINHAS, "Data,Instrumento")), /layout mudou/);
  assert.throws(() => collector.parse(""), /vazio/);
  assert.deepEqual(collector.separarCampos('a,"1,5",b'), ["a", "1,5", "b"]);
  assert.equal(descreverAtuacaoCambio("LINHA_POS_SELIC").rotulo, "Linha (venda com recompra), pós-fixada na Selic");
  assert.equal(descreverAtuacaoCambio("OUTRA"), null);
});
