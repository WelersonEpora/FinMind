import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  desdeDoPeriodo,
  seriesDoGrafico,
  seriesComFaixas,
  formatarQuadro,
  linhaSecundaria,
  parametrosAlterados,
  descreverOrigemParametros,
  periodoDoFator,
  formatarMedida
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

test('formatarQuadro e linhaSecundaria: casas, sinal, unidade e o valor de baixo', () => {
  assert.equal(formatarQuadro(427320, { casas: 0 }), '427.320')
  assert.equal(formatarQuadro(1.86, { casas: 2, sinal: true, unidadeValor: '%' }), '+1,86%')
  assert.equal(formatarQuadro(-922, { casas: 0, sinal: true }), '-922')
  assert.equal(formatarQuadro(null), '-')
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
