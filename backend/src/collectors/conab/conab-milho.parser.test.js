"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const {
  extrairLevantamento,
  extrairAbaDeSafra,
  extrairBalanco,
  lerPlanilha,
  slugRegiao,
  lerSafra,
  lerMesRotulo
} = require("./conab-milho.parser");

// --- fixtures no layout real das planilhas da Conab (conferido nas 15 do índice, 2026-09-21) ---

function abaDeSafra(dados, { nota = "Nota: Estimativa em setembro/2026.", unidadeArea = "mil ha", cabecalhoSafra = ["Safra 24/25", "Safra 25/26"] } = {}) {
  const [s1, s2] = cabecalhoSafra;
  return [
    [],
    [],
    [],
    [],
    ["REGIÃO/UF", `ÁREA (Em ${unidadeArea})`, null, null, "PRODUTIVIDADE (Em kg/ha)", null, null, "PRODUÇÃO (Em mil t)", null, null],
    [null, s1, s2, "VAR. %", s1, s2, "VAR. %", s1, s2, "VAR. %"],
    [null, "(a)", "(b)", "(b/a)", "(c)", "(d)", "(d/c)", "(e)", "(f)", "(f/e)"],
    ...dados,
    ["Fonte: Conab."],
    [nota],
    []
  ];
}

const DADOS_TOTAL = [
  ["NORTE", 1549.8, 1586.3, 2.4, 4971.89, 4949.13, -0.5, 7705.4, 7850.9, 1.9],
  ["RR", 20, 16, -20, 6000, 4500, -25, 120, 72, -40],
  ["CENTRO-OESTE", 11394.3, 11717.5, 2.8, 7329.97, 7070.4, -3.5, 83519.9, 82847.5, -0.8],
  ["MT", 7287.4, 7619.3, 4.6, 7620.85, 7687.98, 0.9, 55536.2, 58577.1, 5.5],
  ["NORTE/NORDESTE", 4533.8, 4566.1, 0.7, 3934.56, 4055.21, 3.1, 17838.5, 18516.5, 3.8],
  ["BRASIL", 21838, 22600.5, 3.5, 6463.85, 6371.96, -1.4, 141157.6, 144009.6, 2]
];

// 3ª safra: onde não há área, a produtividade vem em branco (" ", só espaços) e a produção é zero.
const DADOS_3A = [
  ["RO", 0, 0, 0, " ", " ", 0, 0, 0, 0],
  ["BRASIL", 635.1, 674.9, 6.3, 4713.61, 3542.61, -24.8, 2993.6, 2390.9, -20.1]
];

const SUPRIMENTO = [
  [],
  ["BRASIL"],
  ["BALANÇO DE OFERTA E DEMANDA"],
  [],
  ["PRODUTO", "SAFRA", null, "ESTOQUE INICIAL", "PRODUÇÃO", "IMPORTAÇÃO", "SUPRIMENTO", "CONSUMO", "EXPORTAÇÃO", "DEMANDA TOTAL", "ESTOQUE FINAL"],
  ["ALGODÃO", "2019/20", null, 1427.3, 3001.6, 2.2, 4431.1, 690, 2125.4, 2815.4, 1615.7],
  ["MILHO", "2023/24", null, 7201.3, 115534.6, 1644.7, 124380.6, 84106.16, 38500.9, 122607.06, 1773.54],
  [null, "2024/25", null, 1773.54, 141157.6, 1845.8, 144776.94, 91081.8, 41631.5, 132713.3, 12063.64],
  [null, "2025/26", "ago/26", 12063.64, 142955, 1700, 156718.64, 95041.4, 46500, 141541.4, 15177.24],
  [null, null, "set/26", 12063.64, 144009.6, 1700, 157773.24, 98203, 43916.2, 142119.2, 15654.04],
  ["TRIGO", "2020", null, 2238.4, 6234.6, 6007.8, 14480.8, 11599, 823.13, 12422.13, 2058.66]
];

function planilhaCompleta() {
  return [
    { nome: "Principal", linhas: [[]] },
    { nome: "Milho 1a", linhas: abaDeSafra(DADOS_TOTAL) },
    { nome: "Milho 2a", linhas: abaDeSafra(DADOS_TOTAL) },
    { nome: "Milho 3a", linhas: abaDeSafra(DADOS_3A) },
    { nome: "Milho Total", linhas: abaDeSafra(DADOS_TOTAL) },
    { nome: "Suprimento", linhas: SUPRIMENTO }
  ];
}

const achar = (r, serie, observedAt) => r.observacoes.find((o) => o.seriesCode === serie && o.observedAt === observedAt);

// --- pequenas funções ---

test("slugRegiao: macrorregião, combinações e UF", () => {
  assert.equal(slugRegiao("CENTRO-OESTE"), "CENTRO_OESTE");
  assert.equal(slugRegiao("NORTE/NORDESTE"), "NORTE_NORDESTE");
  assert.equal(slugRegiao("CENTRO-SUL"), "CENTRO_SUL");
  assert.equal(slugRegiao(" MT "), "MT");
});

test("lerSafra: 25/26 vira 2025/26 em 1º de setembro; rótulo que não é uma safra é recusado", () => {
  assert.deepEqual(lerSafra("25", "26"), { safra: "2025/26", observedAt: "2025-09-01" });
  assert.equal(lerSafra("24", "26"), null);
});

test("lerMesRotulo: set/26 -> setembro de 2026; texto qualquer -> null", () => {
  assert.deepEqual(lerMesRotulo("set/26"), { mes: 9, ano: 2026 });
  assert.equal(lerMesRotulo("2025/26"), null);
  assert.equal(lerMesRotulo(null), null);
});

// --- abas de safra ---

test("aba de safra: uma série por região × métrica × tipo, com as duas safras e a unidade do bloco", () => {
  const r = extrairAbaDeSafra(abaDeSafra(DADOS_TOTAL), "TOTAL");

  const producao = achar(r, "CONAB.MILHO.BRASIL.PRODUCAO_TOTAL", "2025-09-01");
  assert.equal(producao.valor, 144009.6);
  assert.equal(producao.unidade, "mil t");
  assert.equal(producao.safra, "2025/26");
  assert.equal(achar(r, "CONAB.MILHO.BRASIL.PRODUCAO_TOTAL", "2024-09-01").valor, 141157.6, "a safra anterior também entra");
  assert.equal(achar(r, "CONAB.MILHO.MT.AREA_TOTAL", "2025-09-01").unidade, "mil ha");
  assert.equal(achar(r, "CONAB.MILHO.MT.PRODUTIVIDADE_TOTAL", "2025-09-01").unidade, "kg/ha");
  // 6 linhas × 3 métricas × 2 safras
  assert.equal(r.observacoes.length, 36);
});

test("aba de safra: macrorregiões e combinações viram códigos próprios; a variação percentual NÃO é extraída", () => {
  const r = extrairAbaDeSafra(abaDeSafra(DADOS_TOTAL), "TOTAL");
  const regioes = new Set(r.observacoes.map((o) => o.regiao));

  assert.deepEqual([...regioes], ["NORTE", "RR", "CENTRO_OESTE", "MT", "NORTE_NORDESTE", "BRASIL"]);
  assert.ok(r.observacoes.every((o) => !o.seriesCode.includes("VAR")));
});

test("aba de safra: célula em branco (produtividade sem área) é ignorada; zero publicado é mantido", () => {
  const r = extrairAbaDeSafra(abaDeSafra(DADOS_3A), "3A");

  assert.equal(achar(r, "CONAB.MILHO.RO.PRODUTIVIDADE_3A", "2025-09-01"), undefined, "produtividade em branco não vira 0");
  assert.equal(achar(r, "CONAB.MILHO.RO.AREA_3A", "2025-09-01").valor, 0, "área zero é um valor publicado");
  assert.equal(r.invalidos.length, 0);
});

test("aba de safra: lê a estimativa da nota de rodapé", () => {
  assert.deepEqual(extrairAbaDeSafra(abaDeSafra(DADOS_TOTAL), "TOTAL").estimativa, { mes: 9, ano: 2026 });
});

test("aba de safra: as safras vêm do cabeçalho (levantamentos de outra safra funcionam)", () => {
  const r = extrairAbaDeSafra(abaDeSafra(DADOS_TOTAL, { cabecalhoSafra: ["Safra 23/24", "Safra 24/25"] }), "TOTAL");
  assert.deepEqual([...new Set(r.observacoes.map((o) => o.observedAt))].sort(), ["2023-09-01", "2024-09-01"]);
});

test("aba de safra: valor que não é número vai para os inválidos sem derrubar o resto", () => {
  const dados = [["BRASIL", 21838, "n/d", 3.5, 6463.85, 6371.96, -1.4, 141157.6, 144009.6, 2]];
  const r = extrairAbaDeSafra(abaDeSafra(dados), "TOTAL");

  assert.equal(r.invalidos.length, 1);
  assert.match(r.invalidos[0].motivo, /valor não numérico/);
  assert.equal(r.observacoes.length, 5);
});

test("aba de safra: unidade que mudou, ausência de BRASIL, cabeçalho ausente e safra inválida lançam erro claro", () => {
  assert.throws(() => extrairAbaDeSafra(abaDeSafra(DADOS_TOTAL, { unidadeArea: "ha" }), "TOTAL"), /unidade de AREA mudou/);
  assert.throws(() => extrairAbaDeSafra(abaDeSafra([["MT", 1, 2, 3, 4, 5, 6, 7, 8, 9]]), "TOTAL"), /linha BRASIL/);
  assert.throws(() => extrairAbaDeSafra([[], ["outra coisa"]], "TOTAL"), /REGIÃO\/UF/);
  assert.throws(() => extrairAbaDeSafra(abaDeSafra(DADOS_TOTAL, { cabecalhoSafra: ["Safra 24/26", "Safra 25/26"] }), "TOTAL"), /safra inválido/);
});

// --- balanço ---

test("balanço: uma série por métrica, safras desde a mais antiga, unidade mil t", () => {
  const r = extrairBalanco(SUPRIMENTO);

  const estoque = achar(r, "CONAB.MILHO.BALANCO.ESTOQUE_FINAL", "2024-09-01");
  assert.equal(estoque.valor, 12063.64);
  assert.equal(estoque.unidade, "mil t");
  assert.equal(achar(r, "CONAB.MILHO.BALANCO.CONSUMO", "2023-09-01").valor, 84106.16);
  assert.equal(achar(r, "CONAB.MILHO.BALANCO.ESTOQUE_INICIAL", "2023-09-01").valor, 7201.3);
  // 3 safras × 8 métricas
  assert.equal(r.observacoes.length, 24);
});

test("balanço: a safra em projeção tem duas linhas (mês anterior e atual): vale a última", () => {
  const r = extrairBalanco(SUPRIMENTO);

  assert.equal(achar(r, "CONAB.MILHO.BALANCO.PRODUCAO", "2025-09-01").valor, 144009.6, "set/26, não ago/26 (142955)");
  assert.deepEqual(r.mesAtual, { mes: 9, ano: 2026 });
});

test("balanço: só o bloco do milho (não mistura algodão nem trigo)", () => {
  const r = extrairBalanco(SUPRIMENTO);

  assert.ok(r.observacoes.every((o) => o.regiao === "BRASIL" && o.tipo === "BALANCO"));
  assert.equal(r.observacoes.some((o) => o.observedAt === "2020-09-01"), false, "a safra 2020 é do trigo");
});

test("balanço: layout diferente lança erro claro", () => {
  assert.throws(() => extrairBalanco([[], ["sem cabeçalho"]]), /PRODUTO \/ SAFRA/);
  assert.throws(() => extrairBalanco(SUPRIMENTO.filter((l) => l[0] !== "MILHO")), /bloco MILHO/);
  const semColuna = SUPRIMENTO.map((l, i) => (i === 4 ? l.map((c) => (c === "CONSUMO" ? "OUTRA" : c)) : l));
  assert.throws(() => extrairBalanco(semColuna), /colunas de balanço/);
});

// --- levantamento inteiro, a partir de uma planilha XLSX de verdade ---

test("extrairLevantamento: junta as 4 abas de safra e o balanço; produção do Brasil confere entre as duas abas", () => {
  const r = extrairLevantamento(planilhaCompleta());

  // 4 abas de safra (36 cada, exceto a 3ª: 2 linhas × 3 métricas × 2 safras - 2 produtividades em branco = 10) + 24 do balanço
  assert.equal(r.observacoes.length, 36 * 3 + 10 + 24);
  assert.deepEqual(r.estimativa, { mes: 9, ano: 2026 });
  assert.deepEqual(r.mesBalanco, { mes: 9, ano: 2026 });
  const total = achar(r, "CONAB.MILHO.BRASIL.PRODUCAO_TOTAL", "2025-09-01").valor;
  const balanco = achar(r, "CONAB.MILHO.BALANCO.PRODUCAO", "2025-09-01").valor;
  assert.equal(total, balanco);
});

test("extrairLevantamento: falta de uma aba esperada é erro", () => {
  const semTerceira = planilhaCompleta().filter((aba) => aba.nome !== "Milho 3a");
  assert.throws(() => extrairLevantamento(semTerceira), /"Milho 3a" não encontrada/);
});

test("lerPlanilha + extrairLevantamento leem um XLSX de verdade (ida e volta pelo arquivo)", () => {
  const wb = XLSX.utils.book_new();
  for (const aba of planilhaCompleta()) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aba.linhas), aba.nome);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const r = extrairLevantamento(lerPlanilha(buffer));

  assert.equal(achar(r, "CONAB.MILHO.MT.PRODUCAO_2A", "2025-09-01").valor, 58577.1);
  assert.equal(achar(r, "CONAB.MILHO.BALANCO.ESTOQUE_FINAL", "2025-09-01").valor, 15654.04);
  assert.equal(r.invalidos.length, 0);
});
