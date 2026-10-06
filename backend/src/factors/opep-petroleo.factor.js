"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");

// FATOR: decisões da OPEP+, fator "Decisões da OPEP+ (cotas de produção)" (Alto) do FEL 1 para o petróleo. A parte
// CALCULADA do fator, ao lado dos eventos da leitura diária (o fator continua com eles, numa janela de 45 dias). As
// cotas não são medidas: só estão no site da OPEP, bloqueado a acesso automático. O que se mede é a pegada das
// decisões na produção e na capacidade ociosa da OPEP, pelo STEO da EIA (decisão do usuário, 2026-10-06, ADR 0091).
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), mensais (o dia é o 1º do mês), em mil barris/dia, uma versão por edição do STEO:
//     EIA_STEO.PETROLEO.OPEP.PRODUCAO              - produção de petróleo bruto da OPEP (a filiação de cada edição)
//     EIA_STEO.PETROLEO.OPEP.CAPACIDADE_OCIOSA   - capacidade ociosa da OPEP
//     EIA_STEO.PETROLEO.OPEP.CAPACIDADE          - capacidade de produção da OPEP (contexto)
//     EIA_STEO.PETROLEO.<OPEP_MAIS | RU | SA>.PRODUCAO - a OPEP+, a Rússia e a Arábia Saudita (contexto)
//   fator (calculado sob demanda, NUNCA gravado):
//     A. produção, ociosa e capacidade da OPEP no mês; OPEP+, Rússia e Arábia Saudita
//     B. crescimentoProducaoPct: a média de 3 meses da produção contra os mesmos 3 meses do ano anterior;
//        variacaoOciosa: a média de 3 meses da ociosa menos a dos mesmos 3 meses do ano anterior (mil barris/dia)
//     C. o CASO, pelos dois sinais (proposta do FinMind, validada no histórico do STEO, ADR 0091):
//          CORTE        produção caindo e ociosa subindo: a OPEP retém oferta     -> pressão de ALTA ("alta com cortes")
//          AUMENTO      produção subindo e ociosa caindo: a OPEP libera oferta    -> pressão de BAIXA ("baixa com aumento de cotas")
//          INTERRUPCAO  as duas caindo: perda de capacidade (guerra, ataque, declínio) -> sem pressão do fator (fica com a geopolítica)
//          EXPANSAO     as duas subindo: capacidade nova                          -> sem pressão do fator
//          NEUTRO       uma das duas dentro da faixa                              -> sem pressão do fator
//        intensidade: forte com |crescimento| a partir de limiarFortePct, nos casos com pressão
//        tendência: a variação da ociosa contra `semanasTendencia` meses antes
//
// No histórico (225 edições do STEO, 2008 a 2026, cada uma com o que se sabia nela), o Brent subiu 6 meses depois em
// 73% das edições em CORTE e em 41% das em AUMENTO, contra 53% em todas; sem a crise de 2008-09 e sem 2020, 62% e 46%.
// Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "opep_producao_ociosa_steo";
const FACTOR_VERSION = 1;

const SERIES = {
  producao: "EIA_STEO.PETROLEO.OPEP.PRODUCAO",
  ociosa: "EIA_STEO.PETROLEO.OPEP.CAPACIDADE_OCIOSA",
  capacidade: "EIA_STEO.PETROLEO.OPEP.CAPACIDADE",
  opepMais: "EIA_STEO.PETROLEO.OPEP_MAIS.PRODUCAO",
  russia: "EIA_STEO.PETROLEO.RU.PRODUCAO",
  arabia: "EIA_STEO.PETROLEO.SA.PRODUCAO"
};
const CAMPO_DA_SERIE = Object.fromEntries(Object.entries(SERIES).map(([campo, serie]) => [serie, campo]));

const MESES_MEDIA = 3;
const MESES_ANO = 12;

// Padrões do FinMind (2026-10-06), os da validação: ±1,5% na produção e ±400 mil barris/dia na ociosa, em 12 meses
// (cerca dos percentis 35 e 65 de cada medida); forte com a produção a 5% ou mais (~percentil 80 do |crescimento|);
// tendência em 3 meses, mudança mínima de 300 mil barris/dia. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarProducaoPct: 1.5,
  limiarOciosaMilBd: 400,
  limiarFortePct: 5,
  semanasTendencia: 3,
  limiarTendenciaMilBd: 300
});

const CASO = { CORTE: "CORTE", AUMENTO: "AUMENTO", INTERRUPCAO: "INTERRUPCAO", EXPANSAO: "EXPANSAO", NEUTRO: "NEUTRO" };
const TEXTO_CASO = {
  CORTE: "corte (produção caindo e ociosa subindo: a OPEP retém oferta)",
  AUMENTO: "aumento (produção subindo e ociosa caindo: a OPEP libera oferta)",
  INTERRUPCAO: "interrupção (produção e ociosa caindo juntas: perda de capacidade, como guerra, ataque ou declínio dos campos, e não decisão da OPEP; o fator não lê pressão, o efeito de uma guerra fica com os eventos de geopolítica)",
  EXPANSAO: "expansão (produção e ociosa subindo juntas: capacidade nova; o fator não lê pressão)",
  NEUTRO: "neutro (produção ou ociosa dentro da faixa)"
};
const ROTULOS_TENDENCIA = { SUBINDO: "Ociosa subindo", CAINDO: "Ociosa caindo", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

function somarMeses(mesIso, k) {
  const [ano, mes] = mesIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1 + k, 1)).toISOString().slice(0, 10);
}

// Camada C (função pura). `crescimento` em %, `variacaoOciosa` e `variacaoOciosaAnterior` em mil barris/dia.
function decidirOpep({ crescimento, variacaoOciosa, variacaoOciosaAnterior = null }, parametros = PARAMETROS_PADRAO) {
  if (crescimento === null || crescimento === undefined || variacaoOciosa === null || variacaoOciosa === undefined) return null;
  const caiu = crescimento <= -parametros.limiarProducaoPct;
  const subiu = crescimento >= parametros.limiarProducaoPct;
  const ociosaSubiu = variacaoOciosa >= parametros.limiarOciosaMilBd;
  const ociosaCaiu = variacaoOciosa <= -parametros.limiarOciosaMilBd;

  let caso = CASO.NEUTRO;
  if (caiu && ociosaSubiu) caso = CASO.CORTE;
  else if (subiu && ociosaCaiu) caso = CASO.AUMENTO;
  else if (caiu && ociosaCaiu) caso = CASO.INTERRUPCAO;
  else if (subiu && ociosaSubiu) caso = CASO.EXPANSAO;

  let direcao = faixa.DIRECAO.NEUTRA;
  if (caso === CASO.CORTE) direcao = faixa.DIRECAO.ALTA;
  if (caso === CASO.AUMENTO) direcao = faixa.DIRECAO.BAIXA;
  let intensidade = faixa.INTENSIDADE.FRACA;
  if (direcao !== faixa.DIRECAO.NEUTRA) {
    intensidade = Math.abs(crescimento) >= parametros.limiarFortePct ? faixa.INTENSIDADE.FORTE : faixa.INTENSIDADE.MODERADA;
  }

  let tendencia = null;
  let mudancaPp = null;
  if (variacaoOciosaAnterior !== null && variacaoOciosaAnterior !== undefined) {
    mudancaPp = arredondar(variacaoOciosa - variacaoOciosaAnterior, 0);
    if (Math.abs(mudancaPp) < parametros.limiarTendenciaMilBd) tendencia = faixa.TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.SUBINDO;
  }
  return { caso, direcao, intensidade, tendencia, mudancaPp };
}

// As linhas de obterAsOf() -> Map(mês -> { producao, ociosa, ..., disponivelEm, estimado }).
function porMes(linhasAsOf) {
  const meses = new Map();
  for (const linha of linhasAsOf) {
    const campo = CAMPO_DA_SERIE[linha.seriesCode];
    if (!campo) continue;
    if (!meses.has(linha.observedAt)) meses.set(linha.observedAt, { disponivelEm: null, estimado: false });
    const mes = meses.get(linha.observedAt);
    mes[campo] = linha.value;
    if (campo === "producao" || campo === "ociosa") {
      if (!mes.disponivelEm || linha.publishedAt > mes.disponivelEm) mes.disponivelEm = linha.publishedAt;
      mes.estimado = mes.estimado || linha.publishedAtIsEstimated;
    }
  }
  return meses;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por mês com a produção e a ociosa da OPEP.
function derivarOpep(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const meses = porMes(linhasAsOf);
  const media3 = (campo, data) => {
    const valores = Array.from({ length: MESES_MEDIA }, (_, k) => meses.get(somarMeses(data, -k))?.[campo]);
    return valores.every((v) => v !== undefined) ? valores.reduce((a, b) => a + b, 0) / MESES_MEDIA : undefined;
  };
  const variacoes = new Map();
  const pontos = [];
  for (const observedAt of [...meses.keys()].sort()) {
    const mes = meses.get(observedAt);
    if (mes.producao === undefined || mes.ociosa === undefined) continue;
    const anoAntes = somarMeses(observedAt, -MESES_ANO);
    const prod = media3("producao", observedAt);
    const prodAnt = media3("producao", anoAntes);
    const oc = media3("ociosa", observedAt);
    const ocAnt = media3("ociosa", anoAntes);
    const crescimento = prod === undefined || prodAnt === undefined ? null : arredondar((prod / prodAnt - 1) * 100, 2);
    const variacaoOciosa = oc === undefined || ocAnt === undefined ? null : arredondar(oc - ocAnt, 0);
    variacoes.set(observedAt, variacaoOciosa);
    const decisao = decidirOpep(
      { crescimento, variacaoOciosa, variacaoOciosaAnterior: variacoes.get(somarMeses(observedAt, -parametros.semanasTendencia)) ?? null },
      parametros
    );
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      producao: arredondar(mes.producao, 0),
      ociosa: arredondar(mes.ociosa, 0),
      capacidade: mes.capacidade === undefined ? null : arredondar(mes.capacidade, 0),
      opepMais: mes.opepMais === undefined ? null : arredondar(mes.opepMais, 0),
      russia: mes.russia === undefined ? null : arredondar(mes.russia, 0),
      arabia: mes.arabia === undefined ? null : arredondar(mes.arabia, 0),
      media3Producao: prod === undefined ? null : arredondar(prod, 0),
      media3ProducaoAnoAnterior: prodAnt === undefined ? null : arredondar(prodAnt, 0),
      crescimentoProducaoPct: crescimento,
      media3Ociosa: oc === undefined ? null : arredondar(oc, 0),
      media3OciosaAnoAnterior: ocAnt === undefined ? null : arredondar(ocAnt, 0),
      variacaoOciosa,
      caso: decisao ? `Caso: ${TEXTO_CASO[decisao.caso]}` : null,
      decisao,
      disponivelEm: mes.disponivelEm,
      disponivelEmEhEstimado: mes.estimado
    });
  }
  return pontos;
}

async function calcularOpep({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarOpep(linhas, { parametros });
}

// --- Camada C: explicação e exemplos ---------------------------------------------------------------------------

const mil = (n) => faixa.fmt(n, 0);
const milComSinal = (n) => faixa.comSinal(n, 0);

function explicarOpep(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  const lp = faixa.fmt(parametros.limiarProducaoPct, 1);
  const lo = mil(parametros.limiarOciosaMilBd);
  const passos = [
    `A OPEP produziu ${mil(ponto.media3Producao)} mil barris/dia na média dos 3 meses até este, contra ` +
      `${mil(ponto.media3ProducaoAnoAnterior)} nos mesmos meses do ano anterior: ${faixa.comSinal(ponto.crescimentoProducaoPct)}% (B).`,
    `A capacidade ociosa da OPEP ficou em ${mil(ponto.media3Ociosa)} mil barris/dia na média de 3 meses, contra ` +
      `${mil(ponto.media3OciosaAnoAnterior)} um ano antes: ${milComSinal(ponto.variacaoOciosa)} mil barris/dia (B).`,
    `Caso: a produção conta como em queda ou em alta a partir de ${lp}% e a ociosa a partir de ${lo} mil barris/dia, ` +
      `para cima ou para baixo → ${TEXTO_CASO[d.caso]}.`
  ];
  if (d.direcao === faixa.DIRECAO.NEUTRA) passos.push("Direção: só o corte e o aumento leem pressão → Neutra.");
  else {
    passos.push(`Direção: ${d.caso === CASO.CORTE ? "corte pesa para alta" : "aumento pesa para baixa"} (direção do especialista no FEL 1) → ${faixa.ROTULOS.direcao[d.direcao]}.`);
    passos.push(
      `Intensidade: a produção mudou ${faixa.fmt(Math.abs(ponto.crescimentoProducaoPct))}%, ` +
        `${d.intensidade === faixa.INTENSIDADE.FORTE ? `${faixa.fmt(parametros.limiarFortePct, 1)}% ou mais → Forte` : `menos que ${faixa.fmt(parametros.limiarFortePct, 1)}% → Moderada`}.`
    );
  }
  if (d.tendencia === null) passos.push(`Tendência: sem a variação da ociosa de ${parametros.semanasTendencia} meses antes, não calculada.`);
  else {
    passos.push(
      `Tendência: há ${parametros.semanasTendencia} meses a variação da ociosa era ${milComSinal(ponto.variacaoOciosa - d.mudancaPp)} mil barris/dia; ` +
        `mudou ${milComSinal(d.mudancaPp)} (mínimo de ${mil(parametros.limiarTendenciaMilBd)}) → ${ROTULOS_TENDENCIA[d.tendencia]}.`
    );
  }
  return passos;
}

const EPISODIOS = [
  { data: "2009-03-01", rotulo: "Cortes da crise de 2008-09" },
  { data: "2012-06-01", rotulo: "OPEP produzindo no máximo (2012)" },
  { data: "2020-08-01", rotulo: "Cortes da pandemia (OPEP+)" },
  { data: "2021-11-01", rotulo: "Devolução dos cortes da pandemia" },
  { data: "2023-12-01", rotulo: "Cortes voluntários de 2023" },
  { data: "2026-08-01", rotulo: "Guerra no Golfo (2026)" }
];
const CENARIOS = [
  { rotulo: "Produção −4% e ociosa +1.200 mil barris/dia", crescimento: -4, variacaoOciosa: 1200, variacaoOciosaAnterior: 600 },
  { rotulo: "Produção −8% e ociosa +2.500 mil barris/dia", crescimento: -8, variacaoOciosa: 2500, variacaoOciosaAnterior: 2400 },
  { rotulo: "Produção +3% e ociosa −900 mil barris/dia", crescimento: 3, variacaoOciosa: -900, variacaoOciosaAnterior: -300 },
  { rotulo: "Produção −20% e ociosa −3.000 mil barris/dia (guerra no Golfo)", crescimento: -20, variacaoOciosa: -3000, variacaoOciosaAnterior: -2800 },
  { rotulo: "Produção +1% e ociosa −200 mil barris/dia", crescimento: 1, variacaoOciosa: -200, variacaoOciosaAnterior: -100 }
];

function exemplosOpep(pontosTodos, parametros = PARAMETROS_PADRAO) {
  const porData = new Map(pontosTodos.map((ponto) => [ponto.observedAt, ponto]));
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      const ponto = porData.get(data);
      return { data, rotulo, valor: ponto?.variacaoOciosa ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map(({ rotulo, ...entrada }) => ({
      rotulo,
      valor: entrada.variacaoOciosa,
      valorAnterior: entrada.variacaoOciosaAnterior,
      decisao: decidirOpep(entrada, parametros)
    }))
  };
}

const APRESENTACAO = {
  unidade: "mil barris/dia",
  quadros: [
    {
      camada: "A",
      rotulo: "Produção da OPEP (STEO)",
      campo: "producao",
      casas: 0,
      secundario: { prefixo: "mil barris/dia; capacidade:", campo: "capacidade", casas: 0, sufixo: "" }
    },
    { camada: "A", rotulo: "Capacidade ociosa da OPEP", campo: "ociosa", casas: 0, sufixo: "mil barris/dia" },
    {
      camada: "A",
      rotulo: "OPEP+, países sujeitos aos acordos (contexto)",
      campo: "opepMais",
      casas: 0,
      secundario: { prefixo: "mil barris/dia; Arábia Saudita:", campo: "arabia", casas: 0, sufixo: "" }
    },
    { camada: "A", rotulo: "Rússia (contexto)", campo: "russia", casas: 0, sufixo: "mil barris/dia" },
    {
      camada: "B",
      rotulo: "Produção da OPEP, média de 3 meses contra um ano antes",
      campo: "crescimentoProducaoPct",
      casas: 2,
      sinal: true,
      unidadeValor: "%",
      secundario: { prefixo: "", campo: "media3Producao", casas: 0, sufixo: "mil barris/dia" }
    },
    {
      camada: "B",
      rotulo: "Capacidade ociosa, média de 3 meses contra um ano antes",
      campo: "variacaoOciosa",
      casas: 0,
      sinal: true,
      secundario: { prefixo: "mil barris/dia; hoje:", campo: "media3Ociosa", casas: 0, sufixo: "" },
      detalhe: "caso"
    }
  ],
  graficoAB: {
    titulo: "Produção e capacidade ociosa da OPEP (A), em mil barris/dia",
    unidade: "mil barris/dia",
    casas: 0,
    exigeCampo: "ociosa",
    series: [
      { campo: "producao", rotulo: "Produção (A)" },
      { campo: "capacidade", rotulo: "Capacidade (A)" },
      { campo: "ociosa", rotulo: "Capacidade ociosa (A)" }
    ]
  },
  graficoC: {
    titulo: "Variação da capacidade ociosa em 12 meses (B) e o limiar do caso (C)",
    campo: "variacaoOciosa",
    rotulo: "Variação da ociosa (B)",
    unidade: "mil barris/dia",
    limiares: [
      { chave: "limiarOciosaMilBd", sinal: 1, rotulo: "Ociosa subindo (corte ou expansão)" },
      { chave: "limiarOciosaMilBd", sinal: -1, rotulo: "Ociosa caindo (aumento ou interrupção)" }
    ]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarProducaoPct", rotulo: "Faixa da produção", unidade: "%", explicacao: "A produção da OPEP (média de 3 meses contra um ano antes) conta como em queda ou em alta a partir desse tanto." },
    { chave: "limiarOciosaMilBd", rotulo: "Faixa da capacidade ociosa", unidade: "mil barris/dia", maximo: 5000, explicacao: "A capacidade ociosa (média de 3 meses contra um ano antes) conta como subindo ou caindo a partir desse tanto." },
    { chave: "limiarFortePct", rotulo: "Limiar de intensidade forte", unidade: "%", explicacao: "No corte e no aumento, a pressão é forte com a produção mudando esse tanto ou mais." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: "meses", explicacao: "Contra quantos meses atrás a variação da ociosa é comparada." },
    { chave: "limiarTendenciaMilBd", rotulo: "Mudança mínima da tendência", unidade: "mil barris/dia", maximo: 5000, explicacao: "Quanto a variação da ociosa precisa mudar na janela para não ser considerada estável." }
  ],
  regra:
    "o caso pela produção da OPEP (média de 3 meses contra um ano antes, em queda ou em alta a partir de {limiarProducaoPct}%) e pela capacidade ociosa (média de 3 meses contra um ano antes, subindo ou caindo a partir de {limiarOciosaMilBd} mil barris/dia): corte (produção caindo e ociosa subindo) é pressão de alta; aumento (produção subindo e ociosa caindo) é pressão de baixa; interrupção (as duas caindo, perda de capacidade), expansão (as duas subindo) e o resto são neutros; forte com a produção mudando {limiarFortePct}% ou mais; tendência pela variação da ociosa de {semanasTendencia} meses antes, mudança mínima de {limiarTendenciaMilBd} mil barris/dia",
  exemplos: { colunaValor: "Variação da ociosa (mil barris/dia)" },
  nota:
    "Mensal, não é tempo real: o STEO da EIA sai uma vez por mês (na 2ª semana), com o mês anterior estimado, e revisa os " +
    "meses anteriores a cada edição. A OPEP é a de cada edição (os Emirados saem em mai/2026). As cotas não são medidas: as " +
    "decisões chegam pelos eventos."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "MENSAL",
  calcular: calcularOpep,
  explicar: explicarOpep,
  exemplos: exemplosOpep,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, CASO, METODOLOGIA, decidirOpep, derivarOpep, calcularOpep, explicarOpep, exemplosOpep };
