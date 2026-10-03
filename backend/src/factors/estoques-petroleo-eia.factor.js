"use strict";

const pointInTimeService = require("../services/point-in-time.service");

// FATOR (PROPOSTA, ADR 0050): estoques de petróleo dos EUA (EIA), fator "Estoques de petróleo dos EUA (EIA)" do FEL 1.
// É a proposta do catálogo `shared/metodologia-petroleo.js` calculada, para o David e o Comitê verem como o fator
// ficaria. As três camadas: A (medida), B (comparação) e C (direção e intensidade) - esta SIMULADA, com parâmetros
// padrão do FinMind que o Comitê ajusta (PARAMETROS_PADRAO; a API aceita outros valores para simular). O peso não é
// calculado: é o do FEL 1. Não alimenta o motor, o Centro de Decisão nem a IA. Só o que entra na conta do fator: o
// preço não faz parte dele (é a análise final que confronta os fatores com o preço).
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (tabela observation):
//     EIA.PETROLEO_ESTOQUES.PETROLEO_SEM_SPR - estoque de petróleo sem a reserva estratégica, semanal (mil barris)
//   fator (calculado sob demanda, NUNCA gravado):
//     A. variacaoSemanal = estoque(t) - estoque(t - 1 semana)
//     B. media5Anos      = média do estoque nas semanas t - 52k semanas, k = 1..5 (a "mesma semana" dos 5 anos
//                          anteriores, como a EIA compara no relatório); nula se faltar qualquer uma das 5
//        desvio          = estoque(t) - media5Anos, e desvioPct = desvio / media5Anos
//     C. direcao         = pressão sobre o preço: |desvioPct| < limiarModeradoPct -> NEUTRA; abaixo da média -> ALTA
//                          (aperto); acima -> BAIXA (sobra). A direção do FEL 1: "alta com estoques abaixo do esperado"
//        intensidade     = FRACA abaixo de limiarModeradoPct, MODERADA até limiarFortePct, FORTE a partir dele
//        tendencia       = desvioPct(t) - desvioPct(t - semanasTendencia): menos que limiarTendenciaPp (em pontos
//                          percentuais) -> ESTAVEL; caindo -> APERTANDO; subindo -> AFROUXANDO
//
// Propriedades: determinístico, versionado (FACTOR_VERSION; os parâmetros vão junto na resposta), point-in-time (só
// o publicado até `asOf`; cada ponto informa `disponivelEm`), sem IA e sem estimativa própria. As semanas anteriores
// entram como conhecidas em `asOf`, não como eram conhecidas na semana t (a EIA quase não revisa estes estoques).

const FACTOR_ID = "estoques_petroleo_eia";
const FACTOR_VERSION = 1;

const SERIE_ESTOQUE = "EIA.PETROLEO_ESTOQUES.PETROLEO_SEM_SPR";

const ANOS_MEDIA = 5;
const DIAS_SEMANA = 7;
const SEMANAS_ANO = 52;

// Padrões do FinMind (2026-10-02), tirados da distribuição do desvio de 1987 a 2026 no banco de dev: |desvio| tem
// mediana de ~5,5% e 3º quartil de ~10%; a mudança do desvio em 4 semanas tem mediana de ~1,9 p.p. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarModeradoPct: 3,
  limiarFortePct: 10,
  semanasTendencia: 4,
  limiarTendenciaPp: 2
});

const DIRECAO = { ALTA: "ALTA", BAIXA: "BAIXA", NEUTRA: "NEUTRA" };
const INTENSIDADE = { FRACA: "FRACA", MODERADA: "MODERADA", FORTE: "FORTE" };
const TENDENCIA = { APERTANDO: "APERTANDO", AFROUXANDO: "AFROUXANDO", ESTAVEL: "ESTAVEL" };

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// Camada C de uma semana (função pura). `desvioAnterior`: o desvioPct de `semanasTendencia` semanas antes, ou null.
function decidirEstoques(desvioPct, desvioAnterior, parametros = PARAMETROS_PADRAO) {
  if (desvioPct === null) return null;
  const { limiarModeradoPct, limiarFortePct, limiarTendenciaPp } = parametros;
  const absoluto = Math.abs(desvioPct);

  let direcao = DIRECAO.NEUTRA;
  if (absoluto >= limiarModeradoPct) direcao = desvioPct < 0 ? DIRECAO.ALTA : DIRECAO.BAIXA;

  let intensidade = INTENSIDADE.FRACA;
  if (absoluto >= limiarFortePct) intensidade = INTENSIDADE.FORTE;
  else if (absoluto >= limiarModeradoPct) intensidade = INTENSIDADE.MODERADA;

  let tendencia = null;
  let mudancaDesvioPp = null;
  if (desvioAnterior !== null && desvioAnterior !== undefined) {
    mudancaDesvioPp = arredondar(desvioPct - desvioAnterior, 2);
    if (Math.abs(mudancaDesvioPp) < limiarTendenciaPp) tendencia = TENDENCIA.ESTAVEL;
    else tendencia = mudancaDesvioPp < 0 ? TENDENCIA.APERTANDO : TENDENCIA.AFROUXANDO;
  }

  return { direcao, intensidade, tendencia, mudancaDesvioPp };
}

// Função PURA: recebe as linhas de obterAsOf() (uma por período) e devolve os pontos do fator, das semanas
// observadas a partir de `observadoDesde` (as anteriores só servem de base para a média e a tendência).
function derivarEstoquesPetroleoEia(linhasAsOf, { observadoDesde = null, parametros = PARAMETROS_PADRAO } = {}) {
  const estoques = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode === SERIE_ESTOQUE) estoques.set(linha.observedAt, linha);
  }

  const desvios = new Map();
  const pontos = [];
  for (const observedAt of [...estoques.keys()].sort()) {
    const atual = estoques.get(observedAt);
    const anterior = estoques.get(somarDias(observedAt, -DIAS_SEMANA));

    const mesmasSemanas = [];
    for (let k = 1; k <= ANOS_MEDIA; k += 1) {
      const linha = estoques.get(somarDias(observedAt, -DIAS_SEMANA * SEMANAS_ANO * k));
      if (linha) mesmasSemanas.push(linha.value);
    }
    const media5Anos = mesmasSemanas.length === ANOS_MEDIA ? arredondar(mesmasSemanas.reduce((a, b) => a + b, 0) / ANOS_MEDIA, 1) : null;
    const desvio = media5Anos === null ? null : arredondar(atual.value - media5Anos, 1);
    const desvioPct = desvio === null ? null : arredondar((desvio / media5Anos) * 100, 2);
    desvios.set(observedAt, desvioPct);

    if (observadoDesde && observedAt < observadoDesde) continue;
    const desvioAnterior = desvios.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt,
      estoque: atual.value,
      variacaoSemanal: anterior ? arredondar(atual.value - anterior.value, 1) : null,
      media5Anos,
      desvio,
      desvioPct,
      decisao: decidirEstoques(desvioPct, desvioAnterior ?? null, parametros),
      disponivelEm: atual.publishedAt,
      disponivelEmEhEstimado: atual.publishedAtIsEstimated
    });
  }
  return pontos;
}

// Exemplos para explicar a camada C na tela, calculados pela mesma regra (`decidirEstoques`) e com os parâmetros em
// uso: semanas reais conhecidas e cenários hipotéticos (desvio de agora e de `semanasTendencia` semanas antes).
const EPISODIOS = [
  { data: "2016-04-29", rotulo: "Excesso de oferta depois da queda do petróleo de 2014-2016" },
  { data: "2020-06-26", rotulo: "Excesso na pandemia" },
  { data: "2022-06-24", rotulo: "Aperto depois da invasão da Ucrânia" },
  { data: "2024-06-28", rotulo: "Estoque um pouco abaixo do normal" }
];
const CENARIOS = [
  { desvioPct: -14, desvioAnterior: -9, rotulo: "Bem abaixo do normal e caindo" },
  { desvioPct: -5, desvioAnterior: -5.5, rotulo: "Abaixo do normal e parado" },
  { desvioPct: 1, desvioAnterior: -2, rotulo: "Perto do normal, voltando de baixo" },
  { desvioPct: 6, desvioAnterior: 9, rotulo: "Acima do normal e diminuindo" },
  { desvioPct: 12, desvioAnterior: 12.5, rotulo: "Bem acima do normal e parado" }
];

function exemplosEstoques(pontosTodos, parametros = PARAMETROS_PADRAO) {
  const porData = new Map(pontosTodos.map((ponto) => [ponto.observedAt, ponto]));
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      const ponto = porData.get(data);
      return { data, rotulo, desvioPct: ponto?.desvioPct ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map((cenario) => ({ ...cenario, decisao: decidirEstoques(cenario.desvioPct, cenario.desvioAnterior, parametros) }))
  };
}

async function calcularEstoquesPetroleoEia({ asOf, observadoDesde, observadoAte, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  // A média de 5 anos precisa das 5 "mesmas semanas" antes do 1º ponto pedido, e a tendência, do desvio de
  // `semanasTendencia` semanas antes (que por sua vez precisa da média dele): folga de 5 anos + a tendência + 1 semana.
  const semanasFolga = SEMANAS_ANO * ANOS_MEDIA + parametros.semanasTendencia + 1;
  const baseDesde = observadoDesde ? somarDias(observadoDesde, -DIAS_SEMANA * semanasFolga) : undefined;
  const linhas = await servico.obterAsOf({ seriesCodes: [SERIE_ESTOQUE], asOf, observadoDesde: baseDesde, observadoAte }, deps);
  return derivarEstoquesPetroleoEia(linhas, { observadoDesde, parametros });
}

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIE_ESTOQUE,
  PARAMETROS_PADRAO,
  DIRECAO,
  INTENSIDADE,
  TENDENCIA,
  decidirEstoques,
  exemplosEstoques,
  derivarEstoquesPetroleoEia,
  calcularEstoquesPetroleoEia
};
