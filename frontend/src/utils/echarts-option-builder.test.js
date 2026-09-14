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
