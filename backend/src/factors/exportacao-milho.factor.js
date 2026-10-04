"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarMeses } = require("./base/meses");

// FATOR (PROPOSTA, ADR 0056): a parte numérica do fator "Política comercial e exportações (China, tarifas)" do FEL 1
// para o milho, o ritmo das exportações. A regra é a parte de embarques da R-POL v0 do David ("Motor do Milho",
// 2026-10-02, ADR 0055); a participação da China é a medida que ele pediu na P12. Camadas A e B calculadas, C simulada.
// Os EVENTOS (tarifas, habilitações, embargos) ficam fora do cálculo: vêm da leitura diária por IA (ADR 0049), e o
// David pediu validação humana antes do prompt (pendência).
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation), Comex Stat, mensal (ADRs 0013 e 0034):
//     COMEX.MILHO.EXPORT.KG                - o milho exportado pelo Brasil no mês, em kg
//     COMEX.MILHO.EXPORT_DESTINO.160.KG    - o que foi para a China (160 na tabela de países do Comex Stat)
//   fator (calculado sob demanda, NUNCA gravado):
//     A. exportadoMilT = o volume do mês, em mil t; participacaoChinaPct = a China no total; a participação contra o
//        mesmo mês do ano anterior, em p.p. (mês contra mês engana pela safra, P12)
//     B. o RITMO: acumuladoMilT = o exportado no ano comercial (fevereiro a janeiro, o da Conab) até o mês;
//        media5AnosMilT = a média do mesmo trecho nos 5 anos comerciais anteriores (nula se faltar um mês);
//        desvioPct = o acumulado contra ela. O mês sozinho não serve: na entressafra (mar a jun) o volume é pequeno e o
//        desvio salta (+67%, -35%); o David pede o "ritmo de embarque contra a média de 5 anos da mesma época"
//     C. R-POL v0 (a parte dos embarques): 10% ou mais acima da média de 5 anos -> pressão de ALTA (demanda externa
//        firme); 10% ou mais abaixo -> de BAIXA. Acréscimos do FinMind: o ritmo pelo acumulado do ano comercial; forte a
//        partir de 25%; tendência pelo desvio de 3 meses antes
//
// Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "exportacao_milho_comex";
const FACTOR_VERSION = 1;

const CODIGO_CHINA = "160";
const SERIES = Object.freeze({
  total: "COMEX.MILHO.EXPORT.KG",
  china: `COMEX.MILHO.EXPORT_DESTINO.${CODIGO_CHINA}.KG`
});
const ANOS_MEDIA = 5;
const MESES_ANO = 12;
const KG_POR_MIL_T = 1e6;
// O ano comercial do milho na Conab começa em fevereiro.
const MES_INICIO_ANO_COMERCIAL = 2;

// Do David (R-POL v0): 10% contra a média de 5 anos. Do FinMind: o forte (25%) e a tendência (3 meses, 15 p.p.). A
// janela da tendência é em MESES (a chave é a dos fatores semanais).
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 10,
  limiarFortePct: 25,
  semanasTendencia: 3,
  limiarTendenciaPp: 15
});

// Embarques acima do normal = demanda externa firme: pressão de alta.
const ACIMA_PRESSIONA = faixa.DIRECAO.ALTA;
const ROTULOS_TENDENCIA = { SUBINDO: "Embarques acelerando", CAINDO: "Embarques desacelerando", ESTAVEL: "Estável" };

// Arredonda; uma diferença que arredonda para zero sai 0, não -0.
function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f + 0;
}

// O 1º mês do ano comercial de `mes` (AAAA-MM-01): fevereiro do mesmo ano, ou do anterior em janeiro.
function inicioDoAnoComercial(mes) {
  const [ano, m] = mes.split("-").map(Number);
  const inicio = m >= MES_INICIO_ANO_COMERCIAL ? ano : ano - 1;
  return `${inicio}-${String(MES_INICIO_ANO_COMERCIAL).padStart(2, "0")}-01`;
}

// Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por mês.
function derivarExportacaoMilho(linhasAsOf, { parametros = PARAMETROS_PADRAO } = {}) {
  const total = new Map();
  const china = new Map();
  const disponivel = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode === SERIES.total) {
      total.set(linha.observedAt, linha.value);
      disponivel.set(linha.observedAt, { em: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
    } else if (linha.seriesCode === SERIES.china) {
      china.set(linha.observedAt, linha.value);
    }
  }
  const participacao = (mes) => {
    const t = total.get(mes);
    // Sem linha da China no mês, ela não comprou (o Comex Stat só lista os destinos com exportação).
    return t ? ((china.get(mes) || 0) / t) * 100 : null;
  };

  // O exportado do início do ano comercial até `mes`; nulo se faltar algum mês.
  const acumuladoAte = (mes) => {
    let soma = 0;
    for (let m = inicioDoAnoComercial(mes); m <= mes; m = somarMeses(m, 1)) {
      const v = total.get(m);
      if (v === undefined) return null;
      soma += v;
    }
    return soma;
  };

  const desvios = new Map();
  const pontos = [];
  for (const observedAt of [...total.keys()].sort()) {
    const volume = total.get(observedAt);
    const acumulado = acumuladoAte(observedAt);
    let soma = 0;
    let completa = acumulado !== null;
    for (let k = 1; k <= ANOS_MEDIA && completa; k += 1) {
      const anterior = acumuladoAte(somarMeses(observedAt, -MESES_ANO * k));
      if (anterior === null) completa = false;
      else soma += anterior;
    }
    const media = completa ? soma / ANOS_MEDIA : null;
    const desvio = media ? arredondar((acumulado / media - 1) * 100, 2) : null;
    desvios.set(observedAt, desvio);
    const part = participacao(observedAt);
    const partAnoAntes = participacao(somarMeses(observedAt, -MESES_ANO));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      exportadoMilT: arredondar(volume / KG_POR_MIL_T, 1),
      chinaMilT: arredondar((china.get(observedAt) || 0) / KG_POR_MIL_T, 1),
      participacaoChinaPct: part === null ? null : arredondar(part, 1),
      participacaoChinaVariacaoPp: part === null || partAnoAntes === null ? null : arredondar(part - partAnoAntes, 1),
      acumuladoMilT: acumulado === null ? null : arredondar(acumulado / KG_POR_MIL_T, 1),
      media5AnosMilT: media === null ? null : arredondar(media / KG_POR_MIL_T, 1),
      desvioPct: desvio,
      decisao: faixa.decidirPorFaixa(desvio, desvios.get(somarMeses(observedAt, -parametros.semanasTendencia)) ?? null, parametros, ACIMA_PRESSIONA),
      disponivelEm: disponivel.get(observedAt).em,
      disponivelEmEhEstimado: disponivel.get(observedAt).estimado
    });
  }
  return pontos;
}

async function calcularExportacaoMilho({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const linhas = await servico.obterAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps);
  return derivarExportacaoMilho(linhas, { parametros });
}

// --- Camada C: explicação e exemplos (decisão por faixa) ---------------------------------------------------------

const TEXTOS = {
  campo: "desvioPct",
  janela: "meses",
  primeiroPasso: (p) =>
    `O Brasil exportou ${faixa.fmt(p.exportadoMilT, 1)} mil t de milho no mês (A), ${faixa.fmt(p.participacaoChinaPct ?? 0, 1)}% ` +
    `para a China. No ano comercial (desde fevereiro), ${faixa.fmt(p.acumuladoMilT, 1)} mil t, contra ` +
    `${faixa.fmt(p.media5AnosMilT, 1)} mil t na média do mesmo trecho dos 5 anos anteriores: ${faixa.comSinal(p.desvioPct)}% (B).`,
  nomeValor: "o desvio",
  abaixo: "embarques abaixo do normal da época são demanda externa fraca",
  acima: "embarques acima do normal da época são demanda externa firme",
  subindo: "os embarques estão acelerando",
  caindo: "os embarques estão desacelerando",
  rotulosTendencia: ROTULOS_TENDENCIA
};

const EPISODIOS = [
  { data: "2022-11-01", rotulo: "Primeiros embarques para a China, depois do protocolo de 2022" },
  { data: "2023-09-01", rotulo: "Exportação recorde em 2023" },
  { data: "2024-09-01", rotulo: "Safra menor em 2024" },
  { data: "2026-08-01", rotulo: "A China volta a comprar em 2026" }
];
const CENARIOS = [
  { valor: 40, valorAnterior: 10, rotulo: "Muito acima do normal e acelerando" },
  { valor: 12, valorAnterior: 15, rotulo: "Acima do normal, estável" },
  { valor: 3, valorAnterior: -5, rotulo: "Perto do normal" },
  { valor: -15, valorAnterior: 5, rotulo: "Abaixo do normal, desacelerando" },
  { valor: -35, valorAnterior: -40, rotulo: "Muito abaixo, mas melhorando" }
];

function explicarExportacao(ponto, parametros = PARAMETROS_PADRAO) {
  const passos = faixa.explicarPorFaixa(ponto, parametros, TEXTOS);
  if (passos.length && ponto.participacaoChinaVariacaoPp !== null) {
    passos.push(
      `Contexto (P12): a China levou ${faixa.fmt(ponto.participacaoChinaPct, 1)}% do total, ${faixa.comSinal(ponto.participacaoChinaVariacaoPp, 1)} p.p. ` +
        "contra o mesmo mês do ano anterior. Os eventos de política comercial vêm da leitura diária por IA, fora desta conta."
    );
  }
  return passos;
}

function exemplosExportacao(pontosTodos, parametros = PARAMETROS_PADRAO) {
  return faixa.exemplosPorFaixa(pontosTodos, parametros, { campo: TEXTOS.campo, episodios: EPISODIOS, cenarios: CENARIOS, acimaPressiona: ACIMA_PRESSIONA });
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "Milho exportado no mês", campo: "exportadoMilT", casas: 1, unidadeValor: " mil t" },
    {
      camada: "A",
      rotulo: "Participação da China",
      campo: "participacaoChinaPct",
      casas: 1,
      unidadeValor: "%",
      secundario: { prefixo: "contra o mesmo mês do ano anterior:", campo: "participacaoChinaVariacaoPp", casas: 1, sinal: true, sufixo: "p.p." }
    },
    { camada: "B", rotulo: "Exportado no ano comercial (desde fevereiro)", campo: "acumuladoMilT", casas: 1, unidadeValor: " mil t" },
    { camada: "B", rotulo: "Média do mesmo trecho nos 5 anos comerciais anteriores", campo: "media5AnosMilT", casas: 1, unidadeValor: " mil t" },
    { camada: "B", rotulo: "Ritmo: desvio contra a média", campo: "desvioPct", casas: 2, sinal: true, unidadeValor: "%" }
  ],
  graficoAB: {
    titulo: "Exportado no ano comercial até o mês × a média do mesmo trecho nos 5 anos anteriores (B), em mil t",
    unidade: "mil t",
    casas: 0,
    exigeCampo: "media5AnosMilT",
    series: [
      { campo: "acumuladoMilT", rotulo: "Acumulado no ano comercial (B)" },
      { campo: "media5AnosMilT", rotulo: "Média de 5 anos (B)" }
    ]
  },
  graficoC: { titulo: "Ritmo: o acumulado contra a média de 5 anos (B) e as faixas da decisão (C)", campo: "desvioPct", rotulo: "Ritmo (B)" },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: faixa.parametrosFaixa({ janela: "meses" }),
  regraAdicional: "os eventos de política comercial (tarifas, habilitações, embargos) não entram nesta conta: vêm da leitura diária por IA",
  exemplos: { colunaValor: "Desvio" },
  nota:
    "Mensal, não é tempo real: o Comex Stat (MDIC) publica o mês nos primeiros dias úteis do seguinte e revisa os " +
    "meses recentes. Volume em mil t. A China é o código 160 da tabela de países; sem linha, ela não comprou no mês."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "MENSAL",
  calcular: calcularExportacaoMilho,
  explicar: explicarExportacao,
  exemplos: exemplosExportacao,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PARAMETROS_PADRAO, METODOLOGIA, derivarExportacaoMilho, calcularExportacaoMilho };
