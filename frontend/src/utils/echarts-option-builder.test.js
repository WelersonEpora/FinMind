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

const pontosDeNSeries = (n) => Array.from({ length: n }, (_, i) => ({ data: '2026-09-01', valor: i + 1, serie: `s${i}` }))

test('construirOpcaoLineChart dá uma cor diferente a cada série enquanto a paleta permite', () => {
  const option = construirOpcaoLineChart({ pontos: pontosDeNSeries(6), unidade: 'Mt' })
  const cores = option.series.map((s) => s.lineStyle.color)

  assert.equal(new Set(cores).size, 6, 'nenhuma cor repetida')
  assert.ok(option.series.every((s) => s.lineStyle.type === 'solid'))
  assert.equal(option.legend.type, undefined, 'até 8 séries a legenda cabe numa linha')
})

test('construirOpcaoLineChart repete cores só depois de esgotar a paleta e tracejando, com legenda rolável', () => {
  const option = construirOpcaoLineChart({ pontos: pontosDeNSeries(14), unidade: 'Mt' })
  const solidas = option.series.filter((s) => s.lineStyle.type === 'solid')
  const tracejadas = option.series.filter((s) => s.lineStyle.type === 'dashed')

  assert.equal(new Set(solidas.map((s) => s.lineStyle.color)).size, solidas.length, 'as sólidas têm cores todas distintas')
  assert.equal(tracejadas.length, 14 - solidas.length)
  assert.ok(tracejadas.length > 0)
  assert.equal(option.legend.type, 'scroll')
})
