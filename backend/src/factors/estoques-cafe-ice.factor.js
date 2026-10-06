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
// CONTEXTO, fora da conta (ADR 0085): as sacas aguardando classificação (ICE.CAFE_C.ESTOQUE.TOTAL.PENDENTE, o mesmo
// relatório, ADR 0061) e o estoque total dos portos europeus (ECF.CAFE.ESTOQUE_TOTAL, mensal, o último dado publicado até
// a semana). Vão ao prompt ao lado da medida, sem pressão própria: no histórico (ICO e ECF, 2012 a 2026) a condição pela
// ECF não teve amostra para entrar na regra. O nível do estoque também fica como contexto (o valor da camada A). O
// estudo diz: o estoque certificado é só o café entregável na ICE, não o estoque mundial (esse fica no
// balanço do USDA). Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "estoques_cafe_ice_certificado";
// v2 (2026-10-06): as sacas aguardando classificação e os portos europeus como contexto (ADR 0085).
// v3 (2026-10-06): a ECF pelas versões publicadas até a semana (um mês revisado depois aparecia sumido; ADR 0085).
const FACTOR_VERSION = 3;

const SERIE = "ICE.CAFE_C.ESTOQUE.TOTAL.CERTIFICADO";
const SERIE_PENDENTE = "ICE.CAFE_C.ESTOQUE.TOTAL.PENDENTE";
const SERIE_ECF = "ECF.CAFE.ESTOQUE_TOTAL";
const SEMANAS_VARIACAO = 4;

// O último pregão de cada semana de uma série do relatório da ICE: sexta -> { dia, valor, disponivelEm, estimado }.
function ultimoPregaoPorSemana(linhasAsOf, serie) {
  const porSemana = new Map();
  for (const linha of linhasAsOf) {
    if (linha.seriesCode !== serie) continue;
    const sexta = sextaDaSemana(linha.observedAt);
    const atual = porSemana.get(sexta);
    if (!atual || linha.observedAt > atual.dia) {
      porSemana.set(sexta, { dia: linha.observedAt, valor: linha.value, disponivelEm: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
    }
  }
  return porSemana;
}

// Função PURA: as linhas de obterAsOf() -> um registro por semana (o último pregão), com a variação em 4 semanas e o
// contexto (as pendentes da mesma semana e o último mês da ECF publicado até ela).
function medirEstoques(linhasAsOf) {
  const porSemana = ultimoPregaoPorSemana(linhasAsOf, SERIE);
  const pendentes = ultimoPregaoPorSemana(linhasAsOf, SERIE_PENDENTE);
  // Todas as versões da ECF (obterVersoesAsOf): em cada semana, de cada mês, a versão mais nova publicada até ela.
  const ecf = linhasAsOf
    .filter((l) => l.seriesCode === SERIE_ECF)
    .map((l) => ({ mes: l.observedAt.slice(0, 7), valor: l.value, em: new Date(l.publishedAt).toISOString() }))
    .sort((a, b) => a.mes.localeCompare(b.mes) || a.em.localeCompare(b.em));
  return [...porSemana.keys()].sort().map((sexta) => {
    const semana = porSemana.get(sexta);
    const antes = porSemana.get(somarDias(sexta, -7 * SEMANAS_VARIACAO));
    const medida = antes && antes.valor > 0 ? arredondar((semana.valor / antes.valor - 1) * 100, 2) : null;
    const ate = new Date(semana.disponivelEm).toISOString();
    const porMes = new Map();
    for (const e of ecf) if (e.em <= ate) porMes.set(e.mes, e);
    const ecfConhecida = [...porMes.values()];
    const ecfUltimo = ecfConhecida.at(-1) || null;
    const ecfAnterior = ecfConhecida.at(-2) || null;
    return {
      observedAt: sexta,
      ultimoPregao: semana.dia,
      estoque: semana.valor,
      estoque4SemanasAntes: antes ? antes.valor : null,
      medida,
      pendente: pendentes.get(sexta)?.valor ?? null,
      pendente4SemanasAntes: pendentes.get(somarDias(sexta, -7 * SEMANAS_VARIACAO))?.valor ?? null,
      ecfMes: ecfUltimo?.mes ?? null,
      ecfToneladas: ecfUltimo?.valor ?? null,
      ecfToneladasAnterior: ecfAnterior?.valor ?? null,
      disponivelEm: semana.disponivelEm,
      disponivelEmEhEstimado: semana.estimado
    };
  });
}

async function carregar(asOf, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [ice, ecf] = await Promise.all([
    servico.obterAsOf({ seriesCodes: [SERIE, SERIE_PENDENTE], asOf }, deps),
    servico.obterVersoesAsOf({ seriesCodes: [SERIE_ECF], asOf }, deps)
  ]);
  return [...ice, ...ecf];
}

// O contexto, fora da conta (ADR 0085): só o que existe na semana.
function contexto(p) {
  const partes = [];
  if (p.pendente !== null && p.pendente !== undefined) {
    partes.push(
      `${faixa.fmt(p.pendente, 0)} sacas aguardando classificação` +
        (p.pendente4SemanasAntes !== null ? ` (${faixa.fmt(p.pendente4SemanasAntes, 0)} 4 semanas antes)` : "")
    );
  }
  if (p.ecfToneladas !== null && p.ecfToneladas !== undefined) {
    const mes = `${p.ecfMes.slice(5, 7)}/${p.ecfMes.slice(0, 4)}`;
    partes.push(
      `portos europeus (ECF) com ${faixa.fmt(p.ecfToneladas, 0)} t em ${mes}` +
        (p.ecfToneladasAnterior !== null ? ` (${faixa.fmt(p.ecfToneladasAnterior, 0)} t no mês anterior)` : "")
    );
  }
  return partes.length ? ` Contexto, fora da conta: ${partes.join("; ")}.` : "";
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
      `4 semanas antes: ${faixa.comSinal(p.medida)}% (A).` +
      contexto(p),
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

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIE, SERIE_PENDENTE, SERIE_ECF, METODOLOGIA: fator.METODOLOGIA, medirEstoques, derivarEstoquesCafe: fator.derivar };
