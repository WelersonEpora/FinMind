import { test } from 'node:test'
import assert from 'node:assert/strict'

import { construirOpcaoLineChart } from './echarts-option-builder.js'

test('construirOpcaoLineChart converte pontos em pares [timestamp, valor] ordenados por data', () => {
  const option = construirOpcaoLineChart({
    pontos: [
      { data: '2026-09-11', valor: 5.09 },
      { data: '2026-09-04', valor: 5.12 }
    ],
    unidade: 'R$/US$'
  })

  const [serie] = option.series
  assert.equal(serie.data.length, 2)
  assert.ok(serie.data[0][0] < serie.data[1][0])
  assert.equal(serie.data[0][1], 5.12)
  assert.equal(serie.data[1][1], 5.09)
})

test('construirOpcaoLineChart descarta pontos com valor não numérico', () => {
  const option = construirOpcaoLineChart({
    pontos: [
      { data: '2026-09-11', valor: 5.09 },
      { data: '2026-09-12', valor: 'não é número' }
    ],
    unidade: 'R$/US$'
  })

  assert.equal(option.series[0].data.length, 1)
})

test('construirOpcaoLineChart sem `serie` gera uma única série sem legenda', () => {
  const option = construirOpcaoLineChart({
    pontos: [{ data: '2026-09-11', valor: 5.09 }],
    unidade: 'R$/US$'
  })

  assert.equal(option.series.length, 1)
  assert.equal(option.legend, undefined)
})

test('construirOpcaoLineChart agrupa pontos por `serie` em séries separadas, com legenda', () => {
  const option = construirOpcaoLineChart({
    pontos: [
      { data: '2026-09-15', valor: 13.75, serie: 'meta' },
      { data: '2026-09-16', valor: 13.75, serie: 'meta' },
      { data: '2026-09-15', valor: 13.9, serie: 'realizada' }
    ],
    unidade: '% a.a.',
    seriesLabels: { meta: 'Meta (Copom)', realizada: 'Realizada' }
  })

  assert.equal(option.series.length, 2)
  assert.ok(option.legend)

  const meta = option.series.find((s) => s.name === 'Meta (Copom)')
  const realizada = option.series.find((s) => s.name === 'Realizada')
  assert.equal(meta.data.length, 2)
  assert.equal(realizada.data.length, 1)
  assert.notEqual(meta.lineStyle.color, realizada.lineStyle.color)
})
