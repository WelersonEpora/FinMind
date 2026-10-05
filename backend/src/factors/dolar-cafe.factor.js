"use strict";

const { lerPtax } = require("./base/ptax");
const faixa = require("./base/decisao-por-faixa");
const { sextaDaSemana } = require("./base/semana-de-dias");
const { criarFatorPosicaoSemanal, arredondar } = require("./modelos/posicao-historica");

// FATOR (PROPOSTA, ADR 0060): câmbio, fator "Dólar (USDBRL)" do FEL 1 para o café, como o F4 do Motor do Café v1
// (2026-10-04): o câmbio como incentivo à comercialização do produtor brasileiro. Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR:
//   observável (market_quote): USD_BRL venda - a PTAX de venda (BCB), diária
//   fator (calculado sob demanda, NUNCA gravado), um ponto por semana (o último dia útil dela):
//     A. a PTAX; medida = a variação em 10 pregões, em % (o "em 10 pregões" da regra candidata do estudo)
//     B. o percentil da medida nas 260 semanas anteriores (5 anos; mínimo de 200)
//     C. as regras candidatas do estudo: o real se valorizando mais rápido que o normal (PTAX caindo) reduz a receita
//        em reais e desestimula a venda do produtor -> pesa para ALTA; o real se desvalorizando forte destrava a
//        fixação de vendas -> pesa para BAIXA. O "[CALIBRAR]%" vira a posição contra o próprio histórico (abaixo do
//        percentil 20 ou acima do 80), calibração do FinMind (modelos/posicao-historica.js)
//
// Fora da conta, sem o dado: o ritmo de comercialização das cooperativas (o "método de leitura" do estudo) e a condição
// da regra de baixa de o preço em reais estar em patamar recorde no pico da safra. O estudo pede não tratar o efeito
// como causal e mecânico: o repasse depende da retenção do produtor e da base física. O ICF é cotado em dólar: o efeito
// é sobre o fluxo de venda, não uma conversão. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "dolar_cafe_ptax_10_pregoes";
const FACTOR_VERSION = 1;

const PREGOES = 10;
const INICIO = "2005-01-01";

// A PTAX de venda até o dia de `asOf` (sai à tarde do próprio dia; o market_quote não guarda a publicação).
function carregar(asOf, deps = {}) {
  return lerPtax({ desde: INICIO, asOf }, deps);
}

// Função PURA: a PTAX diária ({ data, valor }) -> um registro por semana (o último dia útil), com a variação contra 10
// pregões antes.
function medirDolar(ptax) {
  const ordenada = [...ptax].sort((a, b) => (a.data < b.data ? -1 : 1));
  const porSemana = new Map();
  ordenada.forEach((dia, i) => porSemana.set(sextaDaSemana(dia.data), { dia, i }));
  return [...porSemana.keys()].sort().map((sexta) => {
    const { dia, i } = porSemana.get(sexta);
    const antes = i >= PREGOES ? ordenada[i - PREGOES] : null;
    return {
      observedAt: sexta,
      ultimoDia: dia.data,
      dolar: dia.valor,
      dolar10PregoesAntes: antes ? antes.valor : null,
      medida: antes ? arredondar((dia.valor / antes.valor - 1) * 100, 2) : null,
      // A PTAX sai à tarde do próprio dia (o market_quote não guarda a hora): estimada.
      disponivelEm: `${dia.data}T16:00:00-03:00`,
      disponivelEmEhEstimado: true
    };
  });
}

const fator = criarFatorPosicaoSemanal({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  carregar,
  medir: medirDolar,
  semanasJanela: 260,
  minimo: 200,
  acimaPressiona: faixa.DIRECAO.BAIXA,
  textos: {
    primeiroPasso: (p) =>
      `A PTAX de venda fechou a semana em R$ ${faixa.fmt(p.dolar, 4)}, contra R$ ${faixa.fmt(p.dolar10PregoesAntes, 4)} 10 pregões ` +
      `antes: ${faixa.comSinal(p.medida)}% (A).`,
    abaixo: "o real se valorizando mais rápido que o normal reduz a receita em reais e desestimula a venda do produtor",
    acima: "o real se desvalorizando mais rápido que o normal eleva a receita em reais e destrava a fixação de vendas",
    subindo: "o dólar está ganhando ritmo de alta (ou perdendo o de queda)",
    caindo: "o dólar está ganhando ritmo de queda (ou perdendo o de alta)",
    rotulosTendencia: { SUBINDO: "Real se desvalorizando", CAINDO: "Real se valorizando", ESTAVEL: "Estável" }
  },
  apresentacao: {
    quadrosA: [
      { camada: "A", rotulo: "Dólar (PTAX de venda)", campo: "dolar", casas: 4, sufixo: "R$/US$" },
      { camada: "A", rotulo: "Variação em 10 pregões", campo: "medida", casas: 2, sinal: true, unidadeValor: "%" }
    ],
    rotuloMedida: "Variação em 10 pregões",
    unidadeMedida: "%",
    casasMedida: 2,
    tituloAB: "Variação da PTAX em 10 pregões",
    nota:
      "Semanal, não é tempo real: a PTAX de venda do último dia útil da semana (BCB). O ICF é cotado em dólar: o câmbio " +
      "age pelo incentivo do produtor a vender, não por conversão do preço."
  },
  episodios: [
    { data: "2020-03-13", rotulo: "Pandemia: o real despenca" },
    { data: "2024-12-20", rotulo: "Dólar acima de R$ 6" }
  ],
  cenarios: [
    { valor: -45, valorAnterior: -20, rotulo: "Real se valorizando como poucas vezes" },
    { valor: 5, valorAnterior: 35, rotulo: "Câmbio normal, depois de alta do dólar" },
    { valor: 42, valorAnterior: 25, rotulo: "Real se desvalorizando forte, acelerando" }
  ]
});

module.exports = { FACTOR_ID, FACTOR_VERSION, METODOLOGIA: fator.METODOLOGIA, medirDolar, derivarDolarCafe: fator.derivar };
