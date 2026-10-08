import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  desdeDoPeriodo,
  celulaPesoFamilia,
  resumoPesos,
  temCalendario,
  seriesDoGrafico,
  seriesComFaixas,
  rotulosDasFaixas,
  formatarQuadro,
  linhaSecundaria,
  parametrosAlterados,
  descreverOrigemParametros,
  periodoDoFator,
  formatarMedida,
  MESES_CURTOS,
  indiceDoMes,
  classePeso,
  tomRelacao
} from './metodologia.js'

const PARAMS = { limiarModeradoPct: 3, limiarFortePct: 10, semanasTendencia: 4, limiarTendenciaPp: 2 }

test('desdeDoPeriodo: anos para trás, e o histórico inteiro sem data', () => {
  assert.equal(desdeDoPeriodo('1A', '2026-10-02'), '2025-10-02')
  assert.equal(desdeDoPeriodo('10A', '2026-10-02'), '2016-10-02')
  assert.equal(desdeDoPeriodo('TUDO', '2026-10-02'), undefined)
  assert.equal(desdeDoPeriodo('XYZ', '2026-10-02'), undefined)
})

test('seriesDoGrafico: as séries da apresentação, só onde existe o campo exigido, com os rótulos', () => {
  const grafico = {
    exigeCampo: 'media',
    series: [
      { campo: 'valor', rotulo: 'Valor (A)' },
      { campo: 'media', rotulo: 'Média (B)' }
    ]
  }
  const { linhas, rotulos } = seriesDoGrafico(
    [
      { observedAt: '2026-09-18', valor: 10, media: null },
      { observedAt: '2026-09-25', valor: 12, media: 11 }
    ],
    grafico
  )
  assert.deepEqual(linhas, [
    { data: '2026-09-25', valor: 12, serie: 'valor' },
    { data: '2026-09-25', valor: 11, serie: 'media' }
  ])
  assert.deepEqual(rotulos, { valor: 'Valor (A)', media: 'Média (B)' })
})

test('seriesComFaixas: a medida e os quatro limiares, só onde há medida', () => {
  const linhas = seriesComFaixas([{ observedAt: '2026-09-25', desvioPct: 1.86 }, { observedAt: '2026-09-18', desvioPct: null }], 'desvioPct', PARAMS)
  assert.deepEqual(linhas.map((l) => l.valor), [1.86, 10, 3, -3, -10])
})

test('seriesComFaixas e rotulosDasFaixas: um fator com regra própria desenha só os limiares dele (o clima do milho)', () => {
  const limiares = [
    { chave: 'limiarBaixaPp', sinal: 1, rotulo: 'Limiar de baixa' },
    { chave: 'limiarAltaPp', sinal: -1, rotulo: 'Limiar de alta' }
  ]
  const linhas = seriesComFaixas([{ observedAt: '2026-07-19', desvioPp: -8 }], 'desvioPp', { limiarBaixaPp: 3, limiarAltaPp: 5 }, limiares)
  assert.deepEqual(linhas.map((l) => [l.serie, l.valor]), [['medida', -8], ['limiar0', 3], ['limiar1', -5]])
  assert.deepEqual(rotulosDasFaixas('Desvio (B)', limiares), { medida: 'Desvio (B)', limiar0: 'Limiar de baixa', limiar1: 'Limiar de alta' })
  assert.equal(rotulosDasFaixas('Desvio (B)').neutraAcima, 'Faixa neutra (acima)')
})

test('formatarQuadro e linhaSecundaria: casas, sinal, unidade e o valor de baixo', () => {
  assert.equal(formatarQuadro(427320, { casas: 0 }), '427.320')
  assert.equal(formatarQuadro(1.86, { casas: 2, sinal: true, unidadeValor: '%' }), '+1,86%')
  assert.equal(formatarQuadro(-922, { casas: 0, sinal: true }), '-922')
  assert.equal(formatarQuadro(null), '-')
  // Um ano (o custo do café da Conab): sem o separador de milhar.
  assert.equal(formatarQuadro(2025, { agrupar: false }), '2025')
  assert.equal(linhaSecundaria({}, { sufixo: 'mil barris' }), 'mil barris')
  assert.equal(
    linhaSecundaria({ recorde: 13955 }, { secundario: { campo: 'recorde', casas: 0, prefixo: 'recorde:', sufixo: 'mil barris/dia' } }),
    'recorde: 13.955 mil barris/dia'
  )
})

test('periodoDoFator: semana por padrão; mês num fator mensal', () => {
  assert.equal(periodoDoFator('SEMANAL').referencia('2026-10-02'), 'Semana encerrada em 02/10/2026')
  assert.equal(periodoDoFator(undefined).janela, 'semanas')
  const mensal = periodoDoFator('MENSAL')
  assert.equal(mensal.referencia('2026-07-01'), 'Mês de 07/2026')
  assert.equal(mensal.data('2019-06-01'), '06/2019')
  assert.equal(mensal.janela, 'meses')
  const trimestral = periodoDoFator('TRIMESTRAL')
  assert.equal(trimestral.referencia('2026-04-01'), 'Trimestre de 2º/2026')
  assert.equal(trimestral.data('2025-10-01'), '4º/2025')
  assert.equal(trimestral.janela, 'trimestres')
})

test('parametrosAlterados e descreverOrigemParametros', () => {
  assert.equal(parametrosAlterados({ ...PARAMS }, PARAMS), false)
  assert.equal(parametrosAlterados({ ...PARAMS, limiarModeradoPct: '5' }, PARAMS), true)
  assert.equal(descreverOrigemParametros(null), 'Padrão do FinMind (nenhum ajuste salvo ainda)')
  assert.equal(
    descreverOrigemParametros({ versao: 2, alteradoPor: { nome: 'Welerson' }, alteradoEm: '2026-10-02T18:00:00Z' }),
    'Versão 2, salva por Welerson em 02/10/2026'
  )
})

test('formatarMedida: sinal, duas casas e a unidade (% colado, as outras com espaço)', () => {
  assert.equal(formatarMedida(1.862), '+1,86%')
  assert.equal(formatarMedida(-20.3, 'pontos'), '-20,30 pontos')
  assert.equal(formatarMedida(0.93, 'p.p.'), '+0,93 p.p.')
  assert.equal(formatarMedida(null), '-')
})

test('indiceDoMes: o mês de 0 a 11 de uma data; nada para data inválida', () => {
  assert.equal(MESES_CURTOS.length, 12)
  assert.equal(indiceDoMes('2026-10-04'), 9)
  assert.equal(indiceDoMes('2026-01-31'), 0)
  assert.equal(indiceDoMes(''), null)
  assert.equal(indiceDoMes('2026-13-01'), null)
})

test('classePeso: Alto, Médio e Baixo; o resto sem classe', () => {
  assert.equal(classePeso('Alto'), 'alto')
  assert.equal(classePeso('Médio'), 'medio')
  assert.equal(classePeso('Baixo'), 'baixo')
  assert.equal(classePeso('Médio-Alto'), '')
})

test('tomRelacao: os símbolos da matriz do especialista', () => {
  assert.equal(tomRelacao('++'), 'positiva-forte')
  assert.equal(tomRelacao('+/++'), 'positiva-forte')
  assert.equal(tomRelacao('+'), 'positiva')
  assert.equal(tomRelacao('(+)'), 'positiva-fraca')
  assert.equal(tomRelacao('−'), 'inversa')
  assert.equal(tomRelacao('(−)'), 'inversa-fraca')
  assert.equal(tomRelacao('(±)'), 'regime')
  assert.equal(tomRelacao('0'), 'nula')
})

test('periodoDoFator: o levantamento e a publicação, com a data exata', () => {
  assert.equal(periodoDoFator('LEVANTAMENTO').referencia('2026-09-24'), 'Levantamento de 24/09/2026')
  assert.equal(periodoDoFator('PUBLICACAO').referencia('2026-07-31'), 'Publicação de 31/07/2026')
  assert.equal(periodoDoFator('PUBLICACAO').janela, 'publicações')
})

test('celulaPesoFamilia: o peso em %, "—" fora do horizonte e os membros quando a família não entra inteira', () => {
  const oferta = {
    fatores: ['F_CLIMA', 'F_SAFRA', 'F_ESTOQUES'],
    pesos: { IMEDIATO: 60, CURTO: 60, LONGO: 50 },
    composicao: { IMEDIATO: ['F_SAFRA'], CURTO: ['F_CLIMA', 'F_SAFRA', 'F_ESTOQUES'], LONGO: ['F_SAFRA'] }
  }
  const siglas = { F_CLIMA: 'F1', F_SAFRA: 'F2', F_ESTOQUES: 'F3' }
  assert.deepEqual(celulaPesoFamilia(oferta, 'IMEDIATO', siglas), { texto: '60%', membros: 'F2' })
  assert.deepEqual(celulaPesoFamilia(oferta, 'CURTO', siglas), { texto: '60%', membros: null })
  assert.deepEqual(celulaPesoFamilia({ fatores: ['X'], pesos: { MEDIO: 0 }, composicao: null }, 'MEDIO'), { texto: '—', membros: null })
  assert.deepEqual(celulaPesoFamilia({ fatores: ['X'], pesos: { MEDIO: 33 }, composicao: null }, 'MEDIO'), { texto: '33%', membros: null })
})

test('resumoPesos: o que vai ao prompt, por ativo', () => {
  const semPeso = [{ codigo: 'A' }]
  const orientacao = [{ noFinMind: { situacao: 'ORIENTACAO' } }]
  assert.equal(resumoPesos({ situacao: null, fatores: semPeso, pares: [], agregacao: [] }), 'No prompt: o peso do FEL 1.')
  // A soja (ADR 0116): o peso fixo do Comitê e a relevância por horizonte.
  assert.match(resumoPesos({ relevancia: { fatores: [] }, fatores: semPeso, pares: [], agregacao: [] }), /^No prompt: o peso fixo de cada fator \(do Comitê\) e a relevância/)
  assert.equal(
    resumoPesos({ situacao: 'PROPOSTA', fatores: [{ codigo: 'A', meses: [] }], noPrompt: { autorizacao: 'x' }, pares: [], agregacao: orientacao }),
    'No prompt: o calendário de pesos e as regras do especialista, como orientação.'
  )
  assert.equal(
    resumoPesos({ situacao: 'PROPOSTA', fatores: semPeso, noPrompt: null, pares: [{ noPrompt: 'x' }], agregacao: orientacao, agregacaoFinMind: {} }),
    'No prompt: o peso do FEL 1 e as relações e regras do especialista, como orientação; e a leitura agregada do motor (proposta do FinMind).'
  )
})

test('temCalendario: só com peso próprio do especialista em algum fator', () => {
  assert.equal(temCalendario({ fatores: [{ codigo: 'A' }] }), false)
  assert.equal(temCalendario({ fatores: [{ codigo: 'A' }, { codigo: 'B', fixo: 'Alto' }] }), true)
})
