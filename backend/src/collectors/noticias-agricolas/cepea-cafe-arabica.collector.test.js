"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./cepea-cafe-arabica.collector");

// Um trecho no layout da página real (conferido em 2026-10-23): um bloco por fechamento, cada um com a tabela cot-fisicas.
function bloco(data, valor) {
  return `<div class="fechamento">Fechamento: ${data}</div><div class="fonte"><span>Fonte: Cepea/Esalq</span></div>
    <table class="cot-fisicas"><thead class="head-box"><tr><th>Data</th><th>Valor R$</th><th>Variação(%)</th></tr></thead>
      <tbody class="body-box"><tr>
        <td>${data}</td>
        <td>${valor}</td>
        <td>-0,07%</td>
      </tr></tbody></table>`;
}
const pagina = (...blocos) => `<html><h1>Indicador Café Arábica - Cepea/Esalq</h1>${blocos.join("")}</html>`;

const versao = (observed_at, value) => ({ series_code: "CEPEA.CAFE_ARABICA.AVISTA_BRL", observed_at, value });

test("extrairFechamentos: os fechamentos da página, e falha alto se o layout mudar", () => {
  assert.deepEqual(
    coletor.extrairFechamentos(pagina(bloco("22/10/2026", "1.619,85"), bloco("21/10/2026", "1.620,92"))).map((f) => [f.data, f.valor]),
    [
      ["2026-10-22", 1619.85],
      ["2026-10-21", 1620.92]
    ]
  );
  assert.throws(() => coletor.extrairFechamentos("<h1>Outra página</h1>"), /não tem o título/);
  assert.throws(() => coletor.extrairFechamentos(pagina("<table class='outra'></table>")), /nenhum fechamento/);
});

test("normalize: a série da planilha, com a origem Notícias Agrícolas; data futura ou de fim de semana é inválida", () => {
  const fechamentos = coletor.extrairFechamentos(pagina(bloco("22/10/2026", "1.619,85"), bloco("18/10/2026", "1.600,00"), bloco("26/10/2026", "1.600,00")));
  const { validos, invalidos } = coletor.normalize(fechamentos, { hoje: "2026-10-23" });
  assert.deepEqual(
    validos.map((v) => [v.series_code, v.observed_at, v.value, v.source_code]),
    [["CEPEA.CAFE_ARABICA.AVISTA_BRL", "2026-10-22", 1619.85, "NOTICIAS_AGRICOLAS"]]
  );
  assert.equal(validos[0].published_at.toISOString(), "2026-10-23T02:59:59.000Z");
  assert.equal(invalidos.length, 2);
});

test("conferir: sem sobreposição com a série, nada entra", () => {
  const { aceitos, falhas } = coletor.conferir([versao("2026-10-23", 1620)], new Map());
  assert.equal(aceitos.length, 0);
  assert.match(falhas[0].motivo, /importe a planilha do Cepea antes/);
});

test("conferir: um dia conhecido que diverge descarta a página inteira", () => {
  const conhecidos = new Map([["2026-10-21", 1620.92], ["2026-10-22", 1619.85]]);
  const { aceitos, falhas } = coletor.conferir([versao("2026-10-23", 1625), versao("2026-10-22", 1619.8), versao("2026-10-21", 1620.92)], conhecidos);
  assert.equal(aceitos.length, 0);
  assert.match(falhas[0].motivo, /2026-10-22: página 1619.8, série 1619.85/);
});

test("conferir: o dia novo entra se a variação contra o anterior ficar em até 8%; acima, não", () => {
  const conhecidos = new Map([["2026-10-22", 1619.85]]);
  const ok = coletor.conferir([versao("2026-10-23", 1700), versao("2026-10-22", 1619.85)], conhecidos);
  assert.deepEqual(ok.aceitos.map((v) => v.observed_at), ["2026-10-22", "2026-10-23"]);
  assert.equal(ok.falhas.length, 0);

  const salto = coletor.conferir([versao("2026-10-23", 1800), versao("2026-10-22", 1619.85)], conhecidos);
  assert.deepEqual(salto.aceitos.map((v) => v.observed_at), ["2026-10-22"]);
  assert.match(salto.falhas[0].motivo, /varia 11.1% contra o dia anterior/);
});

test("conferir: dois dias novos seguidos - o segundo é comparado com o primeiro", () => {
  const conhecidos = new Map([["2026-10-21", 1500]]);
  const { aceitos, falhas } = coletor.conferir([versao("2026-10-23", 1680), versao("2026-10-22", 1600), versao("2026-10-21", 1500)], conhecidos);
  assert.deepEqual(aceitos.map((v) => v.observed_at), ["2026-10-21", "2026-10-22", "2026-10-23"]);
  assert.equal(falhas.length, 0);
});

test("persist: lê a série, confere e só grava o que passou", async () => {
  let gravados = null;
  const deps = {
    observationRepository: { buscarUltimasVersoes: async () => new Map([["2026-10-22", { value: "1619.850000" }]]) },
    pointInTimeService: {
      registrarObservacoes: async (obs) => {
        gravados = obs;
        return { criados: 1, atualizados: 0, ignorados: 1, falhas: [] };
      }
    }
  };
  const r = await coletor.persist([versao("2026-10-23", 1620), versao("2026-10-22", 1619.85)], { execucaoId: "e1" }, deps);
  assert.deepEqual(gravados.map((v) => v.observed_at), ["2026-10-22", "2026-10-23"]);
  assert.deepEqual([r.criados, r.ignorados, r.falhas.length], [1, 1, 0]);
});
