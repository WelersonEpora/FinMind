import { test } from 'node:test'
import assert from 'node:assert/strict'

import { rolagemAoNavegar } from './rolagem-rota.js'

test('rolagemAoNavegar: outra página abre no topo', () => {
  assert.deepEqual(rolagemAoNavegar({ path: '/observaveis' }, { path: '/status-projeto' }), { top: 0 })
})

test('rolagemAoNavegar: mesma página com outra query (abrir/trocar/fechar o documento do modal) mantém a rolagem', () => {
  assert.equal(rolagemAoNavegar({ path: '/status-projeto', query: { doc: 'adr-0027' } }, { path: '/status-projeto', query: {} }), false)
  assert.equal(rolagemAoNavegar({ path: '/status-projeto', query: {} }, { path: '/status-projeto', query: { doc: 'adr-0027' } }), false)
})

test('rolagemAoNavegar: primeira carga (sem rota de origem) abre no topo', () => {
  assert.deepEqual(rolagemAoNavegar({ path: '/status-projeto' }, undefined), { top: 0 })
})
