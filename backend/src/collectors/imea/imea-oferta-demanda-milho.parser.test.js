"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const parser = require("./imea-oferta-demanda-milho.parser");

// Fixtures compactas que reproduzem o layout REAL do PDF "Oferta e Demanda - Milho" do IMEA (x/y de
// cada texto, capturados com pdfjs-dist em edições reais), inclusive os desvios já encontrados:
// baseline de Y diferente entre rótulo e números, rótulo partido em 2 itens de texto, formato de
// safra com 2 ou 4 dígitos no 2º ano, e as colunas de variação percentual (decorativas, a ignorar).

function item(str, x, y) {
  return { str, x, y };
}

// Edição de 2014-04-14 (a mais antiga do catálogo): 3 safras, rótulo e números na MESMA linha.
const PAGINA_2014 = {
  itens: [
    item("2011/12", 267.9, 678),
    item("2012/13", 329, 678),
    item("2013/14*", 389.5, 678),
    item("12/13 e 13/14", 459.6, 672), // decorativo (sub-cabeçalho da coluna de variação) - não é safra
    item("Oferta", 92.1, 657),
    item("18,58", 273.9, 657),
    item("22,67", 335, 657),
    item("15,34", 398, 657),
    item("-", 478.7, 657),
    item("32%", 481.7, 657),
    item("Estoque Inicial", 92.1, 640),
    item("0,1", 278.9, 640),
    item("0,1", 340, 640),
    item("0,1", 403, 640),
    item("-", 478.7, 640),
    item("16%", 481.7, 640),
    item("Importação", 92.1, 623),
    item("0,0", 278.9, 623),
    item("0,0", 340, 623),
    item("0,0", 403, 623),
    item("-", 487.3, 623),
    item("Produção", 92.1, 607),
    item("18,5", 276.4, 607),
    item("22,5", 337.5, 607),
    item("15,2", 400.5, 607),
    item("-", 478.7, 607),
    item("32%", 481.7, 607),
    item("Demanda", 92.1, 590),
    item("18,45", 273.9, 590),
    item("22,56", 335, 590),
    item("15,25", 398, 590),
    item("-", 478.7, 590),
    item("32%", 481.7, 590),
    item("Consumo MT", 92.1, 573),
    item("3,0", 278.9, 573),
    item("3,1", 340, 573),
    item("3,5", 403, 573),
    item("15%", 480.2, 573),
    item("Consumo Interestadual", 92.1, 557),
    item("2,5", 278.9, 557),
    item("3,0", 340, 557),
    item("3,6", 403, 557),
    item("20%", 480.2, 557),
    item("Exportação", 92.1, 540),
    item("13,0", 276.4, 540),
    item("14,1", 337.5, 540),
    item("8,0", 403, 540),
    item("-", 478.7, 540),
    item("43%", 481.7, 540),
    item("Aquisições públicas", 92.1, 524),
    item("0,0", 278.9, 524),
    item("2,3", 340, 524),
    item("0,1", 403, 524),
    item("-", 478.7, 524),
    item("96%", 481.7, 524),
    item("Estoque Final", 92.1, 507),
    item("0,13", 276.4, 507),
    item("0,11", 337.5, 507),
    item("0,09", 400.5, 507),
    item("-", 478.7, 507),
    item("18%", 481.7, 507)
  ]
};

// Edição de 2020-12-14: rótulo e números da MESMA linha em baselines Y diferentes (achado real desta
// investigação - ex.: "Estoque Inicial" em y=657, números em y=655).
const PAGINA_2020_OFFSET_Y = {
  itens: [
    item("2017/18", 226.2, 686),
    item("2018/19", 281.1, 686),
    item("2019/20", 332.8, 686),
    item("*", 367.3, 686),
    item("2020/21*", 390.4, 686),
    item("∆", 454, 686), // token isolado de variação - não casa com o padrão de safra
    item("19/20 e 20/21", 462.2, 686),
    item("Estoque Inicial", 88.6, 657),
    item("0,03", 238.9, 655), // números 2pt abaixo do rótulo - dentro da tolerância
    item("0,04", 289.6, 655),
    item("0,01", 343.6, 655),
    item("0,02", 401.2, 655),
    item("20,13%", 472.5, 655)
  ]
};

// Edição de 2019-12-16: rótulo partido em 2 itens de texto ("Consumo" + "Interestadual") e cabeçalho
// com o 2º ano da safra em 2 dígitos.
const PAGINA_2019_ROTULO_PARTIDO = {
  itens: [
    item("2015/16", 191.6, 687),
    item("2016/17", 241.3, 687),
    item("2017/18", 290.8, 687),
    item("2018/19*", 340.8, 687),
    item("2019/20*", 396.2, 687),
    item("Estoque Inicial", 66.6, 661),
    item("0,06", 200, 661),
    item("0,02", 249.7, 661),
    item("0,03", 299.2, 661),
    item("0,04", 351.8, 661),
    item("0,01", 407.2, 661),
    item("Consumo", 66.6, 598),
    item("Interestadual", 107.1, 598),
    item("6,79", 200, 598),
    item("4,34", 249.7, 598),
    item("4,20", 299.2, 598),
    item("2,51", 351.8, 598),
    item("2,15", 407.2, 598),
    item("-", 471.1, 598),
    item("14,34%", 474.1, 598)
  ]
};

// Edição de 2023-04-03: cabeçalho com o 2º ano em 4 dígitos ("2019/2020") e uma linha DECORATIVA
// acima do cabeçalho real, com "ꓥ" e o ano com ESPAÇO dentro ("2020 / 2021") - não pode ser
// confundida com o cabeçalho de verdade.
const PAGINA_2023_ANO_4_DIGITOS = {
  itens: [
    item("ꓥ", 390.6, 648),
    item("2020 / 2021", 397.3, 648), // decorativo: tem espaço dentro do ano, não casa com \d{4}/\d{2,4}
    item("ꓥ", 460.8, 648),
    item("2021 / 2022", 467.5, 648),
    item("2019/2020", 151.5, 642),
    item("2020/2021", 207.1, 642),
    item("2021/2022*", 264, 642),
    item("2022/2023*", 325, 642),
    item("Estoque inicial", 58.9, 615), // grafia com "i" minúsculo, como em algumas edições
    item("0,01", 164.8, 615),
    item("0,01", 220.4, 615),
    item("0,02", 279, 615),
    item("0,24", 340, 615)
  ]
};

function paginaComProsa() {
  return { itens: [item("Relatório mensal do IMEA sobre o milho em Mato Grosso.", 85.1, 700)] };
}

// Edição de 2022-07-18: achado real (a única entre as ~77 do catálogo, junto com 2022-04-18, com esse
// problema) - o PDF quebra números em VÁRIOS itens de texto, às vezes dígito a dígito numa
// porcentagem, tanto na tabela quanto no texto corrido ao redor dela. Cabeçalho não é afetado.
const PAGINA_2022_FRAGMENTADA = {
  itens: [
    item("consumo MT foi reajustado e ficou previsto em", 85.1, 511), // prosa com número fragmentado no meio - rótulo não bate, ignorada
    item("11,", 380.7, 511),
    item("36", 394.5, 511),
    item("milhões de toneladas", 409.5, 511),
    item("2018/19", 192.8, 701),
    item("2019/20", 235.9, 701),
    item("2020/21", 281.9, 701),
    item("2021/22*", 328.6, 701),
    item("Estoque Inicial", 74.4, 667),
    item("0,04", 201.2, 667),
    item("0,01", 244.3, 667),
    item("0,01", 290.5, 667),
    item("0,01", 339.7, 667),
    item("Consumo MT", 74.4, 602),
    item("8,19", 201.2, 602),
    item("9,", 244.3, 602),
    item("95", 251.8, 602),
    item("1", 287.9, 602),
    item("0,97", 293, 602),
    item("1", 337.2, 602),
    item("1", 342.2, 602),
    item(",", 347.2, 602),
    item("92", 349.8, 602),
    item("1", 399.7, 602), // início da coluna de variação (delta), dígito a dígito
    item("0", 404.7, 602),
    item(",", 409.8, 602),
    item("26", 412.3, 602),
    item("%", 422.4, 602)
  ]
};

// --- funções puras auxiliares ---

test("lerSafra: normaliza o 2º ano para 2 dígitos e reconhece o asterisco de estimativa", () => {
  assert.deepEqual(parser.lerSafra("2011/12"), { safra: "2011/12", anoInicial: 2011, estimativa: false });
  assert.deepEqual(parser.lerSafra("2019/2020"), { safra: "2019/20", anoInicial: 2019, estimativa: false });
  assert.deepEqual(parser.lerSafra("2020/21*"), { safra: "2020/21", anoInicial: 2020, estimativa: true });
  assert.equal(parser.lerSafra("∆"), null);
  assert.equal(parser.lerSafra("2020 / 2021"), null); // espaço dentro do ano: não é cabeçalho de safra
  assert.equal(parser.lerSafra("12/13 e 13/14"), null);
});

test("numero: vírgula decimal, \"-\" é ausência (não zero), texto não numérico é inválido (NaN)", () => {
  assert.equal(parser.numero("0,17"), 0.17);
  assert.equal(parser.numero("-33,87"), -33.87);
  assert.equal(parser.numero("-"), null);
  assert.equal(parser.numero(""), null);
  assert.ok(Number.isNaN(parser.numero("N/D")));
});

test("agruparLinhas: junta itens cujo Y difere até a tolerância, nunca por igualdade exata", () => {
  const linhas = parser.agruparLinhas(PAGINA_2020_OFFSET_Y.itens);
  const linhaDados = linhas.find((l) => l.itens.some((it) => it.str === "Estoque Inicial"));
  assert.ok(linhaDados, "rótulo (y=657) e números (y=655) deveriam cair na mesma linha agrupada");
  assert.ok(linhaDados.itens.some((it) => it.str === "0,03"));
});

test("acharCabecalho: pega a linha com MAIS colunas de safra, ignorando a linha decorativa (\"ꓥ\", ano com espaço)", () => {
  const linhas = parser.agruparLinhas(PAGINA_2023_ANO_4_DIGITOS.itens);
  const cabecalho = parser.acharCabecalho(linhas);
  assert.equal(cabecalho.colunas.length, 4);
  assert.deepEqual(
    cabecalho.colunas.map((c) => c.safra),
    ["2019/20", "2020/21", "2021/22", "2022/23"]
  );
});

// --- extrairBalanco (função principal) ---

test("extrairBalanco: edição de 2014 (3 safras, rótulo e valores na mesma linha) - as 10 métricas, sem inválidos", () => {
  const { linhas, invalidos } = parser.extrairBalanco([PAGINA_2014]);
  assert.deepEqual(invalidos, []);
  assert.deepEqual(Object.keys(linhas).sort(), ["AQUISICOES_PUBLICAS", "CONSUMO_INTERESTADUAL", "CONSUMO_MT", "DEMANDA", "ESTOQUE_FINAL", "ESTOQUE_INICIAL", "EXPORTACAO", "IMPORTACAO", "OFERTA", "PRODUCAO"].sort());
  assert.deepEqual(linhas.ESTOQUE_FINAL["2013/14"], { valor: 0.09, texto: "0,09", estimativa: true, anoInicial: 2013 });
  assert.deepEqual(linhas.PRODUCAO["2011/12"], { valor: 18.5, texto: "18,5", estimativa: false, anoInicial: 2011 });
  // A coluna de variação ("-", "32%") não vira dado: só 3 safras por métrica, não 5.
  assert.equal(Object.keys(linhas.OFERTA).length, 3);
});

test("extrairBalanco: rótulo e números em baselines Y diferentes (2020) ainda casam na mesma linha", () => {
  // Precisa da âncora "Estoque Inicial" acima do cabeçalho reconhecido: injeta o cabeçalho antes.
  const pagina = { itens: PAGINA_2020_OFFSET_Y.itens };
  const { linhas, invalidos } = parser.extrairBalanco([pagina]);
  assert.deepEqual(invalidos, []);
  assert.deepEqual(linhas.ESTOQUE_INICIAL["2020/21"], { valor: 0.02, texto: "0,02", estimativa: true, anoInicial: 2020 });
  // A variação ("∆", "20,13%") não é uma safra: só 4 colunas de dado, não 5.
  assert.equal(Object.keys(linhas.ESTOQUE_INICIAL).length, 4);
});

test("extrairBalanco: rótulo partido em 2 itens de texto (\"Consumo\" + \"Interestadual\") é reconhecido", () => {
  const { linhas, invalidos } = parser.extrairBalanco([PAGINA_2019_ROTULO_PARTIDO]);
  assert.deepEqual(invalidos, []);
  assert.deepEqual(linhas.CONSUMO_INTERESTADUAL["2019/20"], { valor: 2.15, texto: "2,15", estimativa: true, anoInicial: 2019 });
});

test("extrairBalanco: cabeçalho com ano de 4 dígitos (\"2019/2020\") normaliza a safra para 2 dígitos", () => {
  const { linhas, invalidos } = parser.extrairBalanco([PAGINA_2023_ANO_4_DIGITOS]);
  assert.deepEqual(invalidos, []);
  assert.deepEqual(Object.keys(linhas.ESTOQUE_INICIAL).sort(), ["2019/20", "2020/21", "2021/22", "2022/23"]);
});

test("extrairBalanco: só lê a PRIMEIRA página com a âncora - páginas de prosa antes são ignoradas", () => {
  const { linhas, invalidos } = parser.extrairBalanco([paginaComProsa(), PAGINA_2014]);
  assert.deepEqual(invalidos, []);
  assert.ok(linhas.ESTOQUE_FINAL);
});

test("extrairBalanco: rótulo desconhecido é ignorado (não quebra a edição)", () => {
  const comLinhaEstranha = {
    itens: [...PAGINA_2014.itens, item("Nota de rodapé qualquer", 85.1, 490), item("123", 200, 490)]
  };
  const { linhas, invalidos } = parser.extrairBalanco([comLinhaEstranha]);
  assert.deepEqual(invalidos, []);
  assert.equal(Object.keys(linhas).length, 10);
});

test("mesclarFragmentosNumericos: remonta fragmentos adjacentes (\"11,\"+\"36\") e dígito a dígito numa %, sem tocar em texto", () => {
  const itens = [item("Consumo MT", 74.4, 602), item("11,", 302.1, 602), item("36", 314.7, 602), item("1", 399.7, 602), item("0", 404.7, 602), item(",", 409.8, 602), item("26", 412.3, 602), item("%", 422.4, 602)];
  const mesclados = parser.mesclarFragmentosNumericos(itens);
  assert.deepEqual(
    mesclados.map((i) => i.str),
    ["Consumo MT", "11,36", "10,26%"]
  );
  // O X do token remontado é o do PRIMEIRO fragmento (posição real da coluna).
  assert.equal(mesclados[1].x, 302.1);
});

test("mesclarFragmentosNumericos: gap grande entre dois valores completos não funde um no outro", () => {
  const itens = [item("8,19", 201.2, 602), item("9,95", 244.3, 602)]; // gap 43.1pt: bem maior que o de um fragmento
  const mesclados = parser.mesclarFragmentosNumericos(itens);
  assert.deepEqual(
    mesclados.map((i) => i.str),
    ["8,19", "9,95"]
  );
});

test("extrairBalanco: edição de 2022-07-18 (números fragmentados na tabela E na prosa ao redor) lê os valores certos", () => {
  const { linhas, invalidos } = parser.extrairBalanco([PAGINA_2022_FRAGMENTADA]);
  assert.deepEqual(invalidos, []);
  // A prosa com "11," + "36" no meio da frase não vira dado: o rótulo (a frase inteira) não bate com nada do dicionário.
  assert.deepEqual(linhas.CONSUMO_MT, {
    "2018/19": { valor: 8.19, texto: "8,19", estimativa: false, anoInicial: 2018 },
    "2019/20": { valor: 9.95, texto: "9,95", estimativa: false, anoInicial: 2019 },
    "2020/21": { valor: 10.97, texto: "10,97", estimativa: false, anoInicial: 2020 },
    "2021/22": { valor: 11.92, texto: "11,92", estimativa: true, anoInicial: 2021 }
  });
});

test("extrairBalanco: nenhuma página com a âncora \"Estoque Inicial\" - inválido explícito, não sucesso vazio", () => {
  const { linhas, invalidos } = parser.extrairBalanco([paginaComProsa()]);
  assert.deepEqual(linhas, {});
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /não encontrada/);
});

test("extrairBalanco: âncora encontrada mas sem cabeçalho de safra reconhecível acima - inválido explícito", () => {
  const semCabecalho = { itens: PAGINA_2014.itens.filter((it) => !/^\d{4}\//.test(it.str)) };
  const { linhas, invalidos } = parser.extrairBalanco([semCabecalho]);
  assert.deepEqual(linhas, {});
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /cabeçalho de safra/);
});
