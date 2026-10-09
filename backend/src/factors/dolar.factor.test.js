"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const d = require("./modelos/dolar-comum");
const juros = require("./juros-eua-dolar.factor");
const risco = require("./risco-dolar.factor");
const fluxo = require("./fluxo-dolar.factor");
const di = require("./juros-brasil-dolar.factor");
const commodities = require("./commodities-dolar.factor");
const expectativas = require("./expectativas-dolar.factor");
const fundos = require("./fundos-dolar.regra");
const { montarTextoPrompt } = require("./base/texto-prompt");

// Dias úteis seguidos a partir de uma data.
function diasUteis(inicio, n) {
  const dias = [];
  const d0 = new Date(`${inicio}T00:00:00Z`);
  while (dias.length < n) {
    if (![0, 6].includes(d0.getUTCDay())) dias.push(d0.toISOString().slice(0, 10));
    d0.setUTCDate(d0.getUTCDate() + 1);
  }
  return dias;
}
// Linhas de obterAsOf() de uma série com os valores dados, nos dias úteis desde `inicio`.
const linhas = (serie, inicio, valores) =>
  diasUteis(inicio, valores.length).map((dia, i) => ({ seriesCode: serie, observedAt: dia, value: valores[i], publishedAt: new Date(`${dia}T23:59:59Z`), publishedAtIsEstimated: true }));
// Uma série que oscila (variações pequenas e de tamanho variado) e termina com um salto.
const oscilando = (n, base, passo, salto = 0) => Array.from({ length: n }, (_, i) => base + (i % 7) * passo * (i % 2 ? 1 : -1) + (i === n - 1 ? salto : 0));

test("régua: o percentil da variação absoluta entre as dos 3 anos anteriores, com o mínimo de 60; neutra abaixo de 40, forte a partir de 80", () => {
  const datas = diasUteis("2020-01-01", 200);
  const variacoes = datas.map((_, i) => (i === 199 ? 9 : (i % 10) - 5));
  const regua = d.reguaDaSequencia(datas, variacoes, d.PARAMETROS_REGUA);
  assert.equal(regua[30].percentil, null, "menos de 60 anteriores: sem leitura");
  assert.equal(regua[199].percentil, 100);
  assert.deepEqual(d.leituraDaRegua(regua[199], d.PARAMETROS_REGUA, d.DIRECAO.ALTA), { direcao: "ALTA", intensidade: "FORTE" });
  assert.deepEqual(d.leituraDaRegua({ variacao: -3, percentil: 55 }, d.PARAMETROS_REGUA, d.DIRECAO.ALTA), { direcao: "BAIXA", intensidade: "FRACA" });
  assert.deepEqual(d.leituraDaRegua({ variacao: 3, percentil: 39 }, d.PARAMETROS_REGUA, d.DIRECAO.ALTA), { direcao: "NEUTRA", intensidade: "FRACA" });
  assert.equal(d.posicaoComSinal({ variacao: -3, percentil: 55 }), -55);
});

test("medição: a confirmação no lado oposto limita a fraca; a concordância exige o mínimo do mesmo lado, com a intensidade da mais fraca", () => {
  const forte = { direcao: "ALTA", intensidade: "FORTE" };
  assert.deepEqual(d.aplicarConfirmacao(forte, [{ rotulo: "o 10 anos", leitura: { direcao: "BAIXA", intensidade: "FRACA" } }]), { direcao: "ALTA", intensidade: "FRACA", limitadoPor: ["o 10 anos"] });
  assert.deepEqual(d.aplicarConfirmacao(forte, [{ rotulo: "o 10 anos", leitura: { direcao: "NEUTRA", intensidade: "FRACA" } }]).intensidade, "FORTE");
  const tres = [forte, { direcao: "ALTA", intensidade: "FRACA" }, { direcao: "ALTA", intensidade: "FORTE" }];
  assert.deepEqual(d.concordancia(tres, { minimo: 3, todas: true }), { direcao: "ALTA", intensidade: "FRACA" });
  assert.deepEqual(d.concordancia([forte, { direcao: "BAIXA", intensidade: "FORTE" }, forte], { minimo: 3, todas: true }).direcao, "NEUTRA");
  assert.deepEqual(d.concordancia([forte, { direcao: "NEUTRA", intensidade: "FRACA" }, forte], { minimo: 2 }), { direcao: "ALTA", intensidade: "FORTE" });
  assert.equal(d.concordancia([forte, null, forte], { minimo: 2, todas: true }), null, "sem leitura numa medida exigida: sem leitura");
});

test("F3, juros dos EUA: o 2 anos subindo forte pressiona o dólar para alta; uma leitura por horizonte, e a da tela é a de 30 dias", () => {
  const n = 400;
  const dgs2 = linhas("FRED.DGS2", "2024-01-01", oscilando(n, 4, 0.02, 0.9));
  const dgs10 = linhas("FRED.DGS10", "2024-01-01", oscilando(n, 4.2, 0.02, 0.5));
  const pontos = juros.derivarJurosEuaDolar([...dgs2, ...dgs10]);
  const ultimo = pontos.at(-1);
  assert.deepEqual(Object.keys(ultimo.porHorizonte), ["IMEDIATO", "CURTO", "MEDIO", "LONGO"]);
  assert.equal(ultimo.porHorizonte.IMEDIATO.direcao, "ALTA");
  assert.equal(ultimo.porHorizonte.IMEDIATO.intensidade, "FORTE");
  assert.deepEqual(ultimo.decisao, { direcao: ultimo.porHorizonte.MEDIO.direcao, intensidade: ultimo.porHorizonte.MEDIO.intensidade, tendencia: null });
  assert.match(ultimo.variacoesTexto, /^1 d\.u\.: \+\d+ pb \(percentil \d+\)/);
});

test("F5, aversão a risco: o VIX subindo forte abaixo de 20 é neutro (o limiar do relatório); acima de 20, alta", () => {
  assert.deepEqual(risco.ajustarPeloNivel({ direcao: "ALTA", intensidade: "FORTE" }, { nivel: 18 }), { direcao: "NEUTRA", intensidade: "FRACA", foraDoLimiar: true });
  assert.deepEqual(risco.ajustarPeloNivel({ direcao: "ALTA", intensidade: "FORTE" }, { nivel: 24 }), { direcao: "ALTA", intensidade: "FORTE" });
  assert.equal(risco.ajustarPeloNivel({ direcao: "BAIXA", intensidade: "FRACA" }, { nivel: 22 }).direcao, "NEUTRA");
  const vix = linhas("FRED.VIXCLS", "2024-01-01", oscilando(300, 15, 0.3, 3));
  const ultimo = risco.derivarRiscoDolar(vix).at(-1);
  assert.equal(ultimo.porHorizonte.IMEDIATO.direcao, "NEUTRA", "subiu forte, mas fechou abaixo de 20");
  assert.equal(ultimo.nivelConfirmacao, null, "sem o S&P 500: sem confirmação");
});

test("F1, fluxo: o saldo de 20 dias negativo (saída) pressiona o dólar para alta; sem leitura de 1 dia (R2)", () => {
  assert.deepEqual(fluxo.somasMoveis(diasUteis("2024-01-01", 21).map((dia, i) => ({ observedAt: dia, valor: i < 20 ? 1 : 5 }))).slice(18), [null, 20, 24]);
  const n = 400;
  const fin = linhas(fluxo.SERIES.financeiro, "2023-01-02", Array.from({ length: n }, (_, i) => (i > n - 25 ? -900 : (i % 9) * 40 - 160)));
  const ultimo = fluxo.derivarFluxoDolar(fin).at(-1);
  assert.equal(ultimo.porHorizonte.IMEDIATO.aplica, false);
  assert.match(ultimo.porHorizonte.IMEDIATO.texto, /^não se aplica \(R2/);
  assert.equal(ultimo.porHorizonte.MEDIO.direcao, "ALTA");
  assert.equal(ultimo.porHorizonte.CURTO.texto, ultimo.porHorizonte.LONGO.texto, "a mesma leitura em 7, 30 e 90 dias");
});

test("F4, curva do DI: os vértices são os janeiros de Y+1, Y+3 e Y+5 (F27, F29 e F31 em 2026)", () => {
  assert.deepEqual(di.verticesDoDia("2026-10-09"), [2027, 2029, 2031]);
  assert.deepEqual(di.verticesDoDia("2027-01-04"), [2028, 2030, 2032]);
});

test("F6, commodities: a variação de cada janela é a do contrato mais próximo que tem as duas pontas, nunca emendada", () => {
  const icfz = linhas("B3.ICF.ICFZ26.SETTLE", "2026-09-01", [300, 301, 302]);
  const icfh = linhas("B3.ICF.ICFH27.SETTLE", "2026-08-03", Array.from({ length: 24 }, (_, i) => 310 + i));
  const seq = commodities.sequenciaDoFuturo([...icfz, ...icfh], { prefixo: "B3.ICF", simbolo: "ICF" });
  const ultimoDia = seq.datas.length - 1;
  assert.equal(seq.precos[ultimoDia].ticker, "ICFZ26", "o preço é o do 1º vencimento negociado");
  // Na janela de 1 dia, o ICFZ26 tem as duas pontas; na de 5, só o ICFH27.
  assert.equal(seq.variacoes.IMEDIATO[ultimoDia], d.arredondar((302 / 301 - 1) * 100, 4));
  assert.equal(seq.variacoes.CURTO[ultimoDia], d.arredondar((333 / 328 - 1) * 100, 4));
});

test("F7, expectativas: a revisão é a do IPCA do ano seguinte contra o boletim anterior, na mesma série", () => {
  const ipca = (ano, datas, valores) => datas.map((dia, i) => ({ seriesCode: `BCB_FOCUS.ANUAL.${ano}.IPCA`, observedAt: dia, value: valores[i], publishedAt: new Date(`${dia}T12:00:00Z`), publishedAtIsEstimated: true }));
  const linhasFocus = [...ipca(2027, ["2026-12-18", "2026-12-25", "2027-01-01"], [4, 4.1, 4.2]), ...ipca(2028, ["2026-12-25", "2027-01-01", "2027-01-08"], [3.5, 3.6, 3.9])];
  const revisoes = expectativas.revisoesDoAnoSeguinte(linhasFocus, "IPCA");
  assert.deepEqual(
    revisoes.map((r) => [r.observedAt, r.ano, r.revisao]),
    [
      ["2026-12-25", "2027", 0.1],
      ["2027-01-01", "2028", 0.1],
      ["2027-01-08", "2028", 0.3]
    ]
  );
});

test("R1, fundos no real: o extremo comprado EM REAL aponta ALTA do dólar (reversão); o vendido, BAIXA", () => {
  assert.equal(fundos.estadoDaPosicao(45, { limiarFortePct: 40 }).aponta, "ALTA");
  assert.equal(fundos.estadoDaPosicao(-41, { limiarFortePct: 40 }).aponta, "BAIXA");
  assert.equal(fundos.estadoDaPosicao(10, { limiarFortePct: 40 }).aponta, null);
});

test("texto do prompt: um fator com leitura por horizonte leva as quatro na parte C, e o dia como período", () => {
  const ponto = {
    observedAt: "2026-10-07",
    nivel: 4.77,
    variacoesTexto: "1 d.u.: -2 pb (percentil 31)",
    confirmacaoTexto: "-",
    contextoTexto: "-",
    porHorizonte: {
      IMEDIATO: { texto: "neutra" },
      CURTO: { texto: "pressão de baixa, fraca" },
      MEDIO: { texto: "pressão de alta, forte" },
      LONGO: { texto: "pressão de alta, forte" }
    },
    decisao: { direcao: "ALTA", intensidade: "FORTE", tendencia: null }
  };
  const fator = { codigo: "DOLAR_JUROS_EUA", nome: "Juros dos EUA", peso: "Alto", origem: "ADR 0126", fel1: { tipo: "Juros (EUA)" }, proposta: { situacao: "VALIDADA" } };
  const texto = montarTextoPrompt({ ativo: "DOLAR", fator, calculo: { ...juros.METODOLOGIA, parametros: d.PARAMETROS_REGUA }, ponto });
  assert.match(texto, /^FATOR — Juros dos EUA — DÓLAR \(peso Alto\)/);
  assert.match(texto, /Dia de 07\/10\/2026\./);
  assert.match(texto, /C — Leitura do fator, por horizonte:\n- IMEDIATO \(1 dia\): neutra\n- CURTO \(7 dias\): pressão de baixa, fraca\n- MEDIO \(30 dias\): pressão de alta, forte\n- LONGO \(90 dias\): pressão de alta, forte/);
  assert.match(texto, /nos 3 anos anteriores; neutra abaixo do percentil 40 da variação absoluta, forte a partir do 80/, "a régua com os parâmetros inteiros");
  assert.doesNotMatch(texto, /- Pressão:/);
});
