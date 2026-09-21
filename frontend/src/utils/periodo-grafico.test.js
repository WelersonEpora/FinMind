import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OPCOES_PERIODO_GRAFICO, PERIODO_PADRAO_DIAS, periodoPadraoDias } from './periodo-grafico.js'

test('série anual abre em 10 anos; as demais frequências abrem em 30 dias', () => {
  assert.equal(periodoPadraoDias('ANUAL'), 3650)
  for (const frequencia of ['DIARIA', 'SEMANAL', 'MENSAL', undefined, null]) {
    assert.equal(periodoPadraoDias(frequencia), PERIODO_PADRAO_DIAS, String(frequencia))
  }
})

test('todo período padrão é uma das opções do seletor (senão nenhum botão aparece ativo)', () => {
  for (const frequencia of ['DIARIA', 'SEMANAL', 'MENSAL', 'ANUAL']) {
    assert.ok(OPCOES_PERIODO_GRAFICO.some((opcao) => opcao.dias === periodoPadraoDias(frequencia)), frequencia)
  }
})

test('o seletor termina em "Tudo" (sem data inicial) e não repete períodos', () => {
  const ultima = OPCOES_PERIODO_GRAFICO.at(-1)
  assert.deepEqual(ultima, { dias: null, label: 'Tudo' })
  assert.equal(new Set(OPCOES_PERIODO_GRAFICO.map((o) => o.dias)).size, OPCOES_PERIODO_GRAFICO.length)
})
