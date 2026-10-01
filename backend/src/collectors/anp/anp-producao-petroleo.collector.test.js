"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./anp-producao-petroleo.collector");

// Trechos reais de 2026-10-01: a página de dados abertos e o CSV (UTF-8 com BOM, vírgula decimal, meses futuros zerados).
const PAGINA =
  '<li><a href="https://www.gov.br/anp/.../producao-petroleo-m3.csv">Produção de petróleo (metros cúbicos) 1997-2026 </a> (atualizado em 30/9/2026)</li>' +
  "<li>Produção de LGN (metros cúbicos) 1997-2026 (atualizado em 30/9/2026)</li>";

const CSV = [
  "﻿ANO;MÊS;GRANDE REGIÃO;UNIDADE DA FEDERAÇÃO;PRODUTO;LOCALIZAÇÃO;PRODUÇÃO",
  "1999;NOV;REGIÃO NORDESTE;SERGIPE;PETRÓLEO;MAR;65031,6",
  "2026;JUL;REGIÃO SUDESTE;RIO DE JANEIRO;PETRÓLEO;MAR;19000000",
  "2026;AGO;REGIÃO SUDESTE;RIO DE JANEIRO;PETRÓLEO;MAR;19500000",
  "2026;AGO;REGIÃO NORDESTE;CEARÁ;PETRÓLEO;TERRA;0",
  "2026;SET;REGIÃO SUDESTE;RIO DE JANEIRO;PETRÓLEO;MAR;0",
  "2026;OUT;REGIÃO SUDESTE;RIO DE JANEIRO;PETRÓLEO;MAR;0",
  ""
].join("\r\n");

test("extrairDataAtualizacao: a data do arquivo de petróleo, não a de outro arquivo da página", () => {
  assert.equal(collector.extrairDataAtualizacao(PAGINA), "2026-09-30");
  assert.equal(collector.extrairDataAtualizacao("<p>sem data</p>"), null);
});

test("normalize: série por UF e localização, vírgula decimal, meses futuros zerados não entram (aviso)", () => {
  const { validos, invalidos, avisos } = collector.normalize(collector.parse({ pagina: PAGINA, csv: CSV }));
  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.unit]),
    [
      ["ANP.PETROLEO_PRODUCAO.SE.MAR", "1999-11-01", 65031.6, "m³"],
      ["ANP.PETROLEO_PRODUCAO.RJ.MAR", "2026-07-01", 19000000, "m³"],
      ["ANP.PETROLEO_PRODUCAO.RJ.MAR", "2026-08-01", 19500000, "m³"],
      ["ANP.PETROLEO_PRODUCAO.CE.TERRA", "2026-08-01", 0, "m³"]
    ]
  );
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].motivo, /2 mês\(es\)/);
});

test("published_at: o último mês publicado tem a data da página (real); os anteriores, o fim do mês seguinte (estimado)", () => {
  const { validos } = collector.normalize(collector.parse({ pagina: PAGINA, csv: CSV }));
  const porMes = Object.fromEntries(validos.map((v) => [`${v.series_code}@${v.observed_at}`, v]));

  const agosto = porMes["ANP.PETROLEO_PRODUCAO.RJ.MAR@2026-08-01"];
  assert.equal(agosto.published_at.toISOString(), "2026-09-30T23:59:59.000Z");
  assert.equal(agosto.published_at_is_estimated, false);

  const julho = porMes["ANP.PETROLEO_PRODUCAO.RJ.MAR@2026-07-01"];
  assert.equal(julho.published_at.toISOString(), "2026-08-31T23:59:59.000Z");
  assert.equal(julho.published_at_is_estimated, true);

  assert.equal(porMes["ANP.PETROLEO_PRODUCAO.SE.MAR@1999-11-01"].published_at.toISOString(), "1999-12-31T23:59:59.000Z");
});

test("UF, produto, localização ou número fora do esperado viram inválidos; colunas ou página fora do formato derrubam a coleta", () => {
  const csv = [
    "ANO;MÊS;GRANDE REGIÃO;UNIDADE DA FEDERAÇÃO;PRODUTO;LOCALIZAÇÃO;PRODUÇÃO",
    "2026;AGO;REGIÃO SUDESTE;RIO DE JANEIRO;PETRÓLEO;MAR;100",
    "2026;AGO;REGIÃO X;ATLÂNTIDA;PETRÓLEO;MAR;1",
    "2026;AGO;REGIÃO SUDESTE;RIO DE JANEIRO;GÁS;MAR;1",
    "2026;AGO;REGIÃO SUDESTE;RIO DE JANEIRO;PETRÓLEO;PRÉ-SAL;1",
    "2026;AGO;REGIÃO SUDESTE;RIO DE JANEIRO;PETRÓLEO;TERRA;-5",
    "2026;XYZ;REGIÃO SUDESTE;RIO DE JANEIRO;PETRÓLEO;TERRA;5"
  ].join("\n");
  const { validos, invalidos } = collector.normalize(collector.parse({ pagina: PAGINA, csv }));
  assert.equal(validos.length, 1);
  assert.equal(invalidos.length, 5);

  assert.throws(() => collector.parse({ pagina: PAGINA, csv: "A;B\n1;2" }), /colunas inesperadas/);
  assert.throws(() => collector.parse({ pagina: "<p>nada</p>", csv: CSV }), /atualizado em/);
  assert.throws(() => collector.parse({}), /formato inesperado/);
});
