import { test } from 'node:test'
import assert from 'node:assert/strict'

import { somarDias, semanaDe, formatarDataLonga, formatarValor, formatarVariacao, iconeAtivo } from './centro-decisao.js'

test('somarDias atravessa mês e ano', () => {
  assert.equal(somarDias('2026-10-02', -3), '2026-09-29')
  assert.equal(somarDias('2026-12-30', 3), '2027-01-02')
})

test('semanaDe: domingo a sábado da data, com os dias futuros marcados', () => {
  const semana = semanaDe('2026-10-02', '2026-10-02')
  assert.deepEqual(
    semana.map((d) => d.data),
    ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']
  )
  assert.equal(semana[0].diaSemana, 'DOM')
  assert.equal(semana[5].selecionada, true)
  assert.equal(semana[5].futuro, false)
  assert.equal(semana[6].futuro, true)
  assert.equal(semana[6].dia, 3)
})

test('semanaDe num domingo começa nele mesmo', () => {
  assert.equal(semanaDe('2026-09-27', '2026-10-02')[0].data, '2026-09-27')
})

test('formatarDataLonga e formatarValor em pt-BR', () => {
  assert.equal(formatarDataLonga('2026-10-02'), 'sex., 2 de out.')
  assert.equal(formatarValor(3838.5, 2), '3.838,50')
})

test('formatarVariacao: sinal, direção e estável perto de zero', () => {
  assert.deepEqual(formatarVariacao(22.17), { texto: '+22,2%', direcao: 'alta' })
  assert.deepEqual(formatarVariacao(-0.42), { texto: '−0,4%', direcao: 'queda' })
  assert.deepEqual(formatarVariacao(0.01), { texto: '0,0%', direcao: 'estavel' })
  assert.equal(formatarVariacao(null), null)
})

test('iconeAtivo: um ícone por ativo e um genérico para ativo desconhecido', () => {
  assert.equal(iconeAtivo('MILHO'), '🌽')
  assert.equal(iconeAtivo('CAFE'), '☕')
  assert.equal(iconeAtivo('NOVO'), '📈')
})
