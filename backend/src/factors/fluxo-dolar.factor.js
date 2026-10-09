"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const d = require("./modelos/dolar-comum");

// FATOR F1 do dólar: fluxo cambial (proposta do dólar, §2.3; o fator 3 do relatório do Comitê de 2026-10-08, só a
// ponta à vista: a do futuro e a custódia de não residentes não são públicas; ADR 0126). O fator 3 é o fluxo
// ESTRANGEIRO, que está no financeiro (investimento, rendas, carteira): o primário é o saldo do fluxo financeiro
// contratado (BCB, SGS 13970, ADR 0125); a confirmação é o saldo total (13961); o comercial (13967) é contexto.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation), diários, divulgados às quartas com os dias até a sexta anterior (ADR 0125):
//     BCB_SGS.FLUXO_CAMBIAL.SALDO_FINANCEIRO / SALDO_TOTAL / SALDO_COMERCIAL (US$ milhões)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por dia útil:
//     A. o saldo acumulado dos últimos 20 dias úteis (4 semanas: o dia a dia é ruidoso e chega com 5 a 12 dias)
//     B. a posição do tamanho desse saldo nos 3 anos anteriores (a régua); a do total, como confirmação; o comercial
//     C. saída líquida (saldo negativo) pressiona o dólar para ALTA; entrada, para BAIXA (direção do relatório); a mesma
//        leitura em 7, 30 e 90 dias; R2: sem leitura de 1 dia (a fonte é semanal e chega com 5 a 12 dias)
// Propriedades: determinístico, versionado, point-in-time, sem IA. A revisão do BCB (o mês anterior, na 3ª semana) entra
// com a data em que foi vista (ADR 0125).

const FACTOR_ID = "dolar_fluxo";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  financeiro: "BCB_SGS.FLUXO_CAMBIAL.SALDO_FINANCEIRO",
  total: "BCB_SGS.FLUXO_CAMBIAL.SALDO_TOTAL",
  comercial: "BCB_SGS.FLUXO_CAMBIAL.SALDO_COMERCIAL"
});
const DIAS_ACUMULADOS = 20;
// Entrada líquida (saldo positivo) pressiona o dólar para baixa; saída, para alta.
const ACIMA = d.DIRECAO.BAIXA;
const R2 = "o BCB divulga o fluxo uma vez por semana, com 5 a 12 dias de atraso";

// O saldo acumulado dos últimos `DIAS_ACUMULADOS` dias úteis de cada dia (null antes de completar).
function somasMoveis(serie) {
  const somas = [];
  let acumulado = 0;
  for (let i = 0; i < serie.length; i += 1) {
    acumulado += serie[i].valor;
    if (i >= DIAS_ACUMULADOS) acumulado -= serie[i - DIAS_ACUMULADOS].valor;
    somas.push(i >= DIAS_ACUMULADOS - 1 ? d.arredondar(acumulado, 2) : null);
  }
  return somas;
}

function reguaDoSaldo(serie, parametros) {
  return d.reguaDaSequencia(
    serie.map((p) => p.observedAt),
    somasMoveis(serie),
    parametros
  );
}

const descrever = (r) => (!r ? "sem dado" : `US$ ${d.comSinal(r.variacao, 0)} milhões${r.percentil === null ? ` (sem histórico mínimo: ${r.n} de ${d.MINIMO_HISTORICO})` : ` (percentil ${d.fmt(r.percentil, 0)} do tamanho)`}`);

// Função PURA: as linhas de obterAsOf() -> um ponto por dia útil com o saldo de 20 dias.
function derivarFluxoDolar(linhasAsOf, { parametros = d.PARAMETROS_REGUA } = {}) {
  const financeiro = d.serieDiaria(linhasAsOf, SERIES.financeiro);
  const total = d.serieDiaria(linhasAsOf, SERIES.total);
  const comercial = d.serieDiaria(linhasAsOf, SERIES.comercial);
  const rF = reguaDoSaldo(financeiro, parametros);
  const rT = reguaDoSaldo(total, parametros);
  const somasComercial = somasMoveis(comercial);

  const pontos = [];
  for (let i = 0; i < financeiro.length; i += 1) {
    if (!rF[i] || rF[i].percentil === null) continue;
    const dia = financeiro[i];
    const iT = d.indiceAte(total, dia.observedAt);
    const iC = d.indiceAte(comercial, dia.observedAt);
    const leitura = d.leituraDaRegua(rF[i], parametros, ACIMA);
    const leituraTotal = iT >= 0 ? d.leituraDaRegua(rT[iT], parametros, ACIMA) : null;
    const final = d.aplicarConfirmacao(leitura, [{ rotulo: "o saldo total", leitura: leituraTotal }]);
    const comum = d.leituraDoHorizonte(final, `saldo financeiro de 20 dias úteis ${descrever(rF[i])}`);
    const porHorizonte = { IMEDIATO: d.semLeituraR2(R2), CURTO: comum, MEDIO: comum, LONGO: comum };
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: dia.observedAt,
      saldoDia: dia.valor,
      saldo20: rF[i].variacao,
      saldoTexto: descrever(rF[i]),
      totalTexto: iT >= 0 ? descrever(rT[iT]) : "sem dado",
      comercialTexto: iC >= 0 && somasComercial[iC] !== null ? `US$ ${d.comSinal(somasComercial[iC], 0)} milhões em 20 dias úteis` : "sem dado",
      posicaoMedio: d.posicaoComSinal(rF[i]),
      porHorizonte,
      decisao: d.decisaoDaTela(porHorizonte),
      disponivelEm: dia.disponivelEm,
      disponivelEmEhEstimado: Boolean(dia.estimado)
    });
  }
  return pontos;
}

async function calcularFluxoDolar({ asOf, parametros = d.PARAMETROS_REGUA }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarFluxoDolar(linhas, { parametros });
}

function explicarFluxoDolar(ponto) {
  if (!ponto) return [];
  return [
    `${d.dataBr(ponto.observedAt)}: o fluxo financeiro do dia foi de US$ ${d.comSinal(ponto.saldoDia, 0)} milhões; nos últimos 20 dias úteis, ${ponto.saldoTexto}.`,
    `Confirmação, o saldo total em 20 dias úteis: ${ponto.totalTexto}. Contexto, o comercial: ${ponto.comercialTexto}.`,
    "Saída líquida (saldo negativo) pressiona o dólar para alta; entrada, para baixa.",
    ...d.linhasPorHorizonte(ponto.porHorizonte, { semJanela: true })
  ];
}

const EPISODIOS = [
  { data: "2008-10-31", rotulo: "Crise de 2008: saída de capital" },
  { data: "2020-03-31", rotulo: "Covid: saída recorde" },
  { data: "2024-12-31", rotulo: "Dezembro de 2024: saída de fim de ano" },
  { data: "2026-10-02", rotulo: "Setembro de 2026" }
];

const APRESENTACAO = {
  unidade: "percentil",
  quadros: [
    { camada: "A", rotulo: "Saldo financeiro do dia", campo: "saldoDia", casas: 0, sinal: true, sufixo: "US$ milhões" },
    { camada: "A", rotulo: "Saldo financeiro em 20 dias úteis", campo: "saldo20", casas: 0, sinal: true, sufixo: "US$ milhões" },
    { camada: "B", rotulo: "O saldo de 20 dias na régua", campo: "saldoTexto" },
    { camada: "B", rotulo: "Confirmação: o saldo total em 20 dias", campo: "totalTexto" },
    { camada: "B", rotulo: "Contexto: o comercial em 20 dias", campo: "comercialTexto" }
  ],
  graficoAB: {
    titulo: "Saldo do fluxo financeiro acumulado em 20 dias úteis (A), em US$ milhões",
    unidade: "",
    casas: 0,
    exigeCampo: "saldo20",
    series: [{ campo: "saldo20", rotulo: "Saldo financeiro em 20 dias (A)" }]
  },
  graficoC: d.graficoC("Saldo financeiro de 20 dias"),
  rotulosDecisao: d.ROTULOS_DECISAO,
  parametros: d.DESCRITORES_PARAMETROS,
  semTendencia: true,
  porHorizonte: true,
  regra:
    "o saldo do fluxo financeiro acumulado em 20 dias úteis: o sinal dá a direção (saída líquida pressiona o dólar para alta; entrada, para baixa) e o tamanho, contra os saldos de 20 dias dos {reguaAnos} anos anteriores, a intensidade: neutra abaixo do percentil {reguaPercentilNeutro}, forte a partir do {reguaPercentilForte}; o saldo total no lado oposto limita a fraca; a mesma leitura em 7, 30 e 90 dias; R2: sem leitura de 1 dia",
  exemplos: { colunaValor: "Posição com sinal (percentil)" },
  nota: "Diário, divulgado pelo BCB às quartas com os dias até a sexta anterior, não é tempo real. Os dados são preliminares e o mês anterior é revisado na 3ª semana; a revisão entra com a data em que foi vista. Só a ponta à vista do fator 3 do relatório: o futuro e a custódia de não residentes não são públicos."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: d.PARAMETROS_REGUA,
  periodicidade: "DIARIA",
  calcular: calcularFluxoDolar,
  explicar: explicarFluxoDolar,
  exemplos: (pontos) => d.exemplosPorData(pontos, EPISODIOS),
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, METODOLOGIA, derivarFluxoDolar, calcularFluxoDolar, somasMoveis };
