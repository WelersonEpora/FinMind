"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extrairParidade, lerCelulaData, resolverData } = require("./imea-paridade-milho.parser");

const XS = [314, 371, 429, 488, 544];

// Uma página com a tabela diária: cabeçalho de datas e a linha da paridade (rótulo e números podem vir em Y diferentes).
function pagina(datas, valores, { rotulo = "Paridade Exportação - jul/26", yRotulo = 741, yValores = 741 } = {}) {
  return {
    itens: [
      ...datas.map((str, i) => ({ str, x: XS[i] + 2, y: 813 })),
      { str: "Milho Disponível", x: 23, y: 798 },
      ...["48,66", "48,97", "49,18", "49,36", "49,20"].map((str, i) => ({ str, x: XS[i], y: 798 })),
      { str: rotulo, x: 23, y: yRotulo },
      { str: "MT", x: 176, y: yValores },
      { str: "R$/sc", x: 219, y: yValores },
      ...valores.map((str, i) => ({ str, x: XS[i], y: yValores }))
    ]
  };
}

test("lê os 5 dias da semana anterior e o contrato do rótulo; '-' é dia sem valor", () => {
  const datas = ["21/09/2026", "22/09/2026", "23/09/2026", "24/09/2026", "25/09/2026"];
  const r = extrairParidade([pagina(datas, ["46,56", "41,57", "-", "46,67", "46,00"])], "2026-09-28");
  assert.equal(r.contrato, "jul/26");
  assert.deepEqual(r.dias.map((d) => [d.data, d.valor]), [["2026-09-21", 46.56], ["2026-09-22", 41.57], ["2026-09-24", 46.67], ["2026-09-25", 46]]);
  assert.deepEqual(r.invalidos, []);
});

test("rótulo e números em Y diferentes (2022-09-12); datas com espaço e ano de 2 dígitos (2021-06-07)", () => {
  const datas = ["31/ 05/ 21", "01/ 06/ 21", "02/ 06/ 21", "03/ 06/ 21", "04/ 06/ 21"];
  const r = extrairParidade([pagina(datas, ["66,03", "70,32", "66,31", "64,74", "66,85"], { rotulo: "Paridade Exportação - jun/ 21", yRotulo: 723, yValores: 720 })], "2021-06-07");
  assert.equal(r.contrato, "jun/21");
  assert.equal(r.dias[0].data, "2021-05-31");
  assert.equal(r.dias.length, 5);
});

test("ano truncado ou digitado errado: vale o dia e o mês, o ano é o da janela da edição", () => {
  assert.deepEqual(lerCelulaData("02/05/202"), { dia: 2, mes: 5, ano: null });
  assert.equal(resolverData(lerCelulaData("02/05/202"), "2023-05-08"), "2023-05-02");
  assert.equal(resolverData(lerCelulaData("7/12/222"), "2022-12-12"), "2022-12-07");
  assert.equal(resolverData(lerCelulaData("30/12/202"), "2027-01-04"), "2026-12-30");
});

test("paridade zero (2025-04-25) não é gravada", () => {
  const r = extrairParidade([pagina(["21/04/2025", "22/04/2025", "23/04/2025", "24/04/2025", "25/04/2025"], ["48,98", "46,70", "45,02", "46,30", "0,00"])], "2025-04-28");
  assert.equal(r.dias.length, 4);
  assert.match(r.invalidos[0].motivo, /zero/);
});

test("data fora da semana anterior ou repetida no cabeçalho: o dia não é gravado", () => {
  const fora = extrairParidade([pagina(["29/11/21", "30/11/21", "01/11/21", "02/11/21", "03/11/21"], ["67,12", "68,45", "67,52", "65,14", "66,40"])], "2021-12-06");
  assert.deepEqual(fora.dias.map((d) => d.data), ["2021-11-29", "2021-11-30"]);
  assert.equal(fora.invalidos.length, 3);
  assert.match(fora.invalidos[0].motivo, /fora da semana anterior/);

  const repetida = extrairParidade([pagina(["29/11/22", "29/11/22", "30/11/22", "01/12/22", "02/12/22"], ["70,38", "68,62", "-", "66,08", "65,13"])], "2022-12-05");
  assert.deepEqual(repetida.dias.map((d) => d.data), ["2022-12-01", "2022-12-02"]);
  assert.equal(repetida.invalidos.filter((i) => /repetida/.test(i.motivo)).length, 2);
});

test("uma frase que começa com 'paridade exportação' sem datas acima não é a tabela; sem tabela, lança", () => {
  const frase = { itens: [{ str: "Paridade exportação recuou 3,2% na semana", x: 40, y: 500 }] };
  const tabela = pagina(["09/01/23", "10/01/23", "11/01/23", "12/01/23", "13/01/23"], ["62,28", "61,63", "61,17", "61,33", "61,80"], { rotulo: "Paridade Exportação - jul/23" });
  assert.equal(extrairParidade([frase, tabela], "2023-01-16").dias.length, 5);
  assert.throws(() => extrairParidade([frase], "2023-01-16"), /cabeçalho de datas/);
  assert.throws(() => extrairParidade([{ itens: [] }], "2023-01-16"), /não tem a linha/);
});
