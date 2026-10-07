import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerAtivoPreferido, salvarAtivoPreferido } from './ativo-preferido.js'

function storageFalso() {
  const dados = new Map()
  return { getItem: (k) => (dados.has(k) ? dados.get(k) : null), setItem: (k, v) => dados.set(k, String(v)) }
}

test('ativo preferido: guarda o último e lê de volta; vazio não grava', () => {
  const storage = storageFalso()
  assert.equal(lerAtivoPreferido(storage), null)
  salvarAtivoPreferido('PETROLEO', storage)
  assert.equal(lerAtivoPreferido(storage), 'PETROLEO')
  salvarAtivoPreferido('', storage)
  assert.equal(lerAtivoPreferido(storage), 'PETROLEO')
})

test('ativo preferido: armazenamento bloqueado não quebra a tela', () => {
  const bloqueado = {
    getItem() {
      throw new Error('SecurityError')
    },
    setItem() {
      throw new Error('QuotaExceededError')
    }
  }
  assert.equal(lerAtivoPreferido(bloqueado), null)
  assert.doesNotThrow(() => salvarAtivoPreferido('OURO', bloqueado))
  assert.equal(lerAtivoPreferido(null), null)
})
