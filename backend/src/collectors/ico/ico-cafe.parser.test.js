"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerRelatorio, lerPrecos, lerEstoques, mesSeguinte } = require("./ico-cafe.parser");

// Itens de PDF ({ str, x, y }) que reproduzem os layouts reais. `linha(y, x0, ...textos)` põe um item por texto.
const linha = (y, x0, ...textos) => textos.map((str, i) => ({ str, x: x0 + i * 55, y }));

const CABECALHO_2026 = [
  { str: "ICO Composite", x: 127.4, y: 767.3 },
  { str: "Colombian", x: 201.4, y: 773.4 },
  { str: "Milds", x: 220.1, y: 761.8 },
  { str: "Other Milds", x: 256.4, y: 767.3 },
  { str: "Brazilian", x: 319.8, y: 773.4 },
  { str: "Naturals", x: 320.3, y: 761.8 },
  { str: "Robustas", x: 369.2, y: 767.3 },
  { str: "New York*", x: 424.1, y: 767.3 },
  { str: "London*", x: 490.6, y: 767.3 }
];

function tabela1({ meses, rotuloAbaixo = false, cabecalho = CABECALHO_2026, valores = () => [1, 2, 3, 4, 5, 6, 7] }) {
  const itens = [{ str: "Table 1: ICO daily indicator prices and futures prices (US cents/lb)", x: 74, y: 785 }, ...cabecalho, { str: "Monthly averages", x: 74, y: 749.7 }];
  meses.forEach((mes, i) => {
    const y = 737 - i * 13;
    // ago/2020: o rótulo fica 0,6 ponto ABAIXO dos números.
    itens.push({ str: mes, x: 74, y: rotuloAbaixo ? y - 0.6 : y + 0.5 }, ...linha(y, 150, ...valores(i).map((v) => v.toFixed(2))));
  });
  itens.push({ str: "% change between Jul-26 and Aug-26", x: 74, y: 737 - meses.length * 13 - 5 });
  return { itens };
}

const MESES_2026 = ["Sep-25", "Oct-25", "Nov-25", "Dec-25", "Jan-26", "Feb-26", "Mar-26", "Apr-26", "May-26", "Jun-26", "Jul-26", "Aug-26"];

test("tabela 1: um mês por linha, as 7 colunas na ordem, terminando no mês do relatório", () => {
  const precos = lerPrecos([tabela1({ meses: MESES_2026, valores: (i) => [287.29 + i, 387.46, 361.31, 322.24, 180.63, 313.2, 167.63] })], "2026-08");
  assert.equal(precos.length, 12);
  assert.equal(precos[0].mes, "2025-09");
  assert.deepEqual(precos.at(-1), {
    mes: "2026-08",
    valores: { I_CIP: 298.29, COLOMBIAN_MILDS: 387.46, OTHER_MILDS: 361.31, BRAZILIAN_NATURALS: 322.24, ROBUSTAS: 180.63, NOVA_YORK: 313.2, LONDRES: 167.63 }
  });
});

test("tabela 1: rótulo abaixo dos números (ago/2020) e quebrado em pedaços (\"Ja n-14\", \"Jul -14\")", () => {
  assert.equal(lerPrecos([tabela1({ meses: ["Jul-20", "Aug-20"], rotuloAbaixo: true })], "2020-08").at(-1).mes, "2020-08");
  const quebrado = tabela1({ meses: ["Dec-13", "Jan-14"] });
  const jan = quebrado.itens.findIndex((it) => it.str === "Jan-14");
  quebrado.itens.splice(jan, 1, { str: "Ja", x: 74, y: quebrado.itens[jan].y }, { str: "n-14", x: 80, y: quebrado.itens[jan].y });
  assert.deepEqual(lerPrecos([quebrado], "2014-01").map((p) => p.mes), ["2013-12", "2014-01"]);
});

test("tabela 1 de 2012: mês por extenso com o ano numa linha própria, palavra por item, médias anuais de fora", () => {
  const itens = [
    ...linha(735.2, 170, "Table", "1:", "ICO", "indicator", "prices", "and", "futures", "prices"),
    { str: "Composite", x: 146.5, y: 695.1 },
    { str: "Colombian", x: 206.1, y: 708.2 },
    { str: "Other", x: 261.2, y: 695.1 },
    { str: "Milds", x: 287.8, y: 695.1 },
    { str: "Brazilian", x: 334.9, y: 708.2 },
    { str: "Robustas", x: 392.2, y: 695.1 },
    { str: "New", x: 444.9, y: 695.1 },
    { str: "York*", x: 466.3, y: 695.1 },
    { str: "London*", x: 513.9, y: 695.1 },
    ...linha(682.8, 79, "Monthly", "averages"),
    { str: "2011", x: 79, y: 670.6 },
    { str: "December", x: 79, y: 658.3 },
    ...linha(658.3, 163, "189.02", "251.60", "236.71", "228.79", "98.41", "227.23", "87.65"),
    { str: "2012", x: 79, y: 646 },
    { str: "January", x: 79, y: 633.7 },
    ...linha(633.7, 163, "188.90", "255.91", "237.21", "228.21", "96.72", "227.50", "84.19"),
    ...linha(621.4, 79, "Annual", "averages"),
    { str: "2011", x: 79, y: 609.1 },
    ...linha(609.1, 163, "210.39", "283.84", "271.07", "247.61", "109.21", "256.36", "101.23")
  ];
  const precos = lerPrecos([{ itens }], "2012-01");
  assert.deepEqual(precos.map((p) => p.mes), ["2011-12", "2012-01"]);
  assert.equal(precos[1].valores.LONDRES, 84.19);
});

test("tabela 1: travas de layout derrubam a tabela com o motivo", () => {
  assert.throws(() => lerPrecos([tabela1({ meses: ["Jul-26", "Aug-26"] })], "2026-09"), /não o do relatório/);
  assert.throws(() => lerPrecos([tabela1({ meses: ["May-26", "Aug-26"] })], "2026-08"), /fora de sequência/);
  assert.throws(() => lerPrecos([tabela1({ meses: ["Aug-26"], valores: () => [1, 2, 3, 4, 5, 6] })], "2026-08"), /6 números/);
  const semLondres = CABECALHO_2026.filter((c) => c.str !== "London*");
  assert.throws(() => lerPrecos([tabela1({ meses: ["Aug-26"], cabecalho: semLondres })], "2026-08"), /"london" ausente/);
  const trocado = CABECALHO_2026.map((c) => (c.str === "Robustas" ? { ...c, x: 500 } : c));
  assert.throws(() => lerPrecos([tabela1({ meses: ["Aug-26"], cabecalho: trocado })], "2026-08"), /fora da ordem/);
  assert.throws(() => lerPrecos([{ itens: [] }], "2026-08"), /não encontrada/);
});

function tabela5({ meses, dyLondres = 3.4 }) {
  return {
    itens: [
      { str: "Table 5: Certified stocks on the New York and London futures markets", x: 74, y: 310.7 },
      ...meses.map((m, i) => ({ str: m, x: 130 + i * 33, y: 298.9 })),
      { str: "New York", x: 74, y: 287.6 },
      ...meses.map((_, i) => ({ str: (0.5 + i / 100).toFixed(2), x: 140 + i * 33, y: 288.1 })),
      // ago/2026: "London" 3,4 pontos acima dos números.
      { str: "London", x: 74, y: 269.4 + dyLondres },
      ...meses.map((_, i) => ({ str: (1 + i / 100).toFixed(2), x: 140 + i * 33, y: 269.4 })),
      { str: "In million 60-kg bags", x: 74, y: 255 }
    ]
  };
}

test("tabela 5: Nova York e Londres por mês; rótulo de Londres solto acima dos números; meses juntos num item", () => {
  const estoques = lerEstoques([tabela5({ meses: ["Jul-26", "Aug-26"] })], "2026-08");
  assert.deepEqual(estoques, [
    { mes: "2026-07", valores: { NOVA_YORK: 0.5, LONDRES: 1 } },
    { mes: "2026-08", valores: { NOVA_YORK: 0.51, LONDRES: 1.01 } }
  ]);
  const juntos = tabela5({ meses: ["Jul-26 Aug-26"] });
  juntos.itens = juntos.itens.filter((it) => !(it.y === 288.1 || it.y === 269.4));
  juntos.itens.push({ str: "0.29", x: 140, y: 288.1 }, { str: "0.24", x: 173, y: 288.1 }, { str: "0.69", x: 140, y: 269.4 }, { str: "0.83", x: 173, y: 269.4 });
  assert.deepEqual(lerEstoques([juntos], "2026-08").at(-1), { mes: "2026-08", valores: { NOVA_YORK: 0.24, LONDRES: 0.83 } });
});

test("tabela 5: ausente (2012, era um gráfico) = sem estoques; números sem rótulo derrubam a tabela", () => {
  assert.deepEqual(lerEstoques([{ itens: [] }], "2012-10"), []);
  assert.throws(() => lerEstoques([tabela5({ meses: ["Aug-26"], dyLondres: 12 })], "2026-08"), /sem rótulo/);
});

test("lerRelatorio: uma tabela ilegível vira problema e a outra é lida", () => {
  const r = lerRelatorio([tabela1({ meses: ["Aug-26"] }), tabela5({ meses: ["Jun-26"] })], "2026-08");
  assert.equal(r.precos.length, 1);
  assert.deepEqual(r.estoques, []);
  assert.match(r.problemas[0], /estoques: o último mês é 2026-06/);
});

test("estoques que terminam no mês anterior ao relatório (fev/2020) são aceitos", () => {
  assert.equal(lerEstoques([tabela5({ meses: ["Dec-19", "Jan-20"] })], "2020-02").at(-1).mes, "2020-01");
});

test("preços sem título no texto (out/2023): achados pela linha Monthly averages com o cabeçalho acima", () => {
  const semTitulo = tabela1({ meses: ["Sep-23", "Oct-23"] });
  semTitulo.itens = semTitulo.itens.filter((it) => !it.str.startsWith("Table 1"));
  assert.deepEqual(lerPrecos([semTitulo], "2023-10").map((p) => p.mes), ["2023-09", "2023-10"]);
});

test("número partido em dois itens (\"12\" \"1.18\", abr/2019) e cabeçalho com palavra quebrada (\"Brazilia\" \"n\", dez/2021)", () => {
  const t = tabela1({ meses: ["Mar-19", "Apr-19"], cabecalho: CABECALHO_2026.map((c) => (c.str === "Brazilian" ? { ...c, str: "Brazilia" } : c)) });
  const i = t.itens.findIndex((it) => it.str === "3.00" && it.y < 730);
  t.itens.splice(i, 1, { str: "12", x: t.itens[i].x - 10, y: t.itens[i].y }, { str: "1.18", x: t.itens[i].x, y: t.itens[i].y });
  assert.equal(lerPrecos([t], "2019-04").at(-1).valores.OTHER_MILDS, 121.18);
});

test("estoques com o ano numa linha abaixo do mês (\"Sep-\" / \"20\") e \"New\" / \"York\" em linhas separadas (ago/2021)", () => {
  const itens = [
    { str: "Table 5: Certified stocks on the New York and London futures markets", x: 74, y: 310 },
    { str: "Jul-", x: 130, y: 298 },
    { str: "Aug-", x: 163, y: 298 },
    { str: "21", x: 131, y: 288 },
    { str: "21", x: 164, y: 288 },
    { str: "New", x: 74, y: 278 },
    { str: "York", x: 74, y: 268 },
    { str: "2.32", x: 140, y: 268 },
    { str: "2.31", x: 173, y: 268 },
    { str: "London", x: 74, y: 256 },
    { str: "2.43", x: 140, y: 253 },
    { str: "2.31", x: 173, y: 253 },
    { str: "In million 60-kg bags", x: 74, y: 240 }
  ];
  assert.deepEqual(lerEstoques([{ itens }], "2021-08"), [
    { mes: "2021-07", valores: { NOVA_YORK: 2.32, LONDRES: 2.43 } },
    { mes: "2021-08", valores: { NOVA_YORK: 2.31, LONDRES: 2.31 } }
  ]);
});

test("a frase \"certified stocks on the New York\" no texto corrido não é a tabela (out/2012)", () => {
  assert.deepEqual(lerEstoques([{ itens: [{ str: "Graph 5 shows certified stocks on the New York market", x: 74, y: 300 }] }], "2012-10"), []);
});

test("mesSeguinte vira o ano", () => {
  assert.equal(mesSeguinte("2025-12"), "2026-01");
  assert.equal(mesSeguinte("2026-08"), "2026-09");
});
