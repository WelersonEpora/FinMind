"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const d = require("./modelos/dolar-comum");

// FATOR F7 do dólar: expectativas (proposta do dólar, §2.3; o fator 24 do relatório do Comitê de 2026-10-08, com o 26
// como contexto; decisão do usuário, 2026-10-09, ADR 0117, adendo; ADR 0126). O primário é a revisão semanal da mediana
// do IPCA do ano SEGUINTE no Focus (a expectativa desancorando ou não); a confirmação, a da Selic do ano seguinte; o
// resultado primário (do ano seguinte), o câmbio do Focus (do ano corrente) e a balança e as transações correntes
// (mensais, com um mês de atraso) são contexto.
// Direção (do relatório): a expectativa piorando (o IPCA revisto para cima) pressiona o dólar para ALTA; melhorando, para
// BAIXA. A Selic confirma na direção do relatório ("elevação de IPCA e juros"); a nuance (Selic mais alta também atrai
// carry e pode derrubar o dólar) fica para a validação. A mesma leitura nos quatro horizontes (o Focus é semanal).
// A revisão é contra o boletim anterior, na mesma série (o mesmo ano-alvo); a régua, contra as revisões dos anos
// anteriores. Muitas revisões são zero: a mediana não mudou, e a leitura é neutra.

const FACTOR_ID = "dolar_expectativas";
const FACTOR_VERSION = 1;
const PRIMEIRO_ANO = 2000;
const serieFocus = (ano, indicador) => `BCB_FOCUS.ANUAL.${ano}.${indicador}`;
const BALANCA = "BCB_SGS.BALANCA_COMERCIAL_BP";
const TRANSACOES = "BCB_SGS.TRANSACOES_CORRENTES";

function seriesAte(ateAno) {
  const series = [BALANCA, TRANSACOES];
  for (let ano = PRIMEIRO_ANO; ano <= ateAno + 2; ano += 1) {
    for (const indicador of ["IPCA", "SELIC", "PRIMARIO", "CAMBIO"]) series.push(serieFocus(ano, indicador));
  }
  return series;
}

// As revisões do ano seguinte de um indicador, uma por boletim: [{ observedAt, revisao, valor, ano, ponto }].
function revisoesDoAnoSeguinte(linhas, indicador) {
  const porAno = new Map();
  const boletins = new Set();
  for (const l of linhas) {
    const m = /^BCB_FOCUS\.ANUAL\.(\d{4})\.(\w+)$/.exec(l.seriesCode);
    if (!m || m[2] !== indicador) continue;
    boletins.add(String(l.observedAt).slice(0, 10));
    if (!porAno.has(m[1])) porAno.set(m[1], []);
    porAno.get(m[1]).push(l);
  }
  const series = new Map([...porAno].map(([ano, ls]) => [ano, d.serieDiaria(ls, ls[0].seriesCode)]));
  const indices = new Map([...series].map(([ano, s]) => [ano, new Map(s.map((p, i) => [p.observedAt, i]))]));
  const resultado = [];
  for (const boletim of [...boletins].sort()) {
    const ano = String(Number(boletim.slice(0, 4)) + 1);
    const s = series.get(ano);
    const i = indices.get(ano)?.get(boletim);
    if (!s || i === undefined || i < 1) continue;
    resultado.push({ observedAt: boletim, revisao: d.arredondar(s[i].valor - s[i - 1].valor, 4), valor: s[i].valor, ano, ponto: s[i] });
  }
  return resultado;
}

const descrever = (r, rev) =>
  !rev ? "sem dado" : `${d.fmt(rev.valor, 2)}% para ${rev.ano}, revisão de ${d.comSinal(rev.revisao, 2)} p.p.${r?.percentil === null || !r ? ` (sem histórico mínimo)` : ` (percentil ${d.fmt(r.percentil, 0)} do tamanho)`}`;

function ultimaAte(serie, data) {
  return d.ultimoAte(serie, data);
}

// Função PURA: as linhas de obterAsOf() -> um ponto por boletim do Focus.
function derivarExpectativasDolar(linhasAsOf, { parametros = d.PARAMETROS_REGUA } = {}) {
  const ipca = revisoesDoAnoSeguinte(linhasAsOf, "IPCA");
  const selic = revisoesDoAnoSeguinte(linhasAsOf, "SELIC");
  const reguaIpca = d.reguaDaSequencia(
    ipca.map((r) => r.observedAt),
    ipca.map((r) => r.revisao),
    parametros
  );
  const reguaSelic = d.reguaDaSequencia(
    selic.map((r) => r.observedAt),
    selic.map((r) => r.revisao),
    parametros
  );
  const indiceSelic = new Map(selic.map((r, i) => [r.observedAt, i]));
  const primario = (ano) => d.serieDiaria(linhasAsOf, serieFocus(ano, "PRIMARIO"));
  const cambio = (ano) => d.serieDiaria(linhasAsOf, serieFocus(ano, "CAMBIO"));
  const balanca = d.serieDiaria(linhasAsOf, BALANCA);
  const transacoes = d.serieDiaria(linhasAsOf, TRANSACOES);
  const cache = new Map();
  const doAno = (fn, chave, ano) => {
    const k = `${chave}.${ano}`;
    if (!cache.has(k)) cache.set(k, fn(ano));
    return cache.get(k);
  };

  const pontos = [];
  for (let i = 0; i < ipca.length; i += 1) {
    const r = reguaIpca[i];
    if (!r || r.percentil === null) continue;
    const rev = ipca[i];
    const iS = indiceSelic.get(rev.observedAt);
    const leitura = d.leituraDaRegua(r, parametros, d.DIRECAO.ALTA);
    const leituraSelic = iS === undefined ? null : d.leituraDaRegua(reguaSelic[iS], parametros, d.DIRECAO.ALTA);
    const final = d.aplicarConfirmacao(leitura, [{ rotulo: "a revisão da Selic", leitura: leituraSelic }]);
    const comum = d.leituraDoHorizonte(final, `IPCA ${descrever(r, rev)}`);
    const porHorizonte = { IMEDIATO: comum, CURTO: comum, MEDIO: comum, LONGO: comum };
    const anoCorrente = rev.observedAt.slice(0, 4);
    const prim = ultimaAte(doAno(primario, "P", rev.ano), rev.observedAt);
    const camb = ultimaAte(doAno(cambio, "C", anoCorrente), rev.observedAt);
    const bal = ultimaAte(balanca, rev.observedAt);
    const tc = ultimaAte(transacoes, rev.observedAt);
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: rev.observedAt,
      ipca: rev.valor,
      revisaoIpca: rev.revisao,
      ipcaTexto: descrever(r, rev),
      selicTexto: iS === undefined ? "sem dado" : descrever(reguaSelic[iS], selic[iS]),
      contextoTexto: [
        prim ? `resultado primário para ${rev.ano}: ${d.fmt(prim.valor, 2)}% do PIB` : "resultado primário: sem dado",
        camb ? `câmbio para o fim de ${anoCorrente}: R$ ${d.fmt(camb.valor, 2)}` : "câmbio: sem dado",
        bal ? `balança comercial de ${bal.observedAt.slice(0, 7)}: US$ ${d.comSinal(bal.valor, 0)} milhões` : "balança: sem dado",
        tc ? `transações correntes de ${tc.observedAt.slice(0, 7)}: US$ ${d.comSinal(tc.valor, 0)} milhões` : "transações correntes: sem dado"
      ].join("; "),
      posicaoMedio: d.posicaoComSinal(r),
      porHorizonte,
      decisao: d.decisaoDaTela(porHorizonte),
      disponivelEm: rev.ponto.disponivelEm,
      disponivelEmEhEstimado: Boolean(rev.ponto.estimado)
    });
  }
  return pontos;
}

async function calcularExpectativasDolar({ asOf, parametros = d.PARAMETROS_REGUA }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: seriesAte(asOf.getUTCFullYear()), asOf }, deps);
  return derivarExpectativasDolar(linhas, { parametros });
}

function explicarExpectativasDolar(ponto) {
  if (!ponto) return [];
  return [
    `Boletim Focus de ${d.dataBr(ponto.observedAt)}: IPCA ${ponto.ipcaTexto}.`,
    `Confirmação, a Selic: ${ponto.selicTexto}.`,
    `Contexto: ${ponto.contextoTexto}.`,
    "O IPCA do ano seguinte revisto para cima (expectativa desancorando) pressiona o dólar para alta; para baixo, para baixa.",
    ...d.linhasPorHorizonte(ponto.porHorizonte, { semJanela: true })
  ];
}

const EPISODIOS = [
  { data: "2002-10-25", rotulo: "Eleição de 2002: as expectativas desancoram" },
  { data: "2015-09-25", rotulo: "Perda do grau de investimento" },
  { data: "2024-12-20", rotulo: "Dezembro de 2024: o risco fiscal" },
  { data: "2026-10-02", rotulo: "Outubro de 2026" }
];

const APRESENTACAO = {
  unidade: "percentil",
  quadros: [
    { camada: "A", rotulo: "IPCA do ano seguinte (mediana do Focus)", campo: "ipca", casas: 2, unidadeValor: "%" },
    { camada: "A", rotulo: "Revisão contra o boletim anterior", campo: "revisaoIpca", casas: 2, sinal: true, sufixo: "p.p." },
    { camada: "B", rotulo: "O IPCA na régua", campo: "ipcaTexto" },
    { camada: "B", rotulo: "Confirmação: a Selic do ano seguinte", campo: "selicTexto" },
    { camada: "B", rotulo: "Contexto", campo: "contextoTexto" }
  ],
  graficoAB: {
    titulo: "IPCA do ano seguinte na mediana do Focus (A), em %",
    unidade: "%",
    casas: 2,
    exigeCampo: "ipca",
    series: [{ campo: "ipca", rotulo: "IPCA do ano seguinte (A)" }]
  },
  graficoC: d.graficoC("Revisão do IPCA"),
  rotulosDecisao: d.ROTULOS_DECISAO,
  parametros: d.DESCRITORES_PARAMETROS,
  semTendencia: true,
  porHorizonte: true,
  regra:
    "a revisão semanal do IPCA do ano seguinte no Focus contra o boletim anterior: para cima pressiona o dólar para alta, para baixo, para baixa; o tamanho, contra as revisões dos {reguaAnos} anos anteriores, dá a intensidade: neutra abaixo do percentil {reguaPercentilNeutro}, forte a partir do {reguaPercentilForte}; a Selic revista no lado oposto limita a fraca; a mesma leitura nos quatro horizontes",
  exemplos: { colunaValor: "Posição com sinal (percentil)" },
  nota: "Semanal (o boletim Focus, publicado na segunda seguinte), não é tempo real. A balança e as transações correntes são mensais e chegam com um mês de atraso: só contexto."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: d.PARAMETROS_REGUA,
  periodicidade: "SEMANAL",
  calcular: calcularExpectativasDolar,
  explicar: explicarExpectativasDolar,
  exemplos: (pontos) => d.exemplosPorData(pontos, EPISODIOS),
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, METODOLOGIA, derivarExpectativasDolar, calcularExpectativasDolar, revisoesDoAnoSeguinte };
