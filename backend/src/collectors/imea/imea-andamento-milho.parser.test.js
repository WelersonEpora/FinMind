"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extrairAndamento, lerData } = require("./imea-andamento-milho.parser");

// Itens com coordenada que reproduzem os layouts reais (posições e textos tirados dos PDFs do catálogo, 2026-10-01).
const it = (str, x, y) => ({ str, x, y });
function linha(y, rotulo, xRotulo, valores, xs) {
  return [it(rotulo, xRotulo, y), ...valores.map((v, i) => it(v, xs[i], y))];
}

// Layout novo (2025/26): "dd/mmm/aa", "Δ Semanal" e a linha da safra anterior depois das semanas.
const XS_NOVO = [140, 190, 238, 284, 332, 379, 425, 480];
const CAB_NOVO = ["Centro-Sul", "Médio-Norte", "Nordeste", "Noroeste", "Norte", "Oeste", "Sudeste", "Mato Grosso"];
const PAGINAS_NOVO = [
  { itens: [it("RELATÓRIO DA", 100, 700)] },
  {
    itens: [
      ...linha(600, "Regiões do IMEA", 66, CAB_NOVO, XS_NOVO.map((x) => x - 4)),
      ...linha(585, "06/fev/26", 76, ["23,50%", "38,23%", "20,10%", "29,05%", "32,78%", "30,38%", "12,39%", "28,30%"], XS_NOVO),
      ...linha(570, "13/fev/26", 76, ["37,14%", "62,24%", "31,18%", "50,35%", "46,54%", "54,17%", "22,47%", "46,07%"], XS_NOVO),
      ...linha(555, "Δ Semanal*", 76, ["1,41 p.p.", "0,00 p.p."], XS_NOVO),
      ...linha(540, "21/mar/25", 76, ["100,00%", "100,00%", "100,00%", "100,00%", "100,00%", "99,88%", "99,67%", "99,94%"], XS_NOVO)
    ]
  }
];

// Layout antigo (2012/13): "dd-mmm-aa", outra ordem de regiões, "Área (ha)", a data numa linha e os números na seguinte,
// e a comparação com a safra anterior SEM "Δ".
const XS_ANTIGO = [196, 232, 264, 300, 337, 369, 401, 433];
const CAB_ANTIGO = ["Noroeste", "Norte", "Nordeste", "Médio-Norte", "Oeste", "Centro-Sul", "Sudeste", "Mato Grosso"];
const PAGINAS_ANTIGO = [
  {
    itens: [
      ...linha(500, "Regiões do IMEA", 126, CAB_ANTIGO, XS_ANTIGO.map((x) => x - 5)),
      ...linha(485, "Área 12/13 (ha)", 127, ["75.160", "22.503"], XS_ANTIGO),
      ...linha(470, "10-jan-13", 135, ["0,0%", "0,0%", "0,0%", "0,4%", "0,7%", "0,0%", "0,0%", "0,3%"], XS_ANTIGO),
      it("17-jan-13", 135, 455),
      ...linha(448, "", 135, ["1,5%", "0,0%", "2,0%", "6,4%", "3,0%", "1,1%", "0,5%", "4,2%"], XS_ANTIGO).slice(1),
      ...linha(430, "15-mar-12", 135, ["100,0%", "100,0%", "100,0%", "100,0%", "100,0%", "100,0%", "100,0%", "100,0%"], XS_ANTIGO)
    ]
  }
];

test("layout novo: uma semana por linha, a região pela coluna; para no Δ (a safra anterior fica de fora)", () => {
  const { semanas } = extrairAndamento(PAGINAS_NOVO);
  assert.deepEqual(
    semanas.map((s) => s.data),
    ["2026-02-06", "2026-02-13"]
  );
  assert.equal(semanas[1].valores.MATO_GROSSO, 46.07);
  assert.equal(semanas[1].valores.MEDIO_NORTE, 62.24);
  assert.equal(Object.keys(semanas[0].valores).length, 8);
});

test("layout antigo: outra ordem de regiões, data numa linha e números na seguinte, e a comparação sem Δ fica de fora", () => {
  const { semanas } = extrairAndamento(PAGINAS_ANTIGO);
  assert.deepEqual(
    semanas.map((s) => s.data),
    ["2013-01-10", "2013-01-17"]
  );
  // Noroeste é a 1ª coluna aqui; Médio-Norte a 4ª.
  assert.equal(semanas[1].valores.NOROESTE, 1.5);
  assert.equal(semanas[1].valores.MEDIO_NORTE, 6.4);
  assert.equal(semanas[1].valores.MATO_GROSSO, 4.2);
});

test("defeito da colheita 2014/15: número sem região no cabeçalho recusa o informe (não adivinha)", () => {
  const cabSemMedioNorte = CAB_NOVO.filter((r) => r !== "Médio-Norte");
  const xsCab = XS_NOVO.filter((_, i) => i !== 1).map((x) => x - 4);
  const paginas = [
    { itens: [...linha(600, "Regiões", 66, cabSemMedioNorte, xsCab), ...linha(585, "28/05/2015", 76, ["0,52%", "1,22%", "0,00%", "0,00%", "1,59%", "0,04%", "0,00%", "0,62%"], XS_NOVO)] }
  ];
  assert.throws(() => extrairAndamento(paginas), /sem região no cabeçalho/);
});

test("sem a tabela, recusa", () => {
  assert.throws(() => extrairAndamento([{ itens: [it("RELATÓRIO", 1, 1)] }]), /não encontrada/);
});

test("datas nos quatro formatos da fonte", () => {
  assert.equal(lerData("11-jan-19"), "2019-01-11");
  assert.equal(lerData("1-fev-19"), "2019-02-01");
  assert.equal(lerData("13/jan/23"), "2023-01-13");
  assert.equal(lerData("28/05/2015"), "2015-05-28");
  assert.equal(lerData("Área (ha)"), null);
});
