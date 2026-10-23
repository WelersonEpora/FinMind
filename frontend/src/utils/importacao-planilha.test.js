import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumoImportacao } from './importacao-planilha.js'

const base = { status: 'success', periodo: { de: '1996-09-02', ate: '2026-10-22' }, valores: { criados: 15012, atualizados: 0, ignorados: 0, falhas: 0 } }

test('resumoImportacao: o período e os contadores, só os que existem', () => {
  assert.equal(resumoImportacao(base), 'Período de 02/09/1996 a 22/10/2026: 15012 novos, 0 já existentes.')
  assert.equal(
    resumoImportacao({ ...base, status: 'partial_success', valores: { criados: 2, atualizados: 1, ignorados: 10, falhas: 3 } }),
    'Período de 02/09/1996 a 22/10/2026: 2 novos, 1 revisados, 10 já existentes, 3 com problema (veja em Execuções).'
  )
})

test('resumoImportacao: a falha diz o motivo', () => {
  assert.equal(resumoImportacao({ ...base, status: 'failed', erro: 'layout mudou' }), 'A importação falhou: layout mudou')
})
