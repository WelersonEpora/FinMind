"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const parser = require("./conab-cafe.parser");

// Aba no layout real (valores do 3º levantamento de 2026, aba "1 Café Total", reduzida): cabeçalho em 3 linhas
// no formato de 2025 em diante, linha "0" solta, sub-regiões recuadas, rodapé com a nota.
function abaTotal({ unidadeArea = "ha", safras = ["Safra 2025", "Safra 2026"], nota = "Nota: Estimativa em setembro/2026." } = {}) {
  return [
    ["REGIÃO/UF", `ÁREA EM PRODUÇÃO (${unidadeArea})`, null, null, "PRODUTIVIDADE (sc/ha)", null, null, "PRODUÇÃO (mil sacas beneficiadas)", null, null],
    [null, safras[0], safras[1], "VAR. % ", safras[0], safras[1], "VAR. % ", safras[0], safras[1], "VAR. % "],
    [null, " (a)", "(b)", "(b/a)", " (c)", " (d)", "(d/c)", "(e)", " (f)", "(f/e)"],
    ["NORTE", 41747.5, 44847.5, 7.43, 56.42, 65.18, 15.53, 2355.4, 2923.2, 24.11],
    ["RO", 40762, 43155, 5.87, 56.92, 66.65, 17.09, 2320.2, 2876.3, 23.97],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ["BA", 103245, 103550, 0.3, 42.95, 43.34, 0.91, 4434.5, 4488.2, 1.21],
    ["     Cerrado", 6000, 6500, 8.33, 44.17, 38.46, -12.92, 265, 250, -5.66],
    ["MG", 1000000, 1010000, 1, 30, 35, 16, 30000, 35595, 18],
    ["     Sul e Centro-Oeste", 500000, 505000, 1, 30, 36, 20, 15000, 18000, 20],
    ["OUTROS (*)", 100, 100, 0, 10, 10, 0, 1, 1, 0],
    ["BRASIL", 1858693.5, 1952617.5, 5.05, 30.42, 34.62, 13.83, 56535.3, 67606, 19.58],
    ["Legenda: (*) Acre, Pará, Ceará, Pernambuco, Mato Grosso do Sul e Distrito Federal"],
    ["Fonte: Conab."],
    [nota]
  ];
}

const planilha = (linhas = abaTotal()) => [
  { nome: "Planilha Principal", linhas: [] },
  { nome: "1 Café Total", linhas },
  { nome: "2 Café Arábica", linhas: abaTotal() },
  { nome: "3 Café Conilon", linhas: abaTotal() }
];

test("extrairAba: uma série por região, métrica e tipo; valores como publicados; a linha '0' solta é ignorada", () => {
  const { observacoes, invalidos, estimativa } = parser.extrairAba(abaTotal(), "TOTAL");

  assert.equal(invalidos.length, 0);
  assert.deepEqual(estimativa, { mes: 9, ano: 2026 });
  const brasil2026 = observacoes.filter((o) => o.regiao === "BRASIL" && o.safra === "2026");
  assert.deepEqual(
    brasil2026.map((o) => [o.seriesCode, o.valor, o.unidade]),
    [
      ["CONAB.CAFE.BRASIL.AREA_TOTAL", 1952617.5, "ha"],
      ["CONAB.CAFE.BRASIL.PRODUTIVIDADE_TOTAL", 34.62, "sc/ha"],
      ["CONAB.CAFE.BRASIL.PRODUCAO_TOTAL", 67606, "mil sacas"]
    ]
  );
  assert.equal(brasil2026[0].observedAt, "2026-01-01", "a safra do café é o ano da colheita");
  assert.ok(!observacoes.some((o) => o.regiao === "0"));
});

test("extrairAba: sub-região recuada ganha o prefixo da UF acima; OUTROS (*) vira OUTROS", () => {
  const regioes = [...new Set(parser.extrairAba(abaTotal(), "TOTAL").observacoes.map((o) => o.regiao))];
  assert.deepEqual(regioes, ["NORTE", "RO", "BA", "BA_CERRADO", "MG", "MG_SUL_E_CENTRO_OESTE", "OUTROS", "BRASIL"]);
});

test("extrairAba aceita o cabeçalho antigo ('Safra 2022 (a)', até 2024)", () => {
  const { observacoes } = parser.extrairAba(abaTotal({ safras: ["Safra 2022 (a)", "Safra 2023 (b)"] }), "TOTAL");
  assert.deepEqual([...new Set(observacoes.map((o) => o.safra))], ["2022", "2023"]);
});

test("extrairAba: área em 'mil ha' (só a planilha de jan/2023) vira ha, com a unidade original registrada", () => {
  const linhas = abaTotal({ unidadeArea: "mil ha" });
  linhas[11][1] = 1841.5284;
  const area = parser.extrairAba(linhas, "TOTAL").observacoes.find((o) => o.seriesCode === "CONAB.CAFE.BRASIL.AREA_TOTAL" && o.safra === "2025");
  assert.equal(Math.round(area.valor * 10) / 10, 1841528.4);
  assert.equal(area.unidade, "ha");
  assert.equal(area.unidadeOriginal, "mil ha");
  const producao = parser.extrairAba(linhas, "TOTAL").observacoes.find((o) => o.metrica === "PRODUCAO");
  assert.equal(producao.unidadeOriginal, undefined, "sem conversão, sem unidade original");
});

test("extrairAba falha em unidade desconhecida, bloco faltando ou sem a linha BRASIL (nunca grava na unidade errada)", () => {
  assert.throws(() => parser.extrairAba(abaTotal({ unidadeArea: "alqueire" }), "TOTAL"), /unidade de AREA não reconhecida/);
  const semBloco = abaTotal();
  semBloco[0][4] = "OUTRA COISA";
  assert.throws(() => parser.extrairAba(semBloco, "TOTAL"), /esperava 3 blocos/);
  assert.throws(() => parser.extrairAba(abaTotal().filter((l) => l[0] !== "BRASIL"), "TOTAL"), /BRASIL não encontrada/);
});

test("extrairAba: valor não numérico vai para os inválidos sem abortar a aba", () => {
  const linhas = abaTotal();
  linhas[4][8] = "n/d";
  const { observacoes, invalidos } = parser.extrairAba(linhas, "TOTAL");
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /RO, PRODUCAO 2026/);
  assert.ok(observacoes.length > 0);
});

test("extrairLevantamento: as três abas (total, arábica, conilon) e a nota; aba faltando ou nota divergente é erro", () => {
  const r = parser.extrairLevantamento(planilha());
  assert.deepEqual([...new Set(r.observacoes.map((o) => o.tipo))], ["TOTAL", "ARABICA", "CONILON"]);
  assert.deepEqual(r.estimativa, { mes: 9, ano: 2026 });

  assert.throws(() => parser.extrairLevantamento(planilha().filter((a) => a.nome !== "3 Café Conilon")), /3 Café Conilon/);
  const divergente = planilha();
  divergente[2] = { nome: "2 Café Arábica", linhas: abaTotal({ nota: "Nota: Estimativa em maio/2026." }) };
  assert.throws(() => parser.extrairLevantamento(divergente), /discordam do mês/);
});

test("lerNotaEstimativa e lerSafra", () => {
  assert.deepEqual(parser.lerNotaEstimativa("Nota: Estimativa em março/2024."), { mes: 3, ano: 2024 });
  assert.equal(parser.lerNotaEstimativa("Fonte: Conab."), null);
  assert.deepEqual(parser.lerSafra("Safra 2026"), { safra: "2026", observedAt: "2026-01-01" });
  assert.equal(parser.lerSafra("VAR. %"), null);
});
