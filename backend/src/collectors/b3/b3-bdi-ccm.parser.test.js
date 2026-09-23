"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const parser = require("./b3-bdi-ccm.parser");

// Fixtures que reproduzem os itens de texto REAIS (str, x, y) extraídos pelo pdfjs dos boletins de
// 2023-01-16 (padrão numérico americano) e 2024-07-15 (padrão brasileiro). Cada linha é
// [y, [str, x], [str, x], ...].
const linha = (y, ...itens) => itens.map(([str, x]) => ({ str, x, y }));

const CABECALHO = (y) => [
  ...linha(y, ["Contratos", 80.1], ["Negócios", 125.9], ["Contratos", 170.8], ["Preço de", 251.5], ["Preço", 291.2], ["Preço", 322.6], ["Preço", 350.4], ["Último", 375.9], ["Variação em", 426], ["Última Oferta", 475.3], ["Última Oferta", 525.9]),
  ...linha(y - 4, ["Vencimento", 28.1], ["Volume", 215], ["Ajuste", 401.7]),
  ...linha(y - 7, ["em Aberto", 77.7], ["Realizados", 120.9], ["Negociados", 165.1], ["Abertura", 250.5], ["Mínimo", 285.2], ["Máximo", 315.4], ["Médio", 348.8], ["Preço", 379.4], ["Pontos", 442.5], ["de Compra", 483.1], ["de Venda", 538.5])
];

const TITULO = (y) => linha(y, ["CCM: Milho com Liquidação Financeira (Contrato = 450 Sacas; Cotação = R$/60kg)", 28.1]);
const RODAPE = (texto) => linha(14, ["34", 303.1], [texto, 343.4]);

// 2023-01-16: F23 completo, F24 só com ajuste (sem negócio), H23 com "contratos + volume" colados num
// item só (achado real), e a tabela de opções de compra depois (mesmo título, deve ser ignorada).
function pagina2023({ referencia = "REFERENTE A SEGUNDA-FEIRA - 16 DE JANEIRO DE 2023 - Nº 11" } = {}) {
  return {
    itens: [
      ...linha(799, ["BDI", 28.1]),
      ...TITULO(481),
      ...linha(459, ["Mercado Futuro", 28.1]),
      ...CABECALHO(446),
      ...linha(428, ["F23", 28.1], ["9,677", 95.2], ["360", 143.7], ["1,020", 186.8], ["39,894,242", 207.7], ["87.04", 262.1], ["86.80", 292.8], ["87.04", 324.2], ["86.91", 354], ["86.84", 381], ["86.71", 407.6], ["-0.29↓", 446.4], ["86.82", 501.4], ["86.84", 550.7]),
      ...linha(417, ["F24", 28.1], ["654", 99.9], ["-", 152.4], ["-", 199.3], ["-", 237.2], ["-", 276.4], ["-", 307], ["-", 338.5], ["-", 366.3], ["-", 395.3], ["93.73", 406.8], ["0.00", 451.4], ["93.71", 503.4], ["94.55", 551.5]),
      ...linha(407, ["H23", 28.1], ["28,625", 91.9], ["2,383", 139.5], ["3,512 145,828,089", 188], ["92.05", 263], ["91.81", 296.3], ["92.80", 324.7], ["92.27", 353.3], ["92.55", 382.5], ["92.54", 406.3], ["0.31↑", 450.2], ["92.51", 503.5], ["92.55", 552.1]),
      ...TITULO(324),
      ...linha(302, ["Mercado de Opções Sobre Futuro - Compra", 28.1]),
      ...linha(271, ["FRID", 28.1]),
      ...linha(267, ["511", 105.1], ["-", 152.9], ["0.01↑", 448.4]),
      ...RODAPE(referencia)
    ]
  };
}

function pagina2024() {
  return {
    itens: [
      ...TITULO(395),
      ...linha(373, ["Mercado Futuro", 28.1]),
      ...CABECALHO(360),
      ...linha(342, ["F25", 28.1], ["10.653", 94], ["235", 145], ["410", 191], ["12.032.226", 208], ["65,26", 262], ["64,95", 293], ["65,50", 324], ["65,21", 354], ["65,17", 381], ["65,38", 407], ["-0,36↓", 446], ["65,14", 501], ["65,29", 551]),
      ...linha(291, ["U24", 28.1], ["67.769", 92], ["5.102", 141], ["8.437 219.459.834", 188], ["58,41", 262], ["57,35", 293], ["58,50", 324], ["57,80", 354], ["57,75", 381], ["57,96", 407], ["-0,45↓", 446], ["57,75", 501], ["57,80", 551]),
      ...TITULO(239),
      ...linha(217, ["Mercado de Opções Sobre Futuro - Compra", 28.1]),
      ...RODAPE("REFERENTE A SEGUNDA-FEIRA - 15 DE JULHO DE 2024 - Nº 135")
    ]
  };
}

test("extrairFuturosCcm lê a tabela de 2023 (padrão americano) com os 10 campos por vencimento", () => {
  const r = parser.extrairFuturosCcm([pagina2023()]);

  assert.equal(r.situacao, "ok");
  assert.equal(r.dataReferencia, "2023-01-16");
  assert.equal(r.formato, "en");
  assert.equal(r.invalidos.length, 0);
  assert.deepEqual(r.linhas[0], {
    vencimento: "F23",
    valores: { OPEN_INTEREST: 9677, TRADES: 360, CONTRACTS: 1020, VOLUME_BRL: 39894242, OPEN: 87.04, LOW: 86.8, HIGH: 87.04, AVG: 86.91, LAST: 86.84, SETTLE: 86.71 }
  });
});

test("extrairFuturosCcm: vencimento sem negócio no dia só tem contratos em aberto e ajuste", () => {
  const f24 = parser.extrairFuturosCcm([pagina2023()]).linhas.find((l) => l.vencimento === "F24");

  assert.deepEqual(f24.valores, { OPEN_INTEREST: 654, TRADES: null, CONTRACTS: null, VOLUME_BRL: null, OPEN: null, LOW: null, HIGH: null, AVG: null, LAST: null, SETTLE: 93.73 });
});

test("extrairFuturosCcm separa duas células que o PDF colou num item só (contratos + volume)", () => {
  const h23 = parser.extrairFuturosCcm([pagina2023()]).linhas.find((l) => l.vencimento === "H23");

  assert.equal(h23.valores.CONTRACTS, 3512);
  assert.equal(h23.valores.VOLUME_BRL, 145828089);
  assert.equal(h23.valores.OPEN, 92.05);
});

test("extrairFuturosCcm lê a tabela de 2024 (padrão brasileiro) e ignora a tabela de opções logo abaixo", () => {
  const r = parser.extrairFuturosCcm([pagina2024()]);

  assert.equal(r.situacao, "ok");
  assert.equal(r.formato, "pt");
  assert.deepEqual(r.linhas.map((l) => l.vencimento), ["F25", "U24"]);
  assert.deepEqual(r.linhas[1].valores, { OPEN_INTEREST: 67769, TRADES: 5102, CONTRACTS: 8437, VOLUME_BRL: 219459834, OPEN: 58.41, LOW: 57.35, HIGH: 58.5, AVG: 57.8, LAST: 57.75, SETTLE: 57.96 });
});

test("extrairFuturosCcm continua a tabela na página seguinte, pulando o cabeçalho repetido", () => {
  const primeira = pagina2023();
  // Corta a 1ª página depois do F23 e leva F24/H23 para a próxima, com o cabeçalho repetido.
  const itensPrimeira = primeira.itens.filter((it) => it.y >= 428 || it.y === 14);
  const itensSegunda = [
    ...linha(799, ["BDI", 28.1]),
    ...CABECALHO(778),
    ...primeira.itens.filter((it) => it.y < 428 && it.y > 14).map((it) => ({ ...it, y: it.y + 340 }))
  ];

  const r = parser.extrairFuturosCcm([{ itens: itensPrimeira }, { itens: itensSegunda }]);

  assert.equal(r.situacao, "ok");
  assert.deepEqual(r.linhas.map((l) => l.vencimento), ["F23", "F24", "H23"]);
});

test("extrairFuturosCcm: título no pé de uma página e 'Mercado Futuro' no topo da seguinte (achado real, 2024-03-11)", () => {
  const original = pagina2023();
  const primeira = { itens: [...linha(170, ["X24P002200", 28.1]), ...TITULO(138), ...RODAPE("REFERENTE A SEGUNDA-FEIRA - 16 DE JANEIRO DE 2023 - Nº 11")] };
  const segunda = { itens: [...linha(799, ["BDI", 28.1]), ...original.itens.filter((it) => it.y <= 459 && it.y > 14).map((it) => ({ ...it, y: it.y + 300 }))] };

  const r = parser.extrairFuturosCcm([primeira, segunda]);

  assert.equal(r.situacao, "ok");
  assert.deepEqual(r.linhas.map((l) => l.vencimento), ["F23", "F24", "H23"]);
});

test("extrairFuturosCcm aceita o cabeçalho quebrado como 'Contratos em' / 'Aberto' (achado real, 2024-08-15)", () => {
  const pagina = pagina2023();
  pagina.itens.find((it) => it.str === "Contratos" && it.x === 80.1).str = "Contratos em";
  pagina.itens.find((it) => it.str === "em Aberto").str = "Aberto";

  const r = parser.extrairFuturosCcm([pagina]);

  assert.equal(r.situacao, "ok");
  assert.equal(r.linhas.length, 3);
});

test("extrairFuturosCcm: número fora do formato da tabela é inválido, nunca reinterpretado", () => {
  const pagina = pagina2023();
  // "1.020" numa tabela em padrão americano não pode virar 1,02 nem 1020.
  pagina.itens.find((it) => it.str === "1,020").str = "1.020";

  const r = parser.extrairFuturosCcm([pagina]);

  assert.deepEqual(r.linhas.map((l) => l.vencimento), ["F24", "H23"]);
  assert.equal(r.invalidos.length, 1);
  assert.match(r.invalidos[0].motivo, /Contratos Negociados="1\.020"/);
});

test("extrairFuturosCcm rejeita linha com contagem de valores diferente de 13 (coluna faltando ou sobrando)", () => {
  const pagina = pagina2023();
  pagina.itens = pagina.itens.filter((it) => !(it.y === 428 && it.str === "86.82"));

  const r = parser.extrairFuturosCcm([pagina]);

  assert.equal(r.invalidos.length, 1);
  assert.equal(r.invalidos[0].vencimento, "F23");
  assert.match(r.invalidos[0].motivo, /12 valores em vez de 13/);
});

test("extrairFuturosCcm rejeita linha incoerente (mínimo acima do máximo = coluna deslocada)", () => {
  const pagina = pagina2023();
  pagina.itens.find((it) => it.y === 428 && it.str === "86.80").str = "88.00";

  const r = parser.extrairFuturosCcm([pagina]);

  assert.equal(r.invalidos.length, 1);
  assert.match(r.invalidos[0].motivo, /Mínimo \(88\) maior que o máximo \(87\.04\)/);
});

test("extrairFuturosCcm: cabeçalho com colunas diferentes é erro de layout, não leitura na ordem errada", () => {
  const pagina = pagina2023();
  pagina.itens.find((it) => it.str === "Ajuste").str = "Preço de Referência";

  const r = parser.extrairFuturosCcm([pagina]);

  assert.equal(r.situacao, "erro");
  assert.match(r.motivo, /faltando: Ajuste/);
});

test("extrairFuturosCcm: boletim sem a tabela (capítulo ausente) e boletim no layout novo são 'sem_tabela'", () => {
  const semCapitulo = parser.extrairFuturosCcm([{ itens: linha(700, ["REFERENTE A SEGUNDA-FEIRA - 03 DE JULHO DE 2023 - Nº 125", 100]) }]);
  const layoutNovo = parser.extrairFuturosCcm([
    { itens: [...linha(40, ["PREGÃO ELETRÔNICO", 20], ["COMMODITIES", 150], ["CCM: MILHO", 250], ["FUTURO", 500]), ...linha(10, ["REFERENTE A SEXTA-FEIRA - 12 DE DEZEMBRO DE 2025 - Nº 240", 300])] }
  ]);

  assert.equal(semCapitulo.situacao, "sem_tabela");
  assert.equal(semCapitulo.dataReferencia, "2023-07-03");
  assert.match(semCapitulo.motivo, /sem a tabela/);
  assert.equal(layoutNovo.situacao, "sem_tabela");
  assert.match(layoutNovo.motivo, /layout novo/);
});

test("extrairDataReferencia lê a data do rodapé, inclusive mês com acento (MARÇO)", () => {
  assert.equal(parser.extrairDataReferencia([{ itens: linha(10, ["REFERENTE A SEGUNDA-FEIRA - 21 DE MARÇO DE 2022 - Nº 54", 300]) }]), "2022-03-21");
  assert.equal(parser.extrairDataReferencia([{ itens: linha(10, ["sem data", 300]) }]), null);
});

test("lerNumero valida pelo formato da tabela: milhar e decimal nunca se confundem", () => {
  assert.equal(parser.lerNumero("39,894,242", "inteiro", "en"), 39894242);
  assert.equal(parser.lerNumero("12.032.226", "inteiro", "pt"), 12032226);
  assert.equal(parser.lerNumero("65,26", "decimal", "pt"), 65.26);
  assert.equal(parser.lerNumero("87.04", "decimal", "en"), 87.04);
  assert.equal(parser.lerNumero("-", "decimal", "en"), null);
  assert.ok(Number.isNaN(parser.lerNumero("65,26", "decimal", "en")));
  assert.ok(Number.isNaN(parser.lerNumero("1,020", "inteiro", "pt")));
});

test("detectarFormato decide pela coluna de ajuste e recusa tabela ambígua", () => {
  const en = ["1", "-", "-", "-", "-", "-", "-", "-", "-", "86.71", "0.00", "-", "-"];
  const pt = ["1", "-", "-", "-", "-", "-", "-", "-", "-", "65,38", "0,00", "-", "-"];
  assert.equal(parser.detectarFormato([en]), "en");
  assert.equal(parser.detectarFormato([pt]), "pt");
  assert.equal(parser.detectarFormato([en, pt]), null);
});
