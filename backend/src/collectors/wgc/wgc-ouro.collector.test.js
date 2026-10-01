"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarColetorWgc } = require("./wgc-ouro.collector");

// Trechos reais da API dos gráficos do Goldhub (fsapi.gold.org, 2026-10-01). Nenhum teste chama o WGC.
const COLUNAS = ["Date", "North America", "Europe", "Asia", "Other", "Gold, US$/oz"];
const RESPOSTA_ETF = {
  chartData: {
    asOfDate: "2026-09-25",
    data: {
      Weekly: {
        tonnes: {
          columns: COLUNAS,
          set: [
            [1046390400000, 9.55, 23.48, null, 9.42, 363.64],
            [1790294400000, 2111.98, 1522.99, 537.28, 76.67, 4293.14]
          ]
        },
        usd: { columns: COLUNAS, set: [[1790294400000, 289351256449.95, 208643607027.55, 76649819282.37, 10512926327.86, 4293.14]] }
      }
    }
  }
};

const RESPOSTA_OFERTA_DEMANDA = {
  chartData: {
    asOfDate: "2026-06-30",
    Demand_Quarterly: {
      categories: ["Q1 '26", "Q2 '26"],
      series: [
        { name: "Central banks", data: [56.5173, 288.862] },
        { name: "Etfs", data: [62.4302, -44.8384] },
        { name: "LBMA", data: [4872.9, 4506.3] }
      ]
    },
    Supply_Quarterly: { categories: ["Q1 '26", "Q2 '26"], series: [{ name: "Mine production", data: [901.344, 965.579] }] }
  }
};

test("ETFs: toneladas e US$ milhões por região, na sexta da semana; região sem ETF (null) é ausência; o preço do ouro fica de fora", () => {
  const coletor = criarColetorWgc("etf");
  assert.equal(coletor.codigo, "wgc-etf-ouro");
  const { validos, invalidos } = coletor.normalize(coletor.parse(RESPOSTA_ETF));
  assert.equal(invalidos.length, 0);
  // 1ª semana: 3 regiões (Ásia null); última: 4 regiões em toneladas e 4 em US$.
  assert.equal(validos.length, 3 + 4 + 4);

  const achar = (serie, data) => validos.find((v) => v.series_code === serie && v.observed_at === data);
  assert.equal(achar("WGC.ETF.AMERICA_DO_NORTE.TONELADAS", "2026-09-25").value, 2111.98);
  assert.equal(achar("WGC.ETF.ASIA.TONELADAS", "2003-02-28"), undefined);
  const usd = achar("WGC.ETF.AMERICA_DO_NORTE.MI_USD", "2026-09-25");
  assert.equal(usd.value, 289351.25645);
  assert.equal(usd.unit, "mi USD");
  assert.equal(usd.published_at, undefined, "sem published_at: vale a coleta");
  assert.equal(usd.source_code, "WGC_ETF");
  assert.ok(!validos.some((v) => /GOLD|US\$\/oz/.test(v.series_code)));
});

test("oferta e demanda: trimestre no 1º dia, em toneladas; o preço LBMA não é gravado", () => {
  const coletor = criarColetorWgc("oferta-demanda");
  const { validos, invalidos } = coletor.normalize(coletor.parse(RESPOSTA_OFERTA_DEMANDA));
  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 6);
  const bc = validos.find((v) => v.series_code === "WGC.OFERTA_DEMANDA.BANCOS_CENTRAIS" && v.observed_at === "2026-04-01");
  assert.equal(bc.value, 288.862);
  assert.equal(bc.unit, "t");
  assert.equal(validos.find((v) => v.series_code === "WGC.OFERTA_DEMANDA.ETFS" && v.observed_at === "2026-04-01").value, -44.8384);
  assert.ok(validos.some((v) => v.series_code === "WGC.OFERTA_DEMANDA.PRODUCAO_MINAS"));
  assert.ok(!validos.some((v) => v.series_code.includes("LBMA")));
});

test("série ou região que a fonte passe a mandar sem mapeamento vira inválido, nunca série com nome inventado", () => {
  const od = criarColetorWgc("oferta-demanda");
  const { invalidos } = od.normalize([{ nome: "Space mining", trimestre: "Q2 '26", valor: 1 }]);
  assert.equal(invalidos.length, 1);
  const etf = criarColetorWgc("etf");
  assert.equal(etf.normalize([{ regiao: "Antarctica", medida: "TONELADAS", data: 1790294400000, valor: 1 }]).invalidos.length, 1);
});

test("parse rejeita resposta fora do formato", () => {
  assert.throws(() => criarColetorWgc("etf").parse({ chartData: { data: {} } }));
  assert.throws(() => criarColetorWgc("oferta-demanda").parse({}));
  assert.throws(() => criarColetorWgc("ouro-lunar"));
});
