"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { somarDias, sextaDaSemana } = require("./base/semana-de-dias");
const { criarFatorPosicaoSemanal, arredondar } = require("./modelos/posicao-historica");

// FATOR (PROPOSTA, ADR 0060): estoques certificados da ICE, fator "Estoque global e certificado (ICE)" do FEL 1 para o
// café, como o F3 do Motor do Café v1 (2026-10-04). Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observável (observation): ICE.CAFE_C.ESTOQUE.TOTAL.CERTIFICADO - o estoque certificado de café arábica entregável
//     contra o Coffee C, em sacas, um valor por pregão (o relatório diário da ICE, ADR 0032: o "Report 42" do estudo)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por semana (o último pregão dela):
//     A. o estoque; medida = a variação em 4 semanas, em %
//     B. o percentil da medida nas 260 semanas anteriores (5 anos; mínimo de 200)
//     C. a regra candidata do estudo: queda sustentada do estoque pesa para alta; entrada contínua e expressiva de sacas,
//        para baixa. O "por mais de [CALIBRAR] sessões" vira a variação em 4 semanas contra o próprio histórico
//        (posição abaixo do percentil 20 = queda fora do normal), calibração do FinMind (modelos/posicao-historica.js)
//
// Fora da conta, sem o dado: as sacas aguardando classificação (pending grading) e os estoques dos portos europeus (ECF,
// fonte nova). O estudo diz: o estoque certificado é só o café entregável na ICE, não o estoque mundial (esse fica no
// balanço do USDA). Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "estoques_cafe_ice_certificado";
const FACTOR_VERSION = 1;

const SERIE = "ICE.CAFE_C.ESTOQUE.TOTAL.CERTIFICADO";
const SEMANAS_VARIACAO = 4;

// Função PURA: as linhas de obterAsOf() -> um registro por semana (o último pregão), com a variação em 4 semanas.
function medirEstoques(linhasAsOf) {
  const porSemana = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode !== SERIE) continue;
    const sexta = sextaDaSemana(linha.observedAt);
    const atual = porSemana.get(sexta);
    if (!atual || linha.observedAt > atual.dia) {
      porSemana.set(sexta, { dia: linha.observedAt, valor: linha.value, disponivelEm: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
    }
  }
  return [...porSemana.keys()].sort().map((sexta) => {
    const semana = porSemana.get(sexta);
    const antes = porSemana.get(somarDias(sexta, -7 * SEMANAS_VARIACAO));
    const medida = antes && antes.valor > 0 ? arredondar((semana.valor / antes.valor - 1) * 100, 2) : null;
    return {
      observedAt: sexta,
      ultimoPregao: semana.dia,
      estoque: semana.valor,
      estoque4SemanasAntes: antes ? antes.valor : null,
      medida,
      disponivelEm: semana.disponivelEm,
      disponivelEmEhEstimado: semana.estimado
    };
  });
}

async function carregar(asOf, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  return servico.obterAsOf({ seriesCodes: [SERIE], asOf }, deps);
}

const fator = criarFatorPosicaoSemanal({
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  carregar,
  medir: medirEstoques,
  semanasJanela: 260,
  minimo: 200,
  acimaPressiona: faixa.DIRECAO.BAIXA,
  textos: {
    primeiroPasso: (p) =>
      `O estoque certificado da ICE fechou a semana em ${faixa.fmt(p.estoque, 0)} sacas, contra ${faixa.fmt(p.estoque4SemanasAntes, 0)} ` +
      `4 semanas antes: ${faixa.comSinal(p.medida)}% (A).`,
    abaixo: "o estoque entregável está caindo mais rápido que o normal, aperto na bolsa",
    acima: "o estoque entregável está crescendo mais rápido que o normal, sacas novas aprovadas na certificação",
    subindo: "o estoque está ganhando ritmo de alta (ou perdendo o de queda)",
    caindo: "o estoque está ganhando ritmo de queda (ou perdendo o de alta)",
    rotulosTendencia: { SUBINDO: "Estoque acelerando", CAINDO: "Estoque desacelerando", ESTAVEL: "Estável" }
  },
  apresentacao: {
    quadrosA: [
      { camada: "A", rotulo: "Estoque certificado (ICE)", campo: "estoque", casas: 0, sufixo: "sacas" },
      { camada: "A", rotulo: "Variação em 4 semanas", campo: "medida", casas: 2, sinal: true, unidadeValor: "%" }
    ],
    rotuloMedida: "Variação em 4 semanas",
    unidadeMedida: "%",
    casasMedida: 2,
    tituloAB: "Variação do estoque certificado em 4 semanas",
    nota:
      "Semanal, não é tempo real: o último pregão da semana do relatório diário de estoques certificados da ICE (café " +
      "arábica entregável contra o Coffee C). Mede o estoque da bolsa de Nova York, não o estoque mundial."
  },
  episodios: [],
  cenarios: [
    { valor: -45, valorAnterior: -30, rotulo: "Estoque caindo como poucas vezes, acelerando" },
    { valor: -35, valorAnterior: -40, rotulo: "Queda fora do normal, perdendo força" },
    { valor: 5, valorAnterior: 30, rotulo: "Variação normal, depois de entradas" },
    { valor: 40, valorAnterior: 20, rotulo: "Entradas fora do normal na certificação" }
  ]
});

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIE, METODOLOGIA: fator.METODOLOGIA, medirEstoques, derivarEstoquesCafe: fator.derivar };
